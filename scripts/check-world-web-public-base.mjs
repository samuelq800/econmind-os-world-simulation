import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Inspect already-built files only. No server, remote request, or deployment.
const base = process.argv[2];
assert(
  typeof base === 'string' &&
    /^\/(?:[A-Za-z0-9._~-]+\/)*$/u.exec(base)?.[0] === base &&
    !base.split('/').some((part) => part === '.' || part === '..'),
  'Pass the exact expected public base, e.g. / or /econmind-os-world-simulation/',
);
const root = fileURLToPath(new URL('../apps/world-web/dist/', import.meta.url));
const origin = 'https://preview.invalid';
const visited = new Set();
const failures = [];
let references = 0;

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : [filename];
  });
}

function resolveReference(reference, owner, errors = failures) {
  if (
    !reference ||
    /^(?:data:|blob:|mailto:|tel:|javascript:|#)/u.test(reference)
  )
    return;
  const url = new URL(
    reference.replaceAll('&amp;', '&'),
    origin + base + owner,
  );
  if (url.origin !== origin) return;
  references++;
  if (!url.pathname.startsWith(base)) {
    errors.push({ owner, reference, reason: 'OUTSIDE_PUBLIC_BASE' });
    return;
  }
  let relative = decodeURIComponent(url.pathname.slice(base.length));
  let filename = path.resolve(root, relative);
  if (filename !== path.resolve(root) && !filename.startsWith(root)) {
    errors.push({ owner, reference, reason: 'OUTSIDE_DIST' });
    return;
  }
  if (existsSync(filename) && statSync(filename).isDirectory()) {
    relative = path.posix.join(relative, 'index.html');
    filename = path.join(filename, 'index.html');
  }
  if (!existsSync(filename)) {
    errors.push({ owner, reference, reason: 'MISSING_FILE' });
    return;
  }
  return relative;
}

function visit(relative) {
  if (visited.has(relative)) return;
  visited.add(relative);
  if (!/\.(?:html|css|js|mjs)$/u.test(relative)) return;
  const text = readFileSync(path.join(root, relative), 'utf8');
  const patterns = relative.endsWith('.html')
    ? [/\b(?:src|href)\s*=\s*["']([^"']+)["']/gu]
    : relative.endsWith('.css')
      ? [/url\(\s*["']?([^)"']+)["']?\s*\)/gu]
      : [/\b(?:from\s*|import\s*\(\s*|import\s*)["'](\.{1,2}\/[^"']+)["']/gu];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const target = resolveReference(match[1].trim(), relative);
      if (target) visit(target);
    }
  }
}

const outputFiles = files(root);
const htmlFiles = outputFiles.filter((file) => file.endsWith('.html'));
for (const file of htmlFiles)
  visit(path.relative(root, file).split(path.sep).join('/'));
for (let number = 1; number <= 70; number++) {
  const id = String(number).padStart(2, '0');
  const country = JSON.parse(
    readFileSync(
      path.join(root, `season1-immersive/countries/data/${id}.json`),
      'utf8',
    ),
  );
  for (const key of ['scene', 'detail']) {
    assert.equal(typeof country[key], 'string', `${id}: missing ${key}`);
    resolveReference(country[key], 'season1-immersive/countries/index.html');
  }
}

const dormantCssFindings = [];
for (const file of outputFiles.filter((item) => item.endsWith('.css'))) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (visited.has(relative)) continue;
  for (const match of readFileSync(file, 'utf8').matchAll(
    /url\(\s*["']?([^)"']+)["']?\s*\)/gu,
  )) {
    resolveReference(match[1].trim(), relative, dormantCssFindings);
  }
}
const entry = readFileSync(path.join(root, 'index.html'), 'utf8');
const entryAssets = [
  ...entry.matchAll(/\b(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/gu),
].map((match) => match[1]);
assert(
  entryAssets.length > 0 &&
    entryAssets.every((ref) => ref.startsWith(`${base}assets/`)),
  'Entry asset base mismatch',
);
const rootRuntimeRepoTokens =
  base === '/'
    ? outputFiles
        .filter(
          (file) =>
            file.startsWith(path.join(root, 'assets') + path.sep) &&
            /\.(?:js|css)$/u.test(file) &&
            readFileSync(file, 'utf8').includes(
              '/econmind-os-world-simulation/',
            ),
        )
        .map((file) => path.relative(root, file))
    : [];
assert.equal(
  rootRuntimeRepoTokens.length,
  0,
  'Repository prefix in root-build runtime',
);
console.log(
  JSON.stringify(
    {
      status: failures.length ? 'FAIL' : 'PASS',
      base,
      htmlFiles: htmlFiles.length,
      reachableFiles: visited.size,
      checkedReferences: references,
      countryRecords: 70,
      mapReferences: 140,
      entryAssets,
      rootRuntimeRepoTokens,
      failures,
      dormantCssFindings,
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
