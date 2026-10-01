// Load the pinned parser's verified TypeScript source, never an unverified dist bundle.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const parserRevision = 'bcf2c3ac58b45e7d5391716393586b00b11e0c1a';
export const parserRoot = process.env.SNF_PARSER_ROOT && path.resolve(process.env.SNF_PARSER_ROOT);
if (!parserRoot) throw new Error('Set SNF_PARSER_ROOT to the pinned parser checkout; see README.md.');
const git = (...args) => execFileSync('git', ['-C', parserRoot, ...args], { encoding: 'utf8' }).trim();
const actualRevision = git('rev-parse', 'HEAD');
if (actualRevision !== parserRevision) throw new Error(`Parser revision mismatch: expected ${parserRevision}, got ${actualRevision}`);
const changed = git('status', '--porcelain', '--untracked-files=all', '--', 'src', 'package.json', 'pnpm-lock.yaml');
if (changed) throw new Error(`Pinned parser source/dependency manifests are modified:\n${changed}`);
// A checkout's index is not sufficient evidence: compare the on-disk source bytes with HEAD.
for (const line of git('ls-tree', '-r', parserRevision, '--', 'src', 'package.json', 'pnpm-lock.yaml').split('\n')) {
    const [, object, file] = line.match(/^\d+ blob ([a-f0-9]+)\t(.+)$/) ?? [];
    if (!object || git('hash-object', path.join(parserRoot, file)) !== object) throw new Error(`Parser source mismatch: ${file}`);
}
const requireFromParser = createRequire(path.join(parserRoot, 'package.json'));
const tsxPackage = JSON.parse(fs.readFileSync(requireFromParser.resolve('tsx/package.json'), 'utf8'));
if (tsxPackage.version !== '4.23.5') throw new Error(`Expected pinned parser toolchain tsx 4.23.5, got ${tsxPackage.version}`);
const { tsImport } = await import(pathToFileURL(requireFromParser.resolve('tsx/esm/api')).href);
export const parser = await tsImport(path.join(parserRoot, 'src/index.ts'), import.meta.url);
