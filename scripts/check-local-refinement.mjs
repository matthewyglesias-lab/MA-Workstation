/** Clinic-first scope: protect clinical engines, note grammar and existing record formats. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const baseline = '4bc9b5bb2390568bf75a5dd06fda50fbd8ae5790';
const protectedPaths = [
  'src/domain', 'src/application', 'src/persistence', 'src/documentation',
  'src/legacy', 'public/legacy', 'tests/fixtures', 'src/main.tsx',
  'package.json', 'package-lock.json', 'scripts/package-standalone.mjs',
];
// Explicitly authorized by the 2026-10-01 clinic-first request (see AUDIT.md).
// These changes are separately covered by failure/reload/browser tests. Existing
// Injection/UDS schemas, keys, clinical rules and note content remain protected.
const reviewedScope = new Set([
  'src/main.tsx',
  'src/persistence/storage.ts',
  'src/persistence/workflow-recovery.ts',
]);
// Only the documented unconfirmed-default corrections are permitted in these
// clinical/compatibility files. A different byte requires an explicit re-review.
const reviewedDefaults = new Map([
  ['src/domain/injection.ts', 'ad92ae767542c7411f77cce42273a63b3eb090ab518eb7da5d620dac7fbe3741'],
  ['src/legacy/legacy-markup.html', '97ea5fa36ff7e4b0a6ae9f56085f49b6994c9b99df868ce17fae470de430fbd2'],
  ['public/legacy/legacy-runtime.js', 'c570e6e85ceb1f9218fabe232c62a0c699b7c293d47f7def0194ee96e7586381'],
]);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
try {
  git('cat-file', '-e', `${baseline}^{commit}`);
  // Include the working tree, not just HEAD, so local pre-commit checks are real.
  const changed = [
    ...git('diff', '--no-renames', '--name-only', baseline, '--', ...protectedPaths).split('\n'),
    ...git('ls-files', '--others', '--exclude-standard', '--', ...protectedPaths).split('\n'),
  ].filter(Boolean);
  const unexpected = changed.filter(path => !reviewedScope.has(path) && !reviewedDefaults.has(path));
  if (unexpected.length) throw new Error(`Protected files changed:\n${unexpected.join('\n')}`);
  for (const [path, expected] of reviewedDefaults) {
    const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (actual !== expected) throw new Error(`Unreviewed clinical/default change: ${path}`);
  }
  console.log(`Clinical rules, note grammar and existing record schemas match ${baseline}; reviewed documentation defaults and recovery changes are explicit.`);
} catch (error) {
  console.error('Clinical preservation check failed. Use full git history and review the actual difference.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
