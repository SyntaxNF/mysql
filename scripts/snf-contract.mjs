// Same baseline contract in all four SNF repositories. Keep copies in sync.
// Vendor URLs and SQL fixtures stay in their own validators.
export function inspectContract(document, parser) {
    const { NodeType: T } = parser;
    const errors = [];
    const fail = message => errors.push(message);
    const source = document.content;
    const ids = new Set();
    const significant = nodes => (nodes ?? []).filter(node => ![T.BLANK, T.WRAP].includes(node.type));
    const visit = (node, fn, parent) => {
        fn(node, parent);
        node.children?.forEach(child => visit(child, fn, node));
    };
    if (!source.endsWith('\n')) fail('missing final newline');
    if (document.lines.map(line => line.content + line.ending).join('') !== source) fail('physical round-trip mismatch');
    document.lines.forEach((line, index) => {
        if (line.line !== index + 1 || source.slice(line.start, line.end) !== line.content + line.ending) fail(`line span mismatch at line ${index + 1}`);
        if (/\t| +$/.test(line.content) || line.content.match(/^ */)[0].length % 4) fail(`whitespace/indentation at line ${index + 1}`);
    });
    for (const block of document.blocks) {
        const at = ` at block line ${block.startLine}`;
        if (source.slice(block.start, block.end) !== block.lines.map(line => line.content + line.ending).join('')) fail(`block span mismatch${at}`);
    }
    const definitions = new Map(document.definitions.flatMap(definition => definition.names.map(name => [name, definition])));
    for (const item of [...document.entries, ...document.definitions]) {
        visit(item.ast, (node, parent) => {
            const block = document.blocks[node.sourceBlock];
            const at = ` at block line ${block?.startLine}`;
            if (!block || !Number.isInteger(node.start) || !Number.isInteger(node.end) || node.start < 0 || node.end < node.start || node.end > block.content.length || (!node.synthetic && block.content.slice(node.start, node.end) !== node.raw)) fail(`AST raw/span mismatch${at}`);
            if (!/^[A-Z]{2}[0-9A-F]{2}-[0-9A-F]{4}-[0-9A-F]{32}-[0-9A-F]{4}$/.test(node.uid ?? '')) fail(`missing or invalid parser uid${at}`);
            else if (ids.has(node.uid)) fail(`duplicate parser uid${at}`);
            ids.add(node.uid);
            if ([T.VARIABLE, T.OPTIONAL, T.ENUM, T.LOOP, T.REFERENCE, T.STATEMENT].includes(node.type)) {
                const ownName = [T.VARIABLE, T.REFERENCE, T.STATEMENT].includes(node.type);
                if (typeof node.name !== 'string' || !node.name || node.name !== (ownName ? node.content : node.name.toUpperCase())) fail(`missing or invalid parser name${at}`);
            } else if (node.name !== undefined) fail(`unexpected parser naming metadata${at}`);
            if ([T.SPLIT,T.REPEAT,T.QUOTE,T.DOUBLEQUOTE].includes(node.type) || Object.hasOwn(node,'ast')) fail(`unfinished syntax node${at}`);
            if (node.type === T.ENUM && ((!node.synthetic && (!node.raw.startsWith('{') || !node.raw.endsWith('}'))) || !node.children?.length || node.children.some(child => child.type !== T.GROUP))) fail(`ENUM requires explicit braces or a compiled definition and GROUP children${at}`);
            if (node.type === T.GROUP && (parent?.type !== T.ENUM || !significant(node.children).length)) fail(`GROUP requires ENUM parent and a nonempty alternative${at}`);
            if (node.type === T.OPTIONAL && (!node.raw.startsWith('[') || !node.raw.endsWith(']'))) fail(`OPTIONAL requires explicit brackets${at}`);
            if (node.type === T.LOOP && (typeof node.separator !== 'string' || node.children?.length !== 1)) fail(`postfix LOOP must bind one complete member${at}`);
            if (node.type === T.QUOTED && (!['"', "'"].includes(node.quote) || !node.children)) fail(`invalid quoted sequence${at}`);
            const definition = definitions.get(node.binding?.name);
            if (node.type === T.VARIABLE && definitions.has(node.content)) fail(`unexpanded local definition${at}`);
            if (node.type === T.COLLECTION && (!definition || definition.recursive || definition.kind === 'STATEMENT' || definition.kind !== node.binding.kind)) fail(`invalid expanded definition binding${at}`);
            if (node.type === T.REFERENCE && (!definition?.recursive || node.target !== definition.ast.uid || definition.kind !== node.binding.kind)) fail(`unresolved or incorrect recursive reference${at}`);
            if (node.type === T.STATEMENT && node.binding && (definition?.kind !== 'STATEMENT' || node.binding.kind !== 'STATEMENT' || JSON.stringify(node.categories) !== JSON.stringify(definition.ast.categories))) fail(`invalid statement binding${at}`);
            if (node.type === T.STATEMENT && !Array.isArray(node.categories)) fail(`missing statement categories${at}`);
            const children = significant(node.children);
            if (node.type !== T.OPTIONAL || children.length !== 1) return;
            let child = children[0];
            while ([T.ENUM, T.GROUP].includes(child.type) && significant(child.children).length === 1) child = significant(child.children)[0];
            if (child.type === T.LOOP) fail(`redundant pure-LOOP optional${at}`);
        });
    }
    return errors;
}
