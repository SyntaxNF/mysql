// User-triggered only. Structural and project-contract checks; never executes SQL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectDocument } from './snf-conventions.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parserEntry = process.env.SNF_PARSER_MODULE;
if (!parserEntry) throw new Error('Set SNF_PARSER_MODULE to the pinned official parser ESM entry (docs/validation.md).');
const { SNFDocumentParser, SNFParser, NodeType } = await import(pathToFileURL(path.resolve(parserEntry)).href);
const families = ['alter', 'auth', 'compound', 'create', 'drop', 'other', 'query', 'replication', 'transaction'];
const files = families.flatMap(dir => fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.snf')).map(f => `${dir}/${f}`)).sort();
const audit = [], errors = [];
for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const fail = message => errors.push(`${file}: ${message}`);
    if (!/^# https:\/\/dev\.mysql\.com\/doc\/refman\/8\.4\/en\/[a-z0-9-]+\.html\n/.test(source)) fail('missing MySQL 8.4 official source');
    if (/[ \t]+$/m.test(source)) fail('trailing whitespace');
    if (!source.endsWith('\n')) fail('missing final newline');
    let document;
    try { document = new SNFDocumentParser().parse(source); } catch (e) { fail(`parser: ${e.message}`); continue; }
    if (document.content !== source || document.lines.map(l => l.content + l.ending).join('') !== source) fail('lossless source round-trip mismatch');
    for (const block of document.blocks) {
        const visit = node => {
            if (block.content.slice(node.start, node.end) !== node.raw) fail(`AST source span mismatch at line ${block.startLine}`);
            node.children?.forEach(visit);
        };
        visit(block.ast);
        if (block.comment.startsWith('# ONEOFIS ')) {
            for (const line of block.content.split('\n')) {
                try { new SNFParser().parse(line); } catch (e) { fail(`ONEOFIS candidate wraps physical lines: ${e.message}`); }
            }
        }
    }
    const result = inspectDocument(document, NodeType);
    result.errors.forEach(fail);
    audit.push({file, ...result});
}
const inventoryPath = path.join(root, 'docs/statement-coverage.json');
if (!fs.existsSync(inventoryPath)) errors.push('missing required docs/statement-coverage.json');
else {
    const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    const expectedPages = JSON.parse(fs.readFileSync(path.join(root, 'docs/official-topic-index.json'), 'utf8')).pages;
    const actualPages = inventory.entries.map(row => row.page);
    if (expectedPages.length !== 248 || new Set(expectedPages).size !== 248) errors.push('official index must contain 248 unique audited topics');
    if (new Set(actualPages).size !== actualPages.length) errors.push('duplicate inventory page');
    if (JSON.stringify([...actualPages].sort()) !== JSON.stringify([...expectedPages].sort())) errors.push('inventory differs from official topic set');
    const referenced = new Set();
    for (const row of inventory.entries) {
        if (!['structured', 'partial', 'context', 'excluded'].includes(row.status)) errors.push(`invalid inventory status: ${row.page}`);
        if (!row.evidence || !row.url.startsWith('https://dev.mysql.com/doc/refman/8.4/en/')) errors.push(`missing inventory evidence: ${row.page}`);
        for (const file of row.files) {
            referenced.add(file);
            if (!files.includes(file)) errors.push(`inventory missing file: ${file}`);
        }
        if (['structured', 'partial'].includes(row.status) && !row.files.length) errors.push(`unmapped active syntax: ${row.page}`);
    }
    for (const file of files) if (!referenced.has(file)) errors.push(`SNF absent from inventory: ${file}`);
}
const result = {parserRevision: 'bcf2c3ac58b45e7d5391716393586b00b11e0c1a', files: files.length, errors, audit};
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({files: files.length, errors}, null, 2));
if (errors.length) process.exitCode = 1;
