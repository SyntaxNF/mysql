import test from 'node:test';
import assert from 'node:assert/strict';
import { parser } from './parser-runtime.mjs';
import { files, inspect, source, document, visit } from './validate-snf.mjs';
import { fixture, parse, normalize } from './generator-fixture.mjs';
const { NodeType: T } = parser;

for (const file of files) test(`parser and AST structure: ${file}`, () => assert.deepEqual(inspect(file), []));

// Every fixture is an actual member bound by exchangeLoopNode in its caller.
// Zero repetitions are tested as a template contract, not claimed to be valid SQL at every site.
const members = [
    ['query/insert.snf', 'row_expression', {}, '( value_expression )'],
    ['query/replace.snf', 'row_expression', {}, '( value_expression )'],
    ['query/replace.snf', 'row_constructor_expression', {}, 'ROW ( value_expression )'],
    ['query/values.snf', 'row_constructor_expression', {}, 'ROW ( value_expression )'],
    ['query/select.snf', 'select_item', { table: 't' }, 't . *'],
    ['query/select.snf', 'window_definition', { window: 'w', window_expression: 'PARTITION BY category' }, 'w AS ( PARTITION BY category )'],
    ['query/delete.snf', 'delete_target', { table: 't' }, 't'],
    ['query/query-expression.snf', 'set_operation_clause', { query_statement: 'SELECT 2' }, 'UNION SELECT 2'],
    ['compound/get-diagnostics.snf', 'statement_information_assignment', { diagnostic_target: '@count' }, '@count = NUMBER'],
    ['compound/get-diagnostics.snf', 'condition_information_assignment', { diagnostic_target: '@state' }, '@state = CLASS_ORIGIN'],
    ['compound/signal.snf', 'condition_information_assignment', { condition_information_item: 'MESSAGE_TEXT', simple_value: "'message'" }, "MESSAGE_TEXT = 'message'"],
    ['compound/resignal.snf', 'condition_information_assignment', { condition_information_item: 'MYSQL_ERRNO', simple_value: '1001' }, 'MYSQL_ERRNO = 1001'],
    ['other/execute.snf', 'user_variable_reference', { user_variable: 'arg' }, '@arg'],
    ['other/import-table.snf', 'sdi_file_value', { sdi_file: '/tmp/t.sdi' }, "'/tmp/t.sdi'"],
    ['other/install-component.snf', 'component_value', { component: 'file://component_a' }, "'file://component_a'"],
    ['other/uninstall-component.snf', 'component_value', { component: 'file://component_a' }, "'file://component_a'"],
    ['other/install-component.snf', 'component_variable_assignment', { component_variable: 'GLOBAL x', value_expression: '1' }, 'GLOBAL x = 1'],
    ['other/rename-table.snf', 'table_rename_action', { name: 'old_t', new_name: 'new_t' }, 'old_t TO new_t'],
    ['other/load-data.snf', 'column_assignment', { colname: 'c', value_expression: '@v' }, 'c = @v'],
    ['other/load-xml.snf', 'column_assignment', { colname: 'c', value_expression: '@v' }, 'c = @v'],
    ['replication/change-filter.snf', 'qualified_table', { database: 'db', table: 't' }, 'db . t'],
    ['replication/change-filter.snf', 'table_pattern_value', { table_pattern: 'db.%' }, "'db.%'"],
    ['replication/change-filter.snf', 'database_pair', { from_database: 'old_db', to_database: 'new_db' }, '( old_db , new_db )'],
    ['transaction/lock-tables.snf', 'table_lock_definition', { table: 't' }, 't READ'],
];
for (const [file, member, values, one] of members) {
    for (const count of [0, 1, 2]) test(`${file}: complete ${member} member × ${count}`, () => {
        const f = fixture(file), loop = f.loop(member);
        const separator = member === 'set_operation_clause' ? ' ' : ', ';
        assert.equal(f.render(loop, { values, count: (_, node) => node === loop ? count : 1 }), normalize(Array(count).fill(one).join(separator)));
    });
}

