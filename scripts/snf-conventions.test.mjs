import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectDocument } from './snf-conventions.mjs';
if (!process.env.SNF_PARSER_MODULE) throw new Error('Set SNF_PARSER_MODULE; see docs/validation.md');
const { SNFDocumentParser, NodeType } = await import(pathToFileURL(resolve(process.env.SNF_PARSER_MODULE)).href);
const parser = new SNFDocumentParser();
const inspect = source => inspectDocument(parser.parse(source), NodeType);
const good = '# CASE NORMAL\nSELECT item\n\n# WHERE item\nvalue_expression';
test('local nodes resolve and typed inputs stay open', () => {
    const result = inspect(good);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.inputs, ['value_expression']);
    assert.deepEqual(result.localReferences, ['item']);
});
test('single form may have an implicit entry point', () => assert.deepEqual(inspect('SELECT item\n\n# WHERE item\nvalue_expression').errors, []));
test('PARTOFIS and ONEOFIS own subsequent alternative blocks', () => {
    for (const kind of ['PARTOFIS', 'ONEOFIS']) assert.deepEqual(inspect(`# CASE A\nSELECT item\n\n# ${kind} item\nA\n\nB`).errors, []);
});
test('recursive local references terminate the audit and remain explicit', () => {
    const result = inspect('# CASE A\nSELECT item\n\n# PARTOFIS item\nvalue_expression\n\n( item )');
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.recursiveDefinitions, ['item']);
});
const invalid = [
    ['duplicate CASE', '# CASE A\nA\n\n# CASE A\nB', 'duplicate CASE'],
    ['duplicate definition', `${good}\n\n# WHERE item\nB`, 'duplicate definition'],
    ['unowned continuation', '# CASE A\nA\n\nB', 'unowned continuation'],
    ['empty definition', '# CASE A', 'empty definition'],
    ['multiple directives in a block', '# CASE A\nA\n# WHERE item\nB', 'one directive'],
    ['wrong directive casing', '# CASE lower\nA', 'casing'],
    ['unknown directive', '# WHER item\nA', 'malformed directive'],
    ['unreachable definition', '# CASE A\nA\n\n# WHERE item\nB', 'unreachable'],
    ['empty alternative', '# CASE A\n{ A | }', 'empty alternative'],
    ['bare split', '# CASE A\nA | B', 'unescaped alternative'],
    ['bare repeat', '# CASE A\nitem ...', 'outside a postfix loop'],
    ['orphan loop', '# CASE A\n[ ... ]', 'no preceding item'],
    ['invalid STATEMENT', '# CASE A\nquery_statement\n\n# STATEMENT query_statement\nselect', 'statement category'],
];
for (const [name, source, message] of invalid) test(`reject ${name}`, () => assert.ok(inspect(source).errors.some(error => error.includes(message))));
test('real parser rejects unclosed syntax', () => assert.throws(() => inspect('# CASE A\n[ A'), /Unclosed block/));
test('real parser rejects malformed repeat', () => assert.throws(() => inspect('# CASE A\nitem [....]'), /three dots/));
test('fixed mixed-case literal and pseudo-column are not inputs', () => {
    const source = "# CASE A\nSELECT 'OpenAI', $action, 'lsn:lsn_number', 'user_text'";
    const result = inspectDocument(parser.parse(source), NodeType, ["'OpenAI'", '$action', "'lsn:"]);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.inputs, ['lsn_number', 'user_text']);
});
test('stale literal contracts fail', () => assert.ok(inspectDocument(parser.parse(good), NodeType, ["'missing'"]).errors.some(e => e.includes('stale'))));

test('invalid literal config fails without hanging', () => {
    for (const snippets of [[''], [null], ['x', 'x'], 'x']) assert.throws(() => inspectDocument(parser.parse(good), NodeType, snippets), /unique nonempty strings/);
});
test('official MySQL 8.4 source block is metadata', () => {
    assert.deepEqual(inspect('# https://dev.mysql.com/doc/refman/8.4/en/select.html\n\nSELECT value_expression').errors, []);
});
test('comma aliases share a helper definition', () => {
    assert.deepEqual(inspect('SELECT item\n\n# WHERE item, alternate_item\nvalue_expression').errors, []);
});
test('STATEMENT permits one category per line', () => {
    assert.deepEqual(inspect('query_statement\n\n# STATEMENT query_statement\nSELECT\nTABLE\nVALUES').errors, []);
});
test('duplicate aliases fail', () => {
    assert.ok(inspect('item\n\n# WHERE item, item\nvalue_expression').errors.some(e => e.includes('duplicate')));
});
test('CASE aliases fail', () => {
    assert.ok(inspect('# CASE A, B\nSELECT value_expression').errors.some(e => e.includes('cannot have aliases')));
});
test('postfix loops reject literal-ending composite units', () => {
    for (const source of ["VALUES ROW ( value ) [, ...]", "INSTALL COMPONENT 'component' [, ...]"]) assert.ok(inspect(source).errors.some(e => e.includes('trailing literal')));
    assert.deepEqual(inspect('VALUES row_definition [, ...]\n\n# WHERE row_definition\nROW ( value [, ...] )').errors, []);
});
test('real parser loop walker binds the complete named member', async () => {
    const { exchangeLoopNode } = await import(pathToFileURL(resolve(process.env.SNF_PARSER_MODULE)).href);
    const parsed = parser.parse('VALUES row_definition [, ...]\n\n# WHERE row_definition\nROW ( value [, ...] )');
    const normalized = exchangeLoopNode(parsed.blocks[0].ast);
    const loops = normalized.children.filter(node => node.type === NodeType.LOOP);
    assert.equal(loops.length, 1);
    assert.ok(loops[0].children.some(node => node.type === NodeType.VARIABLE && node.content === 'row_definition'));
    assert.ok(loops[0].ast.some(node => node.type === NodeType.REPEAT));
});
