import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parserInput, parserRoot } from './parser-runtime.mjs';

const runtime = new URL('./parser-runtime.mjs', import.meta.url).href;
function load(overrides) {
    const env = { ...process.env };
    for (const key of ['SNF_PARSER_WORKTREE_MODULE', 'SNF_PARSER_ROOT', 'SNF_PARSER_MODULE']) delete env[key];
    return spawnSync(process.execPath, ['--input-type=module', '-e', 'await import(process.argv[1])', runtime], {
        env: { ...env, ...overrides }, encoding: 'utf8',
    });
}
test('runtime loads the explicitly selected current build', () => {
    const result = load({ SNF_PARSER_WORKTREE_MODULE: parserInput });
    assert.equal(result.status, 0, result.stderr);
});
for (const overrides of [{}, { SNF_PARSER_ROOT: parserRoot }, { SNF_PARSER_MODULE: parserInput }]) {
    test(`runtime requires SNF_PARSER_WORKTREE_MODULE with ${JSON.stringify(Object.keys(overrides))}`, () => {
        const result = load(overrides);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Set SNF_PARSER_WORKTREE_MODULE/);
    });
}

function checkBuild(moduleSource, expected) {
    const root = mkdtempSync(path.join(tmpdir(), 'snf-runtime-'));
    try {
        const entry = path.join(root, 'dist/esm/index.mjs');
        mkdirSync(path.dirname(entry), { recursive: true });
        writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'snf-parser' }));
        writeFileSync(entry, moduleSource);
        const result = load({ SNF_PARSER_WORKTREE_MODULE: entry });
        assert.equal(result.status, 1);
        assert.match(result.stderr, expected);
    } finally { rmSync(root, { recursive: true, force: true }); }
}
test('runtime rejects a build without the final AST API', () => {
    checkBuild('export const UID_VERSION = "incomplete";', /must expose the final AST API/);
});
test('runtime rejects a build without compiled definitions', () => {
    checkBuild(`export const UID_VERSION = 'UID_V1';
export const NodeType = { LOOP: 'lo' };
export class SNFDocumentParser { parse() { return { entries: [] }; } }
`, /must compile definitions and loops with metadata/);
});
