// Same baseline contract in all four SNF repositories. Keep copies in sync.
// Vendor URLs, directive semantics and SQL fixtures stay in their own validators.
export function inspectContract(document, parser) {
    const { NodeType: T, exchangeLoopNode, exchangeQuoteNode } = parser;
    const errors = [];
    const fail = message => errors.push(message);
    const source = document.content;
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
        if (block.ast.type !== T.ROOT || block.ast.raw !== block.content) fail(`block ROOT mismatch${at}`);
        visit(block.ast, (node, parent) => {
            if (!Number.isInteger(node.start) || !Number.isInteger(node.end) || node.start < 0 || node.end < node.start || node.end > block.content.length || block.content.slice(node.start, node.end) !== node.raw) fail(`AST raw/span mismatch${at}`);
            if (parent && (node.start < parent.start || node.end > parent.end)) fail(`child escapes parent span${at}`);
            if (node.name !== undefined) fail(`unexpected parser naming metadata${at}`);
            if (node.type === T.SPLIT) fail(`unconsumed alternative separator${at}`);
            if (node.type === T.ENUM && (!node.raw.startsWith('{') || !node.raw.endsWith('}') || !node.children?.length || node.children.some(child => child.type !== T.GROUP))) fail(`ENUM requires explicit braces and GROUP children${at}`);
            if (node.type === T.GROUP && (parent?.type !== T.ENUM || !significant(node.children).length)) fail(`GROUP requires ENUM parent and a nonempty alternative${at}`);
            if (node.type === T.OPTIONAL && (!node.raw.startsWith('[') || !node.raw.endsWith(']'))) fail(`OPTIONAL requires explicit brackets${at}`);
            if (node.type === T.REPEAT && parent?.type !== T.LOOP) fail(`orphan repeat marker${at}`);
        });
        // Walkers return new trees. Validate binding separately from original spans.
        visit(exchangeLoopNode(exchangeQuoteNode(block.ast)), node => {
            const children = significant(node.children);
            if (node.type === T.LOOP && (!Array.isArray(node.ast) || children.length !== 1 || ![T.VARIABLE, T.ENUM, T.OPTIONAL].includes(children[0]?.type))) fail(`postfix LOOP must bind one complete member${at}`);
            if (node.type !== T.OPTIONAL || children.length !== 1) return;
            let child = children[0];
            while ([T.ENUM, T.GROUP].includes(child.type) && significant(child.children).length === 1) child = significant(child.children)[0];
            if (child.type === T.LOOP) fail(`redundant pure-LOOP optional${at}`);
        });
    }
    return errors;
}
