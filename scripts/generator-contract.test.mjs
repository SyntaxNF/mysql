// Same small renderer contract in every repository; never executes SQL.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, parse } from './generator-fixture.mjs';
const f = fixture('query/select.snf');
test('free SQL inputs retain whitespace, comments, quotes and commas byte-for-byte', () => {
    const input = "SELECT  'two  spaces', $$keep, )$$\n-- keep newline\nFROM  t";
    assert.equal(f.render(parse('TEST test_value'), { values: { test_value: input } }), `TEST ${input}`);
});
test('quoted input preserves apostrophes and repeated whitespace', () => {
    assert.equal(f.render(parse("TEST 'test_value'"), { values: { test_value: "it''s  quoted" } }), "TEST 'it''s  quoted'");
});
for (const count of [0, 1, 2]) {
    test(`complete loop members and word separators × ${count}`, () => {
        assert.equal(f.render(parse('{ ITEM test_value } [ OR ... ]'), {
            count: () => count, values: { test_value: ({ index }) => `v${index}` },
        }), Array.from({ length: count }, (_, i) => `ITEM v${i}`).join(' OR '));
    });
}
test('optional clauses preserve independent selection and trailing comma cleanup', () => {
    const ast = parse('TEST ( [ FIRST test_value , ] [ SECOND test_other , ] )');
    assert.equal(f.render(ast), 'TEST ( )');
    assert.equal(f.render(ast, { include: () => true, values: { test_value: 'a, )', test_other: 'b  c' } }), 'TEST ( FIRST a, ) , SECOND b  c )');
});
test('enum selection is separate from optional inclusion', () => {
    const ast = parse('TEST [ { FIRST test_value | SECOND test_value } ]');
    assert.equal(f.render(ast), 'TEST');
    assert.equal(f.render(ast, { include: () => true, choose: () => 1, values: { test_value: 'v' } }), 'TEST SECOND v');
});