test('repeated items receive independent values, including each prefix and delimiter', () => {
    const f = fixture('other/execute.snf'), loop = f.loop('user_variable_reference');
    assert.equal(f.render(loop, { values: { user_variable: ({ index }) => `arg${index + 1}` }, count: () => 2 }), '@arg1, @arg2');
    const r = fixture('other/rename-table.snf'), rename = r.loop('table_rename_action');
    assert.equal(r.render(rename, { values: { name: ({ index }) => `old${index}`, new_name: ({ index }) => `new${index}` }, count: () => 2 }), 'old0 TO new0, old1 TO new1');
});

test('row parentheses survive an empty inner loop, independently of row count', () => {
    const f = fixture('query/insert.snf'), loop = f.loop('row_expression');
    assert.equal(f.render(loop, { count: (_, node) => node === loop ? 2 : 0 }), '( ), ( )');
});

test('whole USING clause can disappear, and two arguments keep both @ prefixes', () => {
    const f = fixture('other/execute.snf');
    const top = parse(document('other/execute.snf').blocks.find(block => block.content.startsWith('EXECUTE')).content);
    assert.equal(f.render(top, { values: { prepare: 'p' } }), 'EXECUTE p');
    assert.equal(f.render(top, { values: { prepare: 'p', user_variable: ({ index }) => `a${index}` }, include: () => true, count: () => 2 }), 'EXECUTE p USING @a0, @a1');
});

test('BEGIN can omit its entire body and terminates one or two selected statements', () => {
    const f = fixture('compound/begin-end.snf');
    const top = parse(document('compound/begin-end.snf').blocks.find(block => block.content.includes('BEGIN')).content);
    assert.equal(f.render(top), 'BEGIN END');
    for (const count of [1, 2]) assert.equal(f.render(top, {
        values: { stored_program_statement: ({ index }) => `SET x = ${index + 1}` },
        include: node => node.content.includes('stored_program_statement'), count: () => count,
    }), `BEGIN ${Array.from({ length: count }, (_, i) => `SET x = ${i + 1}`).join('; ')} ; END`);
    assert.doesNotMatch(source('compound/begin-end.snf'), /NOT ATOMIC/);
});

test('every compound body loop is followed by its internal final semicolon', () => {
    for (const file of ['begin-end', 'case', 'if', 'loop', 'repeat', 'while']) {
        for (const block of document(`compound/${file}.snf`).blocks) visit(parse(block.content), node => {
            const children = node.children ?? [];
            children.forEach((child, index) => {
                if (child.type !== T.LOOP || !child.children?.some(item => item.type === T.VARIABLE && /statement$/.test(item.content))) return;
                const after = children.slice(index + 1).find(item => ![T.BLANK, T.WRAP].includes(item.type));
                assert.equal(after?.content, ';', `${file}: missing body terminator`);
            });
        });
    }
});

