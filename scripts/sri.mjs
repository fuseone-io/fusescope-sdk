// Prints the Subresource Integrity hash of each script-tag bundle.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'packages/browser/dist';
const out = {};
for (const file of readdirSync(dir).filter((f) => f.endsWith('.min.js'))) {
  out[file] = `sha384-${createHash('sha384')
    .update(readFileSync(join(dir, file)))
    .digest('base64')}`;
}
writeFileSync(join(dir, 'sri.json'), `${JSON.stringify(out, null, 2)}\n`);
for (const [file, integrity] of Object.entries(out)) console.log(`${file} ${integrity}`);
