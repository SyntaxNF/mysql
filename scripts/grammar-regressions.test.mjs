// Source/AST contract regressions, not SQL execution or a SQL acceptance suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
if (!process.env.SNF_PARSER_MODULE) throw new Error('Set SNF_PARSER_MODULE; see docs/validation.md');
const { SNFDocumentParser } = await import(pathToFileURL(resolve(process.env.SNF_PARSER_MODULE)).href);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => fs.readFileSync(resolve(root, file), 'utf8');
const document = file => new SNFDocumentParser().parse(source(file));
const block = (file, directive) => {
    const result = document(file).blocks.find(b => b.comment === directive);
    assert.ok(result, `${file}: ${directive}`);
    return result.content;
};
test('empty BEGIN is legal; declarations ordered; NOT ATOMIC absent', () => {
    const text = source('compound/begin-end.snf');
    assert.doesNotMatch(text, /NOT ATOMIC/);
    assert.match(text, /\[ stored_program_statement \[; \.\.\.\] ; \]/);
    assert.ok(text.indexOf('[ variable_or_condition_declaration') < text.indexOf('[ cursor_declaration'));
    assert.ok(text.indexOf('[ cursor_declaration') < text.indexOf('[ handler_declaration'));
    assert.ok(text.indexOf('[ handler_declaration') < text.indexOf('[ stored_program_statement'));
});
test('every stored control-flow sequence ends in a semicolon', () => {
    for (const file of ['case', 'if', 'loop', 'repeat', 'while']) {
        const text = source(`compound/${file}.snf`);
        assert.match(text, /statement \[; \.\.\.\] ;/);
        assert.doesNotMatch(text, /statement \[; \.\.\.\](?! ;)/);
    }
});
test('FETCH supports NEXT FROM and bare cursor', () => assert.match(block('compound/cursor.snf', '# CASE FETCH'), /FETCH \[ \[ NEXT \] FROM \] cursor/));
test('LOCK TABLES repeats complete entries and has exclusive required modes', () => {
    assert.match(source('transaction/lock-tables.snf'), /table_lock_definition \[, \.\.\.\]/);
    assert.match(block('transaction/lock-tables.snf', '# WHERE table_lock_definition'), /\{ READ \[ LOCAL \] \| WRITE \}/);
    assert.doesNotMatch(source('transaction/lock-tables.snf'), /LOW_PRIORITY/);
});
test('replication source permits combined options and clearing ignored IDs', () => {
    assert.match(source('replication/change-source.snf'), /source_option \[, \.\.\.\]/);
    assert.match(block('replication/change-source.snf', '# ONEOFIS source_option'), /IGNORE_SERVER_IDS = \( \[ server_id \[, \.\.\.\] \] \)/);
});
test('replication filters permit combined settings, qualified tables and empty lists', () => {
    assert.match(source('replication/change-filter.snf'), /filter_option \[, \.\.\.\]/);
    assert.match(block('replication/change-filter.snf', '# ONEOFIS filter_option'), /REPLICATE_DO_TABLE = \( \[ qualified_table/);
    assert.match(source('replication/change-filter.snf'), /REPLICATE_REWRITE_DB = \( \[ database_pair/);
});
test('group recovery password is nested under USER', () => {
    const text = block('replication/start-group-replication.snf', '# PARTOFIS recovery_options');
    assert.match(text, /^USER = 'user'\n    \[ , PASSWORD/);
});
test('SET supports heterogeneous assignments and explicit DEFAULT', () => {
    assert.match(source('other/set.snf'), /SET variable_assignment \[, \.\.\.\]/);
    for (const name of ['system_variable_assignment', 'user_variable_assignment', 'local_or_parameter_variable_assignment']) assert.match(block('other/set.snf', '# ONEOFIS variable_assignment'), new RegExp(name));
    assert.match(block('other/set.snf', '# WHERE system_variable_assignment'), /\{ value_expression \| DEFAULT \}/);
});
test('SHOW missing clauses and dependent USING are retained', () => {
    assert.match(block('other/show.snf', '# CASE COLUMNS'), /EXTENDED/);
    assert.match(block('other/show.snf', '# CASE CREATE_DATABASE'), /IF NOT EXISTS/);
    assert.match(block('other/show.snf', '# CASE RELAYLOG_EVENTS'), /FOR CHANNEL/);
    assert.match(block('other/show.snf', '# CASE GRANTS'), /\[ FOR .* \[ USING role \[, \.\.\.\] \] \]/);
});
test('EXPLAIN JSON INTO cannot be emitted by CONNECTION and ANALYZE cases', () => {
    assert.match(block('other/explain.snf', '# CASE JSON_INTO'), /FORMAT = JSON\n    INTO @user_variable/);
    for (const name of ['CONNECTION','ANALYZE']) assert.doesNotMatch(block('other/explain.snf', `# CASE ${name}`), /INTO/);
    assert.equal(block('other/explain.snf', '# STATEMENT analyzable_statement'), 'SELECT\nTABLE\nMULTI_TABLE_UPDATE\nMULTI_TABLE_DELETE');
});
test('FLUSH combines only non-table options', () => {
    const options = block('other/flush.snf', '# ONEOFIS flush_option');
    assert.match(options, /BINARY LOGS/); assert.match(options, /STATUS/); assert.doesNotMatch(options, /TABLE/);
});
test('diagnostic assignments repeat complete pairs', () => {
    assert.match(block('compound/get-diagnostics.snf', '# WHERE statement_information'), /^statement_information_assignment \[, \.\.\.\]$/);
    assert.match(block('compound/signal.snf', '# WHERE condition_information_assignment'), /^condition_information_item = simple_value$/);
});
test('rename and component SET lists repeat complete definitions', () => {
    assert.match(source('other/rename-table.snf'), /rename_definition \[, \.\.\.\]/);
    assert.match(source('other/install-component.snf'), /component_variable_assignment \[, \.\.\.\]/);
});
test('CREATE VIEW puts CHECK OPTION after AS query', () => {
    const text = source('create/view.snf');
    assert.ok(text.indexOf('AS query_statement') < text.indexOf('CHECK OPTION'));
});
test('GROUP BY keyword dominates both rollup forms', () => assert.match(source('query/select.snf'), /GROUP BY \{ group_by_expression .*\| ROLLUP/));
test('JSON_TABLE is recursive and never explicitly LATERAL', () => {
    for (const file of ['select','delete','update']) {
        const text = source(`query/${file}.snf`);
        assert.match(text, /# WHERE json_table_expression\nJSON_TABLE/);
        assert.match(block(`query/${file}.snf`, '# PARTOFIS json_column_definition'), /FOR ORDINALITY/);
        assert.match(text, /NESTED \[ PATH \] 'json_path'\n    COLUMNS \( json_column_definition/);
        assert.doesNotMatch(text, /LATERAL \] (?:table_function|json_table_expression)/);
    }
});
test('single-table UPDATE has a table target, not arbitrary join grammar', () => {
    const text = block('query/update.snf', '# CASE SINGLE_TABLE');
    assert.doesNotMatch(text, /from_expression/);
    assert.match(text, /LIMIT limit/);
});
test('set-operation branch requires an operation and terms can recurse', () => {
    assert.match(block('query/query-expression.snf', '# CASE SET_OPERATION'), /^query_term_statement set_operation query_term_statement/);
    assert.match(block('query/query-expression.snf', '# WHERE query_term_statement'), /\( query_expression_statement \)/);
});
test('generated column AS precedes nullability and index attributes', () => {
    for (const file of ['create/table.snf','alter/table.snf']) {
        const text = source(file);
        const generated = text.slice(text.indexOf('[ GENERATED ALWAYS ] AS'));
        assert.ok(generated.indexOf('[ VIRTUAL | STORED ]') < generated.indexOf('[ NOT NULL | NULL ]'));
        assert.match(text, /ON UPDATE CURRENT_TIMESTAMP/);
        assert.match(text, /\[ SRID srid \]/);
    }
});
test('ALTER TABLE hash/key partition count and subpartitions are explicit', () => {
    assert.match(block('alter/table.snf', '# CASE ADD_HASH_KEY_PARTITIONS'), /ADD PARTITION PARTITIONS number/);
    assert.match(block('alter/table.snf', '# WHERE partition_definition'), /subpartition_definition \[, \.\.\.\]/);
});
test('SET PASSWORD random spelling is TO RANDOM', () => {
    assert.match(source('auth/set-password.snf'), /TO RANDOM/);
    assert.doesNotMatch(source('auth/set-password.snf'), /= RANDOM PASSWORD/);
});
test('ALTER USER registration and default roles are first-class', () => {
    assert.match(block('alter/user.snf', '# CASE DEFAULT_ROLE'), /DEFAULT ROLE/);
    const text = source('alter/user.snf');
    for (const term of ['INITIATE REGISTRATION','FINISH REGISTRATION','UNREGISTER','DISCARD OLD PASSWORD']) assert.ok(text.includes(term));
    assert.doesNotMatch(text, /RETAIN CURRENT PASSWORD \| DISCARD/);
});
test('account TLS and resources cannot be empty when introduced', () => {
    for (const file of ['create/user.snf','alter/user.snf']) {
        assert.equal(block(file, '# PARTOFIS tls_requirements'), 'SSL');
        assert.match(block(file, '# PARTOFIS resource_options'), /^MAX_QUERIES_PER_HOUR count/);
    }
});
test('GRANT and REVOKE enumerate column-capable static privileges', () => {
    for (const file of ['auth/grant.snf','auth/revoke.snf']) {
        assert.match(block(file, '# PARTOFIS privilege_definition'), /^\{ INSERT \| REFERENCES \| SELECT \| UPDATE \} \[ \( colname/);
    }
});
test('qualified filter members and EXECUTE parameters repeat complete helpers', () => {
    assert.equal(block('replication/change-filter.snf', '# WHERE qualified_table'), 'database . table');
    assert.equal(block('replication/change-filter.snf', '# WHERE database_pair'), '( from_database , to_database )');
    assert.match(source('other/execute.snf'), /USING user_variable_reference \[, \.\.\.\]/);
    assert.equal(block('other/execute.snf', '# WHERE user_variable_reference'), '@user_variable');
});
test('SUBPARTITION KEY requires columns even though PARTITION KEY can infer them', () => {
    for (const file of ['create/table.snf', 'alter/table.snf']) {
        assert.match(block(file, '# ONEOFIS subpartition_method'), /KEY .*\( colname \[, \.\.\.\] \)/);
        assert.doesNotMatch(block(file, '# ONEOFIS subpartition_method'), /\( \[ colname/);
        assert.match(block(file, '# ONEOFIS partition_method'), /\( \[ colname/);
    }
});
test('REPLACE exposes a paired empty default row', () => {
    assert.match(block('query/replace.snf', '# CASE DEFAULT_ROW'), /\( \)\s+VALUES \( \)/);
});
test('real loop walker binds qualified table and rewrite-pair helper units', async () => {
    const { exchangeLoopNode, NodeType } = await import(pathToFileURL(resolve(process.env.SNF_PARSER_MODULE)).href);
    const parsed = document('replication/change-filter.snf');
    const normalized = exchangeLoopNode(parsed.blocks.find(b => b.comment === '# ONEOFIS filter_option').ast);
    const members = [];
    const visit = node => {
        if (node.type === NodeType.LOOP) for (const child of node.children ?? []) if (child.type === NodeType.VARIABLE) members.push(child.content);
        for (const child of node.children ?? []) visit(child);
    };
    visit(normalized);
    assert.ok(members.includes('qualified_table'));
    assert.ok(members.includes('database_pair'));
    assert.ok(members.includes('table_pattern_value'));
});
