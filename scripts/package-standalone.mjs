/**
 * Package the already-built, tested Vite artifact as one self-contained HTML.
 * No clinical source is reimplemented. Only asset locations are changed.
 * A file:// browser must still pass the application's existing storage and
 * writer-lock guards; this packager never supplies a persistence fallback.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve('dist');
const output = path.resolve('standalone');
const mime = { '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const dataUrl = (bytes, type) => `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
function assetPath(url, from = root) {
  const decoded = decodeURIComponent(url.split(/[?#]/)[0]);
  const resolved = path.resolve(decoded.startsWith('/') ? root : from, decoded.replace(/^\//, ''));
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Asset escapes dist: ${url}`);
  return resolved;
}
async function inlineCss(file) {
  const css = await fs.readFile(file, 'utf8');
  const matches = [...css.matchAll(/url\(\s*(["']?)([^)'"\s]+)\1\s*\)/g)];
  let result = css;
  for (const match of matches) {
    const url = match[2];
    if (/^(data:|#)/.test(url)) continue;
    if (/^(https?:|\/\/)/.test(url)) throw new Error(`External stylesheet asset is not standalone: ${url}`);
    const asset = assetPath(url, path.dirname(file));
    const type = mime[path.extname(asset)];
    if (!type) throw new Error(`Unsupported inline asset: ${asset}`);
    result = result.replace(match[0], `url("${dataUrl(await fs.readFile(asset), type)}")`);
  }
  return Buffer.from(result);
}

await fs.mkdir(output, { recursive: true });
let html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
if (scripts.length !== 1) throw new Error(`Expected one Vite entry, found ${scripts.length}; update the packager before shipping.`);
const jsFiles = (await fs.readdir(path.join(root, 'assets'))).filter(name => name.endsWith('.js'));
if (jsFiles.length !== 1) throw new Error('Code-split builds require an explicit single-file packaging update.');
const entry = assetPath(scripts[0][1]);
let code = await fs.readFile(entry, 'utf8');
const runtime = await fs.readFile(path.join(root, 'legacy/legacy-runtime.js'));
const legacyPattern = /(["'`])\/legacy\/legacy-runtime\.js\?v=[A-Za-z0-9._-]+\1/g;
if ([...code.matchAll(legacyPattern)].length !== 1) throw new Error('Could not uniquely locate the legacy loader asset.');
code = code.replace(legacyPattern, 'window.__IPMG_STANDALONE_RUNTIME_URL__');
code = code.replace(/\/\/# sourceMappingURL=.*$/gm, '');
code = code.replace(/<\/script/gi, '<\\/script');
const bootstrap = `<script>window.__IPMG_STANDALONE_RUNTIME_URL__=URL.createObjectURL(new Blob([Uint8Array.from(atob('${runtime.toString('base64')}'),c=>c.charCodeAt(0))],{type:'text/javascript'}));</script>`;
html = html.replace(scripts[0][0], () => `${bootstrap}\n<script type="module">${code}</script>`);
const links = [...html.matchAll(/<link\b[^>]*\bhref="([^"]+)"[^>]*>/g)];
for (const match of links) {
  if (match[1].startsWith('data:')) continue;
  if (/^(https?:|\/\/)/.test(match[1])) throw new Error(`Unexpected external link asset: ${match[1]}`);
  const file = assetPath(match[1]);
  const type = mime[path.extname(file)];
  if (!type) throw new Error(`Unsupported link asset: ${file}`);
  // The print stylesheet stays a stylesheet resource with its original bytes.
  const bytes = type === 'text/css' && !match[0].includes('media="print"')
    ? await inlineCss(file) : await fs.readFile(file);
  html = html.replace(match[0], match[0].replace(match[1], dataUrl(bytes, type)).replace(/\s+crossorigin(?:="[^"]*")?/, ''));
}
const filename = 'IPMG-MA-Workstation-Lightfully.html';
await fs.writeFile(path.join(output, filename), html);
await fs.writeFile(path.join(output, 'artifact-manifest.json'), JSON.stringify({
  format: 'IPMG standalone HTML v1',
  sourceCommit: process.env.GITHUB_SHA || null,
  output: filename,
  sha256: hash(html),
  originalLegacyRuntimeSha256: hash(runtime),
  originalLegacyPrintStylesheetSha256: hash(await fs.readFile(path.join(root, 'legacy/legacy.css'))),
  storage: 'Original browser-local storage and writer-lock guards, unchanged. No database or sync added.',
}, null, 2) + '\n');
console.log(`Packaged ${filename} (${Buffer.byteLength(html).toLocaleString()} bytes).`);
