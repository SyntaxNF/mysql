import assert from 'node:assert/strict';
import test from 'node:test';
import { parser } from './parser-runtime.mjs';
import { inspectContract } from './snf-contract.mjs';
const parse = source => new parser.SNFDocumentParser().parse(source + '\n');
const inspect = source => { try { return inspectContract(parse(source), parser); } catch(error) { return [error.message]; } };
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
    ['SELECT ...', /outside a postfix loop/],
    ['[, ...]', /no preceding complete repeatable item/],
    ['VALUES ( item [, ...] ) [, ...]', /no preceding complete repeatable item/],
    ['{ A | }', /Empty alternative/],
    ['SELECT\n  value', /whitespace\/indentation/],
]) {
    test(`common SNF contract detects ${source}`, () => assert.match(inspect(source).join('\n'), error));
}
test('common SNF contract detects corrupted source spans and synthetic enums', () => {
    const document = parse('SELECT [ value ]');
    document.entries[0].ast.start = 1;
    const optional = document.entries[0].ast.children.find(node => node.type === parser.NodeType.OPTIONAL);
    optional.type = parser.NodeType.ENUM;
    const errors = inspectContract(document, parser).join('\n');
    assert.match(errors, /raw\/span mismatch/);
    assert.match(errors, /ENUM requires explicit braces/);
});

test('common SNF contract checks automatic metadata and document-wide UID uniqueness', () => {
    const document = parse('MODE { A | B } item [, ...]\n\nMODE { A | B } item [, ...]');
    assert.deepEqual(inspectContract(document, parser), []);
    document.entries[1].ast.uid = document.entries[0].ast.uid;
    const children = document.entries[0].ast.children;
    delete children.find(n => n.type === parser.NodeType.ENUM).name;
    children.find(n => n.type === parser.NodeType.LOOP).name = 'lowercase';
    delete children[0].uid;
    const errors = inspectContract(document, parser).join('\n');
    assert.match(errors, /duplicate parser uid/);
    assert.match(errors, /missing or invalid parser uid/);
    assert.match(errors, /missing or invalid parser name/);
});

for (const type of [parser.NodeType.VARIABLE, parser.NodeType.OPTIONAL]) {
    test(`common SNF contract requires names for dynamic type ${type}`, () => {
        const document = parse('SELECT value [ LIMIT count ]');
        delete document.entries[0].ast.children.find(node => node.type === type).name;
        assert.match(inspectContract(document, parser).join('\n'), /missing or invalid parser name/);
    });
}


test('common contract rejects surviving local variables and wrong recursive targets', () => {
    const document = parse('SELECT left right\n\n# WHERE left\nleft\n\n# WHERE right\nright');
    assert.deepEqual(inspectContract(document, parser), []);
    const refs = document.entries[0].ast.children.filter(node => node.type === parser.NodeType.REFERENCE);
    refs[0].target = refs[1].target;
    assert.match(inspectContract(document, parser).join('\n'), /incorrect recursive reference/);
    refs[0].type = parser.NodeType.VARIABLE;
    assert.match(inspectContract(document, parser).join('\n'), /unexpanded local definition/);
});

test('common contract checks expanded and opaque statement bindings', () => {
    const document = parse('SELECT item body\n\n# WHERE item\nvalue\n\n# STATEMENT body\nSELECT');
    assert.deepEqual(inspectContract(document, parser), []);
    const children = document.entries[0].ast.children;
    children.find(node => node.type === parser.NodeType.COLLECTION).binding.name = 'missing';
    children.find(node => node.type === parser.NodeType.STATEMENT).categories = ['WRONG'];
    const errors = inspectContract(document, parser).join('\n');
    assert.match(errors, /invalid expanded definition binding/);
    assert.match(errors, /invalid statement binding/);
});
