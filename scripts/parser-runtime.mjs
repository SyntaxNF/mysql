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
if (parser.UID_VERSION !== 'UID_V1' || typeof parser.SNFDocumentParser !== 'function') {
    throw new Error('Parser build must expose the final AST API; rebuild before running checks');
}
const document = new parser.SNFDocumentParser().parse('SELECT item [, ...]\n\n# WHERE item\nvalue');
const loop = document.entries?.[0]?.ast.children?.find(node => node.type === parser.NodeType.LOOP);
if (loop?.separator !== ',' || loop.children?.[0]?.type !== parser.NodeType.COLLECTION
    || loop.children[0].children?.[0]?.name !== 'value' || !loop.uid) {
    throw new Error('Parser build must compile definitions and loops with metadata; rebuild before running checks');
}
