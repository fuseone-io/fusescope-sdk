// Licence gate for the production dependency tree of the published packages.
// Usage: pnpm licenses list --prod --json | node scripts/licenses.mjs
import { pathToFileURL } from 'node:url';

export const ALLOWED = ['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD'];
const DENIED = /\b(A?GPL|LGPL|SSPL|BUSL)\b|Commons-Clause/i;

const major = (v) => Number.parseInt(v.split('.')[0], 10);

/** Returns the violations in a `pnpm licenses list --json` report. */
export function check(report) {
  const problems = [];
  for (const [license, packages] of Object.entries(report)) {
    for (const p of packages) {
      const id = `${p.name}@${p.versions.join(',')}`;
      if (p.name === 'ua-parser-js' && p.versions.some((v) => major(v) >= 2)) {
        problems.push(`${id}: ua-parser-js 2.x is AGPL-3.0; only 1.x (MIT) is allowed`);
      }
      // SPDX expressions such as "(MIT OR Apache-2.0)" pass when any alternative is allowed.
      const ids = license.replace(/[()]/g, '').split(/\s+OR\s+/);
      if (DENIED.test(license) && !ids.some((l) => ALLOWED.includes(l)))
        problems.push(`${id}: ${license} is forbidden`);
      else if (!ids.some((l) => ALLOWED.includes(l)))
        problems.push(`${id}: ${license} is not in ${ALLOWED.join(', ')}`);
    }
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const report = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  const problems = check(report);
  for (const [license, packages] of Object.entries(report))
    console.log(`${license}: ${packages.map((p) => p.name).join(', ')}`);
  if (problems.length) {
    console.error(`\nLicence check failed:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log('\nLicence check passed.');
}
