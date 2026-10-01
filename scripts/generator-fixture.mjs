// A deliberately small fixture renderer for the documented generator contract.
// This is NOT the downstream SQL generator or an SQL semantic validator.
import assert from 'node:assert/strict';
import { parser } from './parser-runtime.mjs';
import { document, visit } from './validate-snf.mjs';
const { SNFParser, exchangeLoopNode, NodeType: T } = parser;
export const parse = text => exchangeLoopNode(new SNFParser().parse(text));
export const normalize = text => text.replace(/\s+/g, ' ').trim();
export function fixture(file) {
    const doc = document(file);
    const definitions = new Map();
    let part;
    for (const block of doc.blocks) {
        const match = block.comment.match(/^# (WHERE|ONEOFIS|PARTOFIS) (.+)$/m);
        if (match) {
            const [, kind, names] = match;
            const choices = kind === 'ONEOFIS' ? block.content.split('\n').map(parse) : [parse(block.content)];
            for (const name of names.split(',').map(value => value.trim())) definitions.set(name, choices);
            part = kind === 'PARTOFIS' ? choices : undefined;
        } else if (part && !block.comment) part.push(parse(block.content));
        else part = undefined;
    }
    const block = directive => {
        const found = doc.blocks.find(candidate => candidate.comment.includes(directive));
        assert.ok(found, `${file}: missing ${directive}`);
        return parse(found.content);
    };
    const loop = member => {
        const found = [];
        for (const candidate of doc.blocks) visit(parse(candidate.content), node => {
            if (node.type === T.LOOP && node.children?.some(child => child.type === T.VARIABLE && child.content === member)) found.push(node);
        });
        assert.ok(found.length, `${file}: no complete-member loop for ${member}`);
        return found[0];
    };
    function render(node, options = {}, context = {}) {
        const depth = context.depth ?? 0;
        assert.ok(depth < 30, 'fixture recursion needs an explicit input');
        const children = (nodes = []) => nodes.map(child => render(child, options, { ...context, depth: depth + 1 })).join('');
        const choice = choices => choices[options.choose?.(choices, context) ?? 0];
        switch (node.type) {
            case T.VARIABLE: {
                if (Object.hasOwn(options.values ?? {}, node.content)) {
                    const value = options.values[node.content];
                    return typeof value === 'function' ? value(context) : String(value);
                }
                if (definitions.has(node.content)) return render(choice(definitions.get(node.content)), options, { ...context, depth: depth + 1 });
                return node.content;
            }
            case T.OPTIONAL: return options.include?.(node, context) ? children(node.children) : '';
            case T.ENUM: return render(choice(node.children), options, { ...context, depth: depth + 1 });
            case T.LOOP: {
                assert.ok(Array.isArray(node.ast), 'detached postfix repetition');
                const member = node.children.find(child => child.type === T.VARIABLE)?.content;
                const count = options.count?.(member, node, context) ?? 1;
                assert.ok(Number.isInteger(count) && count >= 0, 'LOOP cardinality is zero or more');
                const separator = node.ast.filter(child => child.type !== T.REPEAT).map(child => child.content).join('') || ' ';
                return Array.from({ length: count }, (_, index) => node.children.map(child => render(child, options, { ...context, index, indices: { ...context.indices, [member]: index }, depth: depth + 1 })).join('').trim()).join(separator);
            }
            default: return node.children ? children(node.children) : node.content;
        }
    }
    return { block, loop, definitions, render: (node, options) => normalize(render(node, options)) };
}
