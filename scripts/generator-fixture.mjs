// A deliberately small fixture renderer for the documented generator contract.
// This is NOT the downstream SQL generator or an SQL semantic validator.
import assert from 'node:assert/strict';
import { parser } from './parser-runtime.mjs';
import { document, visit } from './validate-snf.mjs';
const { SNFParser, NodeType: T } = parser;
export const parse = text => new SNFParser().parse(text);
export function normalize(text) {
    let result = '', quote, pendingSpace = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quote) {
            result += char;
            if (char === quote && text[i + 1] === quote) result += text[++i];
            else if (char === quote) quote = undefined;
        } else if (/\s/.test(char)) pendingSpace = true;
        else {
            if (pendingSpace && result) result += ' ';
            pendingSpace = false;
            result += char;
            if (char === "'" || char === '"') quote = char;
        }
    }
    return result;
}
// The consuming generator removes a trailing comma before a closing parenthesis.
// Keep this cleanup outside quoted input; zero LOOP members remain legal here.
export function stripTrailingCommas(text) {
    let quote, depth = 0, result = '';
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quote) {
            result += char;
            if (char === quote && text[i + 1] === quote) result += text[++i];
            else if (char === quote) quote = undefined;
            continue;
        }
        if (char === "'" || char === '"') quote = char;
        if (char === '(') depth++;
        if (char === ')') depth--;
        if (char === ',' && depth > 0 && /^\s*\)/.test(text.slice(i + 1))) continue;
        result += char;
    }
    return result;
}
export function fixture(file) {
    const doc = document(file);
    const definitions = new Map(), targets = new Map();
    for (const definition of doc.definitions) {
        const choices = ['ONEOFIS','PARTOFIS'].includes(definition.kind) ? definition.ast.children[0].children : [definition.ast];
        definition.names.forEach(name => definitions.set(name, choices));
        targets.set(definition.ast.uid, definition.ast);
    }
    const block = directive => {
        const found = [...doc.entries, ...doc.definitions].find(item => item.blocks.some(index => doc.blocks[index].comment.split('\n').includes(directive)));
        assert.ok(found, `${file}: missing ${directive}`);
        return found.ast;
    };
    const loop = member => {
        let found;
        for (const candidate of [...doc.entries, ...doc.definitions]) visit(candidate.ast, node => {
            if (!found && node.type === T.LOOP && node.children?.some(child => (child.binding?.name ?? child.content) === member)) found = node;
        });
        assert.ok(found, `${file}: no complete-member loop for ${member}`);
        return found;
    };
    function render(node, options = {}, context = {}) {
        const depth = context.depth ?? 0;
        assert.ok(depth < 300, 'fixture recursion needs an explicit input');
        const children = (nodes = [], quoted = context.quoted) =>
            nodes.map(child => render(child, options, { ...context, quoted, depth: depth + 1 })).join('');
        // Only emitting, unquoted OPTIONAL/GROUP boundaries supply spacing.
        // Ordinary tokens keep their template spacing, including tight prefixes.
        const boundary = text => context.quoted ? text : text.trim() ? ` ${text} ` : '';
        const choice = choices => choices[options.choose?.(choices, context) ?? 0];
        switch (node.type) {
            case T.COLLECTION:
            case T.REFERENCE:
            case T.STATEMENT:
            case T.VARIABLE: {
                const key = node.binding?.name ?? node.content;
                if (Object.hasOwn(options.values ?? {}, key)) {
                    const value = options.values[key];
                    const input = String(typeof value === 'function' ? value(context) : value);
                    const index = context.inputs.push(input) - 1;
                    return `\u0001INPUT_${index}\u0002`;
                }
                if (node.type === T.REFERENCE) return render(targets.get(node.target), options, { ...context, depth: depth + 1 });
                return node.children ? children(node.children) : node.content;
            }
            case T.QUOTED: return node.quote + children(node.children, true) + node.quote;
            case T.OPTIONAL: return options.include?.(node, context) ? boundary(children(node.children)) : '';
            case T.GROUP: return boundary(children(node.children));
            case T.ENUM: return render(choice(node.children), options, { ...context, depth: depth + 1 });
            case T.LOOP: {
                assert.equal(typeof node.separator, 'string');
                const child = node.children[0];
                const member = child.binding?.name ?? ([T.VARIABLE,T.STATEMENT,T.REFERENCE].includes(child.type) ? child.content : undefined);
                const count = options.count?.(member, node, context) ?? 1;
                assert.ok(Number.isInteger(count) && count >= 0, 'LOOP cardinality is zero or more');
                let separator = node.separator ? `${node.separator} ` : ' ';
                // Word separators, e.g. [OR ...], need token boundaries on both sides.
                if (/^\s*[A-Za-z]/.test(separator)) separator = ` ${separator.trim()} `;
                return Array.from({ length: count }, (_, index) => node.children.map(child => render(child, options, { ...context, index, indices: { ...context.indices, [member]: index }, depth: depth + 1 })).join('').trim()).join(separator);
            }
            default: return node.children ? children(node.children) : node.content;
        }
    }
    return { block, loop, definitions, render: (node, options) => {
        const inputs = [];
        const rendered = normalize(stripTrailingCommas(render(node, options, { inputs })));
        return rendered.replace(/\u0001INPUT_(\d+)\u0002/g, (_, index) => inputs[Number(index)]);
    } };
}
