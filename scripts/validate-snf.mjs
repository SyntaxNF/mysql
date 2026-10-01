// SNF syntax/AST checks only. This script does not execute or validate SQL semantics.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parser, parserRevision } from './parser-runtime.mjs';
const { SNFDocumentParser, SNFParser, exchangeLoopNode, NodeType } = parser;
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const families = ['alter', 'auth', 'compound', 'create', 'drop', 'other', 'query', 'replication', 'transaction'];
export const files = families.flatMap(dir => fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.snf')).map(f => `${dir}/${f}`)).sort();
export const source = file => fs.readFileSync(path.join(root, file), 'utf8');
export const document = file => new SNFDocumentParser().parse(source(file));
export function visit(node, fn) { fn(node); node.children?.forEach(child => visit(child, fn)); }
export function inspect(file) {
    const errors = [];
    const text = source(file);
    if (!/^# https:\/\/dev\.mysql\.com\/doc\/refman\/8\.4\/en\/[a-z0-9-]+\.html\n/.test(text)) errors.push('missing official 8.4 source URL');
    if (/[ \t]+$/m.test(text) || !text.endsWith('\n')) errors.push('whitespace/newline error');
    let doc;
    try { doc = new SNFDocumentParser().parse(text); } catch (error) { return [...errors, error.message]; }
    if (doc.lines.map(line => line.content + line.ending).join('') !== text) errors.push('lossless source round-trip mismatch');
    for (const block of doc.blocks) {
        visit(block.ast, node => {
            if (block.content.slice(node.start, node.end) !== node.raw) errors.push(`source-span mismatch at line ${block.startLine}`);
        });
        if (block.comment.startsWith('# ONEOFIS ')) {
            for (const line of block.content.split('\n')) {
                try { new SNFParser().parse(line); } catch (error) { errors.push(`multiline ONEOFIS candidate at line ${block.startLine}: ${error.message}`); }
            }
        }
        visit(exchangeLoopNode(block.ast), node => {
            if (node.type === NodeType.LOOP && !Array.isArray(node.ast)) errors.push(`unbound postfix loop at line ${block.startLine}: ${node.raw}`);
        });
    }
    return errors;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const errors = files.flatMap(file => inspect(file).map(error => `${file}: ${error}`));
    console.log(JSON.stringify({ parserRevision, parserInput: 'verified src/index.ts', files: files.length, errors }, null, 2));
    if (errors.length) process.exitCode = 1;
}
