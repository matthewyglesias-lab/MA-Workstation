/** Fail closed outside the explicitly approved presentation and AVS-copy scope. */
import { execFileSync } from 'node:child_process';
const baseline = '59551bc914b945f268710fca3ef44c2e9ca62c50';
const protectedPaths = [
  'src/domain', 'src/application', 'src/persistence', 'src/documentation',
  'src/legacy', 'public/legacy', 'tests/fixtures', 'src/main.tsx',
  'package.json', 'package-lock.json', 'scripts/package-standalone.mjs',
];
// User-approved 2026-10-01 AVS hours/visit-copy exception. Exact blob pins,
// not a general exemption for these paths. The original guidance is retained.
const approvedAvsBlobs = new Map([
  ['src/domain/injection-avs-content.ts', 'fad35abd60a7f5b45b2200399ea033a3d9153a25'],
  ['src/domain/injection-avs-guidance.ts', 'c1c0664d922cdf414590cc4e1e3fda061a7126aa'],
  ['tests/fixtures/print-baseline-v1.json', 'cae9bf84936e0dd0e5fdd4532174a14be158c5b8'],
]);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
try {
  git('cat-file', '-e', `${baseline}^{commit}`);
  const changed = git('diff', '--no-renames', '--name-only', baseline, 'HEAD', '--', ...protectedPaths)
    .split('\n').filter(Boolean);
  const unexpected = changed.filter(path => !approvedAvsBlobs.has(path));
  if (unexpected.length) throw new Error(`Protected files changed:\n${unexpected.join('\n')}`);
  for (const [path, sha] of approvedAvsBlobs) {
    if (git('rev-parse', `HEAD:${path}`) !== sha) {
      throw new Error(`Approved AVS content drifted: ${path}`);
    }
  }
  if (git('rev-parse', `${baseline}:src/domain/injection-avs-content.ts`) !==
      git('rev-parse', 'HEAD:src/domain/injection-avs-guidance.ts')) {
    throw new Error('Preserved medication guidance differs from the pinned baseline.');
  }
  console.log(`Protected paths match ${baseline}, except the exact approved AVS hours/visit-copy patch.`);
} catch (error) {
  console.error('Local refinement boundary failed. Use full git history; do not skip this check.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
