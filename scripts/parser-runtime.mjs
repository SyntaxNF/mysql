// All repository checks use an explicitly selected current parser build.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = process.env.SNF_PARSER_WORKTREE_MODULE;
if (!entry) throw new Error('Set SNF_PARSER_WORKTREE_MODULE to the current parser dist/esm/index.mjs; see README.md.');
export const parserInput = fs.realpathSync(path.resolve(entry));
export const parserRoot = path.resolve(path.dirname(parserInput), '../..');
export const parserRevision = 'working-tree-build';
if (parserInput !== path.join(parserRoot, 'dist/esm/index.mjs')
    || JSON.parse(fs.readFileSync(path.join(parserRoot, 'package.json'), 'utf8')).name !== 'snf-parser') {
    throw new Error('SNF_PARSER_WORKTREE_MODULE must point to snf-parser/dist/esm/index.mjs');
}
export const parser = await import(pathToFileURL(parserInput).href);
if (parser.UID_VERSION !== 'snf-uid-v1' || typeof parser.createAddUid !== 'function' || typeof parser.addDocumentUid !== 'function') {
    throw new Error('Parser build must expose the stable UID v1 API; rebuild before running checks');
}
const optional = new parser.SNFParser().parse('[ value ]').children.find(node => node.type === parser.NodeType.OPTIONAL);
if (!optional?.children?.some(node => node.type === parser.NodeType.VARIABLE)) {
    throw new Error('Parser build must implement explicit OPTIONAL/ENUM syntax; rebuild before running checks');
}
// A direct OPTIONAL child alone does not prove that bare alternatives are rejected.
let rejectsImplicitEnum = false;
try { new parser.SNFParser().parse('[ A | B ]'); }
catch (error) { rejectsImplicitEnum = error instanceof parser.SNFParseError; }
if (!rejectsImplicitEnum) throw new Error('Parser build must reject alternatives outside explicit braces; rebuild before running checks');
