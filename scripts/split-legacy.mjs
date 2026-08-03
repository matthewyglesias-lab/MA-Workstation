import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const sourceSpec = process.argv[2];
const force = process.argv.includes('--force');
if (!sourceSpec) {
  throw new Error(
    'This archival extraction is destructive. Pass an explicit source such as ' +
      '"git:bc4a255:index.html" and --force.',
  );
}
const html = sourceSpec.startsWith('git:')
  ? execFileSync('git', ['show', sourceSpec.slice(4)], {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    })
  : await readFile(resolve(projectRoot, sourceSpec), 'utf8');

const bodyMatch = html.match(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i);
if (!bodyMatch) {
  throw new Error('Could not locate the application body in index.html.');
}

const styles = [...html.matchAll(/(<style(?:\s[^>]*)?>)([\s\S]*?)<\/style>/gi)]
  .map(
    (match, index) =>
      `/* Legacy stylesheet block ${index + 1}: ${match[1]} */\n` +
      `${match[2].trim()}\n/* </style> */`,
  )
  .join('\n\n');

const scripts = [...html.matchAll(/(<script(?:\s[^>]*)?>)([\s\S]*?)<\/script>/gi)]
  .map(
    (match, index) =>
      `/* Legacy runtime block ${index + 1}: ${match[1]} */\n` +
      `${match[2].trim()}\n/* </script> */`,
  )
  .join('\n\n;\n\n');

const markup = bodyMatch[1]
  .replace(/<style(?:\s[^>]*)?>[\s\S]*?<\/style>/gi, '')
  .replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi, '')
  .trim();

const outputs = [
  ['src/legacy/legacy-markup.html', markup],
  ['public/legacy/legacy.css', styles],
  ['public/legacy/legacy-runtime.js', scripts],
];

for (const [relativePath, content] of outputs) {
  const outputPath = resolve(projectRoot, relativePath);
  if (!force) {
    try {
      await access(outputPath);
      throw new Error(
        `${relativePath} already exists. Re-run with --force only when intentionally ` +
          're-extracting the production baseline; post-extraction compatibility fixes ' +
          'will otherwise be lost.',
      );
    } catch (error) {
      if (error instanceof Error && !('code' in error)) throw error;
      if (
        error instanceof Error &&
        'code' in error &&
        error.code !== 'ENOENT'
      ) {
        throw error;
      }
    }
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${content}\n`, 'utf8');
}

console.log(
  `Split index.html into ${styles.length.toLocaleString()} CSS characters, ` +
  `${scripts.length.toLocaleString()} runtime characters, and ` +
  `${markup.length.toLocaleString()} markup characters.`,
);
