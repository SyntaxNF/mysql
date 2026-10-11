import assert from 'node:assert/strict';
import test from 'node:test';
import { parser } from './parser-runtime.mjs';
import { inspectContract } from './snf-contract.mjs';
const parse = source => new parser.SNFDocumentParser().parse(source + '\n');
const inspect = source => inspectContract(parse(source), parser);
for (const source of ['SELECT [ value ]', 'SELECT [ { A | B } ]', 'SELECT item [, ...]', "SELECT 'item' [, ...]", 'SELECT [ ORDER BY item [, ...] ]', 'SELECT [ ( item [, ...] ) ]', 'SELECT { FIRST item | SECOND item } [, ...]', String.raw`SELECT \[ value \] \| \{ value \}`, 'SELECT value as name']) {
    test(`common SNF contract accepts ${source}`, () => assert.deepEqual(inspect(source), []));
}
for (const source of ['A | B', '[ A | B ]', '{ [ A | B ] }']) {
    test(`common SNF contract rejects implicit alternatives: ${source}`, () => assert.throws(() => parse(source)));
}
for (const [source, error] of [
    ['SELECT [ item [, ...] ]', /pure-LOOP optional/],
    ["SELECT [ 'item' [, ...] ]", /pure-LOOP optional/],
    ['SELECT [ { item [, ...] } ]', /pure-LOOP optional/],
    ['SELECT ...', /orphan repeat/],
    ['[, ...]', /one complete member/],
    ['VALUES ( item [, ...] ) [, ...]', /one complete member/],
    ['{ A | }', /nonempty alternative/],
    ['SELECT\n  value', /whitespace\/indentation/],
]) {
    test(`common SNF contract detects ${source}`, () => assert.match(inspect(source).join('\n'), error));
}
test('common SNF contract detects corrupted source spans and synthetic enums', () => {
    const document = parse('SELECT [ value ]');
    document.blocks[0].ast.start = 1;
    const optional = document.blocks[0].ast.children.find(node => node.type === parser.NodeType.OPTIONAL);
    optional.type = parser.NodeType.ENUM;
    const errors = inspectContract(document, parser).join('\n');
    assert.match(errors, /raw\/span mismatch/);
    assert.match(errors, /ENUM requires explicit braces/);
});
