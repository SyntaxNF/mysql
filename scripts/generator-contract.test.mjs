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

for (const count of [0, 1, 2]) {
    test(`doubled quotes repeat as one whole member x ${count}`, () => {
        for (const member of ["'IT''S'", '"A""B"', "''''", "''"]) {
            assert.equal(f.render(parse(`${member} [, ...]`), { count: () => count }), Array(count).fill(member).join(', '));
        }
    });
}

test('generation spaces container boundaries and preserves template token joins', () => {
    const ast = parse('SELECT[ DISTINCT]{schema.table|other}[ AS alias]');
    assert.equal(f.render(ast), 'SELECT schema.table');
    assert.equal(f.render(ast, { include: () => true }), 'SELECT DISTINCT schema.table AS alias');
    assert.equal(f.render(ast, { choose: () => 1 }), 'SELECT other');
    assert.equal(f.render(parse('SELECT item[, ...] FROM table'), { count: () => 0 }), 'SELECT FROM table');
    assert.equal(f.render(parse("SELECT 'A [ B ] C'"), { include: () => true }), "SELECT 'A  B  C'");
});

test('complete prefixed literals and escaped identifiers need no punctuation inference', () => {
    const ast = parse("LANGUAGE = { 'language' | N'language' }");
    assert.equal(f.render(ast), "LANGUAGE = 'language'");
    assert.equal(f.render(ast, { choose: () => 1 }), "LANGUAGE = N'language'");
    assert.equal(f.render(parse(String.raw`SELECT schema.table, func(arg), @variable, \[DEFAULT\]`)),
        'SELECT schema.table, func(arg), @variable, [DEFAULT]');
    assert.equal(f.render(parse("N[ option ]'language'")), "N'language'");
});
