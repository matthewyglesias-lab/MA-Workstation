/** Fail closed if the controlled presentation increment changes protected behavior. */
import { execFileSync } from 'node:child_process';
const baseline = '59551bc914b945f268710fca3ef44c2e9ca62c50';
const protectedPaths = [
  'src/domain', 'src/application', 'src/persistence', 'src/documentation',
  'src/legacy', 'public/legacy', 'tests/fixtures', 'src/main.tsx',
  'package.json', 'package-lock.json', 'scripts/package-standalone.mjs',
];
try {
  execFileSync('git', ['cat-file', '-e', `${baseline}^{commit}`], { stdio: 'pipe' });
  const changed = execFileSync('git', ['diff', '--name-only', baseline, 'HEAD', '--', ...protectedPaths], { encoding: 'utf8' }).trim();
  if (changed) throw new Error(`Protected files changed:\n${changed}`);
  console.log(`Protected clinical, persistence, print, entrypoint, dependency and package paths match ${baseline}.`);
} catch (error) {
  console.error('Local refinement boundary failed. Use full git history; do not skip this check.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