test('CREATE VIEW puts AS query before CHECK OPTION; view sources include TABLE', () => {
    const text = source('create/view.snf');
    assert.match(text, /AS query_statement[\s\S]*CHECK OPTION/);
    for (const file of ['create/view.snf', 'alter/view.snf']) assert.match(source(file), /# STATEMENT query_statement\nSELECT\nTABLE(?:\n|$)/);
});

test('GROUP BY remains outside both grouping alternatives', () => {
    const top = parse(document('query/select.snf').blocks.find(block => block.content.includes('SELECT')).content);
    let group;
    visit(top, node => { if (node.type === T.OPTIONAL && /^\s*GROUP BY/.test(node.content)) group = node; });
    assert.ok(group);
    const f = fixture('query/select.snf');
    const basic = { include: node => node === group, values: { group_by_expression: 'c' } };
    assert.equal(f.render(group, basic), 'GROUP BY c');
    assert.equal(f.render(group, { ...basic, choose: choices => choices.findIndex(node => /^\s*ROLLUP/.test(node.content)) >= 0 ? choices.findIndex(node => /^\s*ROLLUP/.test(node.content)) : 0 }), 'GROUP BY ROLLUP ( c )');
});

test('table functions remain free inputs without explicit LATERAL or column alias decoration', () => {
    for (const file of ['select', 'update', 'delete']) {
        const f = fixture(`query/${file}.snf`);
        const candidate = f.definitions.get('from_expression').find(node => node.content.trim().startsWith('table_function_expression'));
        assert.ok(candidate);
        assert.equal(f.render(candidate, { values: { table_function_expression: "JSON_TABLE(doc, '$[*]' COLUMNS (v INT PATH '$'))", function_alias: 'j' } }), "JSON_TABLE(doc, '$[*]' COLUMNS (v INT PATH '$')) j");
    }
});

test('FETCH exposes bare cursor, FROM and NEXT FROM forms', () => {
    const f = fixture('compound/cursor.snf'), b = f.block('# CASE FETCH');
    const values = { cursor: 'cur', variable: 'v' };
    assert.equal(f.render(b, { values }), 'FETCH cur INTO v');
    assert.equal(f.render(b, { values, include: node => node.content.includes('FROM') }), 'FETCH FROM cur INTO v');
    assert.equal(f.render(b, { values, include: () => true }), 'FETCH NEXT FROM cur INTO v');
});

test('random password uses TO RANDOM, not assignment syntax', () => {
    assert.match(source('auth/set-password.snf'), /TO RANDOM/);
    assert.doesNotMatch(source('auth/set-password.snf'), /= RANDOM PASSWORD/);
});

test('generated-column expression and storage mode precede attributes', () => {
    const f = fixture('create/table.snf');
    const generated = f.definitions.get('column_definition').find(node => /GENERATED/.test(node.content));
    assert.ok(generated);
    assert.match(generated.content, /AS \([\s\S]*NULL/);
    assert.match(generated.content, /STORED[\s\S]*COMMENT/);
});

test('temporal and spatial column attributes remain discoverable syntax', () => {
    for (const file of ['create/table.snf', 'alter/table.snf']) {
        assert.match(source(file), /ON UPDATE CURRENT_TIMESTAMP/);
        assert.match(source(file), /SRID srid/);
    }
});

test('TLS detail selection never creates a leading AND', () => {
    for (const file of ['create/user.snf', 'alter/user.snf']) {
        const f = fixture(file);
        const candidates = [...f.definitions.values()].flat().filter(node => /CIPHER/.test(node.content) && /ISSUER/.test(node.content));
        assert.ok(candidates.length);
        for (const selected of ['CIPHER', 'ISSUER', 'SUBJECT']) {
            const rendered = f.render(candidates[0], { include: node => node.content.includes(selected), choose: choices => Math.max(0, choices.findIndex(node => node.content.includes(selected))) });
            assert.doesNotMatch(rendered, /(?:^|REQUIRE )AND\b/);
            assert.ok(rendered.includes(selected), `${file}: ${selected} can be selected alone`);
        }
    }
});

test('replication lists preserve empty parentheses without extra cardinality constraints', () => {
    const f = fixture('replication/change-filter.snf');
    assert.equal(f.render(f.definitions.get('filter_option')[0], { count: () => 0 }), 'REPLICATE_DO_DB = ( )');
    const s = fixture('replication/change-source.snf');
    const ignored = s.definitions.get('source_option').find(node => /IGNORE_SERVER_IDS/.test(node.content));
    assert.equal(s.render(ignored, { count: () => 0 }), 'IGNORE_SERVER_IDS = ( )');
});

test('external statement/body bindings remain usable without a category migration', () => {
    for (const file of ['compound/begin-end.snf', 'compound/if.snf', 'create/function.snf', 'create/procedure.snf', 'create/trigger.snf', 'create/event.snf']) {
        const body = source(file).split(/# STATEMENT /).slice(1).join('\n');
        assert.ok(body.includes('sql_statement'));
        assert.doesNotMatch(body, /\bDECLARE_(?:VARIABLE|CURSOR|HANDLER)\b|^SQL$|^COMPOUND$/m);
    }
});

for (const count of [0, 1, 2]) test(`ALTER USER binds account with its authentication × ${count}`, () => {
    const f = fixture('alter/user.snf'), loop = f.loop('account_definition');
    const values = { account: ({ index }) => `'user${index}'@'localhost'`, auth_string: ({ index }) => `pw${index}` };
    assert.equal(f.render(loop, { values, include: node => /auth_option/.test(node.content), count: (_, node) => node === loop ? count : 1 }), Array.from({ length: count }, (_, i) => `'user${i}'@'localhost' IDENTIFIED BY 'pw${i}'`).join(', '));
});

test('DELETE suffix and SELECT aliases belong to each independently repeated member', () => {
    const d = fixture('query/delete.snf'), dl = d.loop('delete_target');
    assert.equal(d.render(dl, { values: { table: ({ index }) => `t${index}` }, include: () => true, count: () => 2 }), 't0 . *, t1 . *');
    const s = fixture('query/select.snf'), sl = s.loop('select_item');
    assert.equal(s.render(sl, {
        values: { col_expression: ({ index }) => `c${index}`, col_alias: ({ index }) => `a${index}` },
        count: () => 2, include: () => true,
        choose: choices => Math.max(0, choices.findIndex(node => node.content.includes('col_expression'))),
    }), 'c0 AS a0, c1 AS a1');
});

test('two locking clauses retain their keyword and independently selected table', () => {
    const f = fixture('query/select.snf'), loop = f.loop('locking_clause');
    assert.equal(f.render(loop, {
        values: { table: ({ indices }) => `t${indices.locking_clause}` }, include: node => node.content.includes('OF table'),
        count: (member) => member === 'locking_clause' ? 2 : 1,
    }), 'FOR UPDATE OF t0 FOR UPDATE OF t1');
});

test('partition modifier comma is emitted only with its whole modifier', () => {
    const f = fixture('alter/table.snf'), b = f.block('# CASE ADD_PARTITION');
    for (const algorithm of [false, true]) for (const lock of [false, true]) {
        const rendered = f.render(b, {
            values: { name: 't', partition_definition: 'PARTITION p VALUES LESS THAN (10)' },
            include: node => algorithm && node.content.trim().startsWith('ALGORITHM') || lock && node.content.trim().startsWith('LOCK'),
        });
        assert.equal(rendered, `ALTER TABLE t ${algorithm ? 'ALGORITHM DEFAULT , ' : ''}${lock ? 'LOCK DEFAULT , ' : ''}ADD PARTITION ( PARTITION p VALUES LESS THAN (10) )`);
    }
});

test('ordinary ALTER actions join repartitioning without an extra comma', () => {
    const f = fixture('alter/table.snf');
    assert.equal(f.render(f.block('# CASE OPTIONS'), {
        values: { name: 't', alter_action: 'ADD c INT', partition_options: 'PARTITION BY HASH (c)' },
        include: node => node.content.includes('partition_options'),
    }), 'ALTER TABLE t ADD c INT PARTITION BY HASH (c)');
    const rename = f.definitions.get('alter_action').find(node => /^RENAME \[ TO/.test(node.content));
    assert.ok(rename, 'table rename also works in a combined action list');
});

test('ALTER EVENT rename and body branches combine clauses in canonical order', () => {
    const f = fixture('alter/event.snf');
    const values = { name: 'e', new_name: 'renamed', schedule_definition: 'AT CURRENT_TIMESTAMP', comment: 'updated', event_statement: 'SELECT 1' };
    const include = node => !node.content.includes('DEFINER') && node.content.trim() !== 'NOT';
    assert.equal(f.render(f.block('# CASE RENAME'), { values, include }), "ALTER EVENT e ON SCHEDULE AT CURRENT_TIMESTAMP ON COMPLETION PRESERVE RENAME TO renamed ENABLE COMMENT 'updated' DO SELECT 1");
    assert.equal(f.render(f.block('# CASE BODY'), { values, include }), "ALTER EVENT e ON SCHEDULE AT CURRENT_TIMESTAMP ON COMPLETION PRESERVE ENABLE COMMENT 'updated' DO SELECT 1");
});

test('tablespace SET and NDB logfile clauses occupy their required positions', () => {
    const a = fixture('alter/tablespace.snf');
    assert.equal(a.render(a.block('# CASE INNODB_UNDO_SET_STATE'), { values: { name: 'u' }, include: () => true }), 'ALTER UNDO TABLESPACE u SET ACTIVE ENGINE = INNODB');
    for (const label of ['INNODB_GENERAL_RENAME', 'NDB_RENAME']) assert.equal(a.render(a.block(`# CASE ${label}`), { values: { name: 'a', new_name: 'b' }, include: () => true }), 'ALTER TABLESPACE a RENAME TO b');
    const c = fixture('create/tablespace.snf'), b = c.block('# CASE NDB');
    const rendered = c.render(b, { include: () => true });
    assert.match(rendered, /USE LOGFILE GROUP[\s\S]*AUTOEXTEND_SIZE/);
});

test('resource-group attributes combine with enable and disable', () => {
    const f = fixture('alter/resource-group.snf');
    for (const label of ['ENABLE', 'DISABLE']) {
        const result = f.render(f.block(`# CASE ${label}`), { values: { name: 'r', vcpu: '0', priority: '1' }, include: () => true });
        assert.equal(result, `ALTER RESOURCE GROUP r VCPU = 0 THREAD_PRIORITY = 1 ${label}${label === 'DISABLE' ? ' FORCE' : ''}`);
    }
});

test('documented administration lists combine complete distinct options', () => {
    for (const [file, member, selection, expected] of [
        ['replication/change-source.snf', 'source_option', [0, 1], "SOURCE_HOST = 'host', SOURCE_PORT = port"],
        ['replication/change-filter.snf', 'filter_option', [0, 1], 'REPLICATE_DO_DB = ( database ), REPLICATE_IGNORE_DB = ( database )'],
        ['other/flush.snf', 'flush_option', [0, 9], 'BINARY LOGS, STATUS'],
        ['other/reset.snf', 'reset_option', [0, 1], 'BINARY LOGS AND GTIDS, REPLICA'],
    ]) {
        const f = fixture(file), loop = f.loop(member), choices = f.definitions.get(member);
        assert.equal(f.render(loop, {
            choose: (candidates, context) => candidates === choices ? selection[context.indices[member]] : 0,
            count: (_, node) => node === loop ? 2 : 1,
        }), expected);
    }
});

test('SET can mix system, user and local assignments with explicit DEFAULT', () => {
    const f = fixture('other/set.snf');
    const variants = f.definitions.get('variable_assignment');
    assert.equal(f.render(variants[0], { values: { system_variable: 'sql_mode' }, choose: choices => Math.max(0, choices.findIndex(node => node.content.trim() === 'DEFAULT')), include: node => node.content.includes('GLOBAL') }), 'GLOBAL sql_mode = DEFAULT');
    assert.equal(f.render(variants[1], { values: { user_variable: 'u', value_expression: '1' } }), '@u = 1');
    assert.equal(f.render(variants[2], { values: { local_variable: 'l', value_expression: '2' } }), 'l = 2');
    const loop = f.loop('variable_assignment');
    assert.equal(f.render(loop, { values: { variable_assignment: ({ index }) => ['LOCAL sql_mode = DEFAULT', '@u = 1', 'l = 2'][index] }, count: () => 3 }), 'LOCAL sql_mode = DEFAULT, @u = 1, l = 2');
});

test('SHOW/EXPLAIN expose actual additional syntax without new statement-binding classes', () => {
    const show = fixture('other/show.snf');
    assert.equal(show.render(show.block('# CASE CREATE_DATABASE'), { values: { database: 'd' }, include: () => true }), 'SHOW CREATE DATABASE IF NOT EXISTS d');
    assert.match(show.render(show.block('# CASE COLUMNS'), { include: node => /^\s*(EXTENDED|FULL)/.test(node.content) }), /^SHOW EXTENDED FULL COLUMNS FROM/);
    assert.match(show.render(show.block('# CASE RELAYLOG_EVENTS'), { include: node => node.content.includes('FOR CHANNEL') }), /FOR CHANNEL 'channel'$/);
    const explain = fixture('other/explain.snf');
    const rendered = explain.render(explain.block('# CASE QUERY'), { values: { explainable_statement: 'SELECT 1' }, include: () => true, choose: choices => Math.max(0, choices.findIndex(node => node.content.trim() === 'JSON')) });
    assert.equal(rendered, 'EXPLAIN FORMAT = JSON INTO @user_variable FOR SCHEMA database SELECT 1');
});
