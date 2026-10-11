// A deliberately small fixture renderer for the documented generator contract.
// This is NOT the downstream SQL generator or an SQL semantic validator.
import assert from 'node:assert/strict';
import { parser } from './parser-runtime.mjs';
import { document, visit } from './validate-snf.mjs';
const { SNFParser, exchangeLoopNode, NodeType: T } = parser;
export const parse = text => exchangeLoopNode(new SNFParser().parse(text));
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
        const found = doc.blocks.find(candidate => candidate.comment.split('\n').includes(directive));
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
                    const input = String(typeof value === 'function' ? value(context) : value);
                    // Keep opaque user inputs byte-for-byte outside fixture whitespace/comma cleanup.
                    const index = context.inputs.push(input) - 1;
                    return `\u0001INPUT_${index}\u0002`;
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
                let separator = node.ast.filter(child => child.type !== T.REPEAT).map(child => child.content).join('') || ' ';
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
