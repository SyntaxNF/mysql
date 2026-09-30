// Repository conventions layered on the real parser AST; not a SQL validator/binder.
export function inspectDocument(document, NodeType, fixedSnippets = []) {
    const errors = [];
    if (!Array.isArray(fixedSnippets) || fixedSnippets.some(s => typeof s !== 'string' || !s.length) || new Set(fixedSnippets).size !== fixedSnippets.length) throw new Error('Fixed snippets must be unique nonempty strings');
    const definitions = new Map();
    const cases = new Set();
    const counts = {};
    const roots = [];
    let active;
    const fail = (block, message) => errors.push(`line ${block.startLine}: ${message}`);
    const variables = (node, content) => {
        const spans = fixedSnippets.flatMap(snippet => {
            const found = [];
            for (let start = content.indexOf(snippet); start >= 0; start = content.indexOf(snippet, start + snippet.length)) found.push([start, start + snippet.length]);
            return found;
        });
        const result = [];
        const visit = n => {
            if (n.type === NodeType.VARIABLE && !spans.some(([start, end]) => start <= n.start && n.end <= end)) result.push(n.content);
            n.children?.forEach(visit);
        };
        visit(node);
        return result;
    };
    for (const snippet of fixedSnippets) if (!document.blocks.some(block => block.content.includes(snippet))) errors.push(`stale fixed-literal contract: ${snippet}`);
    for (const [index, block] of document.blocks.entries()) {
        const comments = block.comment.split('\n').filter(Boolean);
        if (index === 0 && /^# https:\/\/dev\.mysql\.com\/doc\/refman\/8\.4\/en\/[a-z0-9-]+\.html$/.test(block.comment) && !block.content) continue;
        if (comments.length) {
            if (comments.length !== 1) fail(block, 'expected one directive per physical block');
            const match = /^# (CASE|WHERE|PARTOFIS|ONEOFIS|STATEMENT) ([A-Za-z][A-Za-z0-9_]*(?:, [A-Za-z][A-Za-z0-9_]*)*)$/.exec(comments[0]);
            if (!match) { fail(block, 'unknown or malformed directive'); active = undefined; continue; }
            const [, kind, names] = match;
            const aliases = names.split(', ');
            const name = aliases[0];
            if (kind === 'CASE' && aliases.length !== 1) fail(block, 'CASE cannot have aliases');
            counts[kind] = (counts[kind] ?? 0) + 1;
            if (aliases.some(alias => !(kind === 'CASE' ? /^[A-Z][A-Z0-9_]*$/ : /^[a-z][a-z0-9_]*$/).test(alias))) fail(block, 'incorrect directive name casing');
            active = { kind, name, variables: [], blocks: 0 };
            if (kind === 'CASE') {
                if (cases.has(name)) fail(block, `duplicate CASE ${name}`);
                cases.add(name);
                roots.push(active);
            } else {
                for (const alias of aliases) {
                    if (definitions.has(alias)) fail(block, `duplicate definition ${alias}`);
                    definitions.set(alias, active);
                }
            }
        } else if (!active && roots.length === 0 && definitions.size === 0) {
            active = { kind: 'IMPLICIT', name: '<default>', variables: [], blocks: 0 };
            roots.push(active);
        } else if (!active || !['PARTOFIS', 'ONEOFIS'].includes(active.kind)) {
            fail(block, 'unowned continuation block (only PARTOFIS/ONEOFIS allow alternatives)');
        }
        if (!block.content.trim()) fail(block, 'empty definition block');
        if (active) {
            active.blocks++;
            active.variables.push(...variables(block.ast, block.content));
            if (active.kind === 'STATEMENT' && !block.content.split('\n').every(line => /^[A-Z][A-Z0-9_]*(?: [A-Z][A-Z0-9_]*)*$/.test(line))) fail(block, 'STATEMENT must name a statement category');
        }
        const visit = (node, parent) => {
            if (node.type === NodeType.SPLIT) fail(block, 'unescaped alternative separator outside an enumeration');
            if (node.type === NodeType.REPEAT && parent?.type !== NodeType.LOOP) fail(block, 'repeat marker outside a postfix loop');
            if (node.type === NodeType.GROUP && !node.content.trim()) fail(block, 'empty alternative');
            const children = node.children ?? [];
            children.forEach((child, i) => {
                if (child.type === NodeType.LOOP) {
                    const previous = children.slice(0, i).findLast(n => ![NodeType.BLANK, NodeType.WRAP].includes(n.type));
                    if (!previous) fail(block, 'postfix loop has no preceding item');
                    else if (![NodeType.VARIABLE, NodeType.ENUM, NodeType.OPTIONAL].includes(previous.type)) fail(block, 'postfix loop must repeat a named helper or explicit group, not a trailing literal');
                }
                visit(child, node);
            });
        };
        visit(block.ast);
    }
    if (!roots.length) errors.push('no statement entry point');
    const reachable = new Set();
    const visitName = name => {
        if (!definitions.has(name) || reachable.has(name)) return;
        reachable.add(name);
        definitions.get(name).variables.forEach(visitName);
    };
    roots.forEach(root => root.variables.forEach(visitName));
    for (const name of definitions.keys()) if (![...reachable].some(reachableName => definitions.get(reachableName) === definitions.get(name))) errors.push(`unreachable local definition ${name}`);
    const allVariables = [...roots, ...definitions.values()].flatMap(d => d.variables);
    const inputs = [...new Set(allVariables.filter(name => !definitions.has(name)))].sort();
    const localReferences = [...new Set(allVariables.filter(name => definitions.has(name)))].sort();
    const recursiveDefinitions = [];
    for (const name of definitions.keys()) {
        const seen = new Set();
        const reaches = current => {
            if (!definitions.has(current) || seen.has(current)) return false;
            seen.add(current);
            return definitions.get(current).variables.some(next => next === name || reaches(next));
        };
        if (reaches(name)) recursiveDefinitions.push(name);
    }
    return { errors, counts, contentBlocks: document.blocks.filter(b => b.content.trim()).length, localReferences, inputs, recursiveDefinitions };
}
