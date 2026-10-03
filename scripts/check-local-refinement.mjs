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
// Reviewed defaults, the optional handout type, and its explicit exclusion from
// administration-review invalidation are permitted in these
// clinical/compatibility files. A different byte requires an explicit re-review.
const reviewedDefaults = new Map([
  ['src/domain/injection.ts', 'f818945c954c06e8e549e19a864e6f3cdb8ccd926f893aadfe92db51f7594f2a'],
  ['src/legacy/legacy-markup.html', '97ea5fa36ff7e4b0a6ae9f56085f49b6994c9b99df868ce17fae470de430fbd2'],
  ['public/legacy/legacy-runtime.js', 'c570e6e85ceb1f9218fabe232c62a0c699b7c293d47f7def0194ee96e7586381'],
]);
// Authorized density/appointment follow-up, 2026-10-02. These exact bytes add
// optional reminder metadata and rendering, not medication/timing rules.
// See docs/density-appointment/IMPLEMENTATION.md. This is not a broad exemption.
const reviewedHandout = new Map([
  ['src/domain/avs-appointment.ts', '453a3997a2f971500bdfe107d07584497ac726646783def26dd59a44abab4f53'],
  ['src/domain/avs-appointment-render.ts', 'f1818a8d8e7d5bcfc801af2cdcc93e5267f5d1bf0af64a3feb275e3bdf116c2e'],
  ['src/domain/injection-avs-content.ts', '759b654e1cf1ac5ff9b3d97aac9d857b658eae9bc05c3eac682d1b3bbff4033d'],
  ['src/domain/injection-avs-render.ts', '39160256761589ce4e0c27425f47a60e5deb56f9404bb6d724f24803064d5776'],
  ['src/domain/injection-avs-guidance.ts', '4e4951d5427dbf4a70951ba9a1dc35485dbd69b711b87590f9fed19bf0eea7a9'],
]);
// Approved v2 ownership correction, 2026-10-03. Presentation policy resets only
// handout metadata when current encounter identity changes; no clinical rules.
// Exact bytes remain protected. See docs/lightfully-refinement/PROGRESS.md.
const reviewedRefinement = new Map([
  ['src/application/injection-identity-transition.ts', 'e678ea0302a03ac01ec6978eb4e4cb9f6e991c3c2ba632cad5a30878b0e217e2'],
  ['src/application/injection-workflow-progress.ts', 'a7248df2efaf7462f76f2a4b58a4ab43fdfccf91ed4b9298d3f7f3caed60427b'],
  ['src/application/readiness-projection.ts', '0a20f7d886a9fb79e3f37fe9f11ab68e6ad4b892106d21766ffaf4bce133ede4'],
]);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
try {
  git('cat-file', '-e', `${baseline}^{commit}`);
  // Include the working tree, not just HEAD, so local pre-commit checks are real.
  const changed = [
    ...git('diff', '--no-renames', '--name-only', baseline, '--', ...protectedPaths).split('\n'),
    ...git('ls-files', '--others', '--exclude-standard', '--', ...protectedPaths).split('\n'),
  ].filter(Boolean);
  const unexpected = changed.filter(path => !reviewedScope.has(path) && !reviewedDefaults.has(path) && !reviewedHandout.has(path) && !reviewedRefinement.has(path));
  if (unexpected.length) throw new Error(`Protected files changed:\n${unexpected.join('\n')}`);
  for (const [path, expected] of [...reviewedDefaults, ...reviewedHandout, ...reviewedRefinement]) {
    const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (actual !== expected) throw new Error(`Unreviewed clinical/default/handout change: ${path}`);
  }
  console.log(`Clinical rules, note grammar and existing record schemas match ${baseline}; reviewed documentation defaults, recovery and optional handout changes are explicit.`);
} catch (error) {
  console.error('Clinical preservation check failed. Use full git history and review the actual difference.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
