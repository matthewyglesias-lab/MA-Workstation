'use strict';

const http = require('node:http');
const { createReadStream } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

function port() {
  const index = process.argv.indexOf('--port');
  const value = index >= 0 ? process.argv[index + 1] : process.env.PORT || '3000';
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return parsed;
}

function requestedFile(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl || '/', 'http://localhost').pathname);
  } catch {
    return null;
  }

  if (pathname.includes('\\') || pathname.includes('\0')) return null;
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (relative.split('/').some(segment => !segment || segment.startsWith('.'))) return null;

  const resolved = path.resolve(root, relative);
  return resolved.startsWith(rootPrefix) ? resolved : null;
}

function sendStatus(response, status, message) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(message);
}

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    sendStatus(response, 405, 'Method not allowed');
    return;
  }

  const file = requestedFile(request.url);
  if (!file) {
    sendStatus(response, 404, 'Not found');
    return;
  }

  let stats;
  try {
    stats = await fs.stat(file);
  } catch {
    sendStatus(response, 404, 'Not found');
    return;
  }

  if (!stats.isFile()) {
    sendStatus(response, 404, 'Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stats.size,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  createReadStream(file).on('error', () => {
    if (!response.headersSent) sendStatus(response, 500, 'Unable to read file');
    else response.destroy();
  }).pipe(response);
});

const listenPort = port();
server.listen(listenPort, '127.0.0.1', () => {
  console.log(`Static app available at http://127.0.0.1:${listenPort}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
