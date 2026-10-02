import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const entry = new URL(
  '../apps/world-web/dist/season1-immersive/index.html',
  import.meta.url,
);
const anchor = '<script src="country-context.js"></script>';
const start = '<!-- official-source-read-config:start -->';
const end = '<!-- official-source-read-config:end -->';

// This is a public, credential-free endpoint, supplied only after E's release
// verification. No endpoint is inferred from project IDs or browser URLs.
export function configurePage(html, address) {
  const marker = new RegExp(`${start}[\\s\\S]*?${end}`, 'g');
  const clean = html.replace(marker, '');
  if (clean.split(anchor).length !== 2)
    throw Error('OFFICIAL_READ_SCRIPT_ANCHOR_INVALID');
  if (address === undefined || address === '') return clean;
  let url;
  try {
    url = new URL(address);
  } catch {
    throw Error('OFFICIAL_READ_BASE_URL_INVALID');
  }
  const edgePath = '/functions/v1/world-v2-official-read';
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    ![edgePath, `${edgePath}/`].includes(url.pathname)
  )
    throw Error('OFFICIAL_READ_BASE_URL_INVALID');
  url.pathname = `${edgePath}/`;
  const config = JSON.stringify({ apiBaseUrl: url.href }).replaceAll(
    '<',
    '\\u003c',
  );
  return clean.replace(
    anchor,
    `${start}<script>window.__ECONMIND_WORLD_READ_CONFIG__=Object.freeze(${config});</script>${end}${anchor}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = await readFile(entry, 'utf8');
  const configured = configurePage(
    html,
    process.env.WORLD_OFFICIAL_READ_BASE_URL,
  );
  if (configured !== html) await writeFile(entry, configured);
  process.stdout.write(
    JSON.stringify({
      officialSourceRead: process.env.WORLD_OFFICIAL_READ_BASE_URL
        ? 'CONFIGURED_READ_ONLY'
        : 'NOT_CONFIGURED',
      liveWorldState: false,
    }) + '\n',
  );
}
