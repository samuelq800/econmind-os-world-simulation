import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { demoSource } from './local-demo-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'apps/world-web/public');
const uiRoot = path.join(publicRoot, 'season1-immersive');
const sourceRoot = path.join(root, 'apps/world-web/src');
const port = Number(process.argv[2] || 4178);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error('DEMO_PORT_INVALID');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain',
  '.tsv': 'text/plain',
};
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

export function localFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (
    !decoded.startsWith('/local-demo/') ||
    decoded.includes('..') ||
    decoded.includes('\\') ||
    decoded.includes('\0')
  )
    return null;
  const relative = decoded.slice('/local-demo/'.length);
  if (relative === 'map/partition.json')
    return path.join(sourceRoot, 'map-lab/land-partition.json');
  if (relative === 'map/terrain.png')
    return path.join(sourceRoot, 'assets/asterra-satellite-terrain-v8.png');
  if (relative.startsWith('official-map-source/')) {
    if (
      relative.endsWith('/files/apps/world-web/src/map-lab/land-partition.json')
    )
      return path.join(sourceRoot, 'map-lab/land-partition.json');
    if (
      relative.endsWith(
        '/files/apps/world-web/src/assets/asterra-satellite-terrain-v8.png',
      )
    )
      return path.join(sourceRoot, 'assets/asterra-satellite-terrain-v8.png');
    return null;
  }
  if (
    /^office\/countries\/assets\/(?:scenes\/(?:0[1-9]|[1-6][0-9]|70)\.png|details\/(?:0[1-9]|[1-6][0-9]|70)-[a-z]+\.svg)$/.test(
      relative,
    )
  ) {
    const [, kind, filename] = relative.match(
      /^office\/countries\/assets\/(scenes|details)\/(.+)$/,
    );
    return path.join(
      sourceRoot,
      'assets',
      kind === 'scenes' ? 'country-scenes' : 'country-detail',
      filename,
    );
  }
  if (relative === 'office/' || relative === 'office/index.html')
    return path.join(publicRoot, 'local-demo/office.html');
  if (/^office\/countries\/(?:\d{2}\/)?$/.test(relative))
    return path.join(uiRoot, relative.slice(7), 'index.html');
  if (relative.startsWith('office/'))
    return path.join(uiRoot, relative.slice(7));
  if (
    relative.startsWith('shared/') ||
    relative.startsWith('specs-markdown-2026-09-27/')
  )
    return path.join(publicRoot, relative);
  if (
    ['country-home-layout.css', 'country-home-surroundings.js'].includes(
      relative,
    )
  )
    return path.join(publicRoot, relative);
  if (
    [
      '',
      'index.html',
      'demo.css',
      'demo.js',
      'office-demo.js',
      'office-demo.css',
      'map-camera.js',
    ].includes(relative)
  )
    return path.join(publicRoot, 'local-demo', relative || 'index.html');
  return null;
}

const server = createServer(async (request, response) => {
  response.setHeader('Content-Security-Policy', csp);
  response.setHeader('X-EconMind-Mode', 'DEMO_LOCAL');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405);
    response.end('DEMO_LOCAL is file-only. No command endpoint.');
    return;
  }
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const file = localFile(url.pathname);
  if (!file) {
    response.writeHead(404);
    response.end('Only /local-demo/ is available.');
    return;
  }
  try {
    if (!(await stat(file)).isFile()) throw Error('NOT_FILE');
    let bytes = await readFile(file);
    if (
      /^\/local-demo\/office\/(game|country-context|country-game|i18n)\.js$/.test(
        url.pathname,
      )
    )
      bytes = Buffer.from(
        demoSource(path.basename(file), bytes.toString('utf8')),
      );
    response.setHeader(
      'Content-Type',
      `${mime[path.extname(file)] || 'application/octet-stream'}${['.html', '.js', '.mjs', '.css', '.json', '.md', '.tsv'].includes(path.extname(file)) ? '; charset=utf-8' : ''}`,
    );
    response.writeHead(200);
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    response.writeHead(404);
    response.end(`DEMO_LOCAL asset unavailable: ${path.basename(file)}`);
    console.error('DEMO_LOCAL', file, error.message);
  }
});
server.on('error', (error) => {
  console.error(
    `DEMO_LOCAL did not start: ${error.message}. No process was killed.`,
  );
  process.exitCode = 1;
});
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  server.listen(port, '127.0.0.1', () =>
    console.log(
      JSON.stringify({
        mode: 'DEMO_LOCAL',
        url: `http://127.0.0.1:${port}/local-demo/`,
        pid: process.pid,
        root,
        noDatabase: true,
      }),
    ),
  );
}
