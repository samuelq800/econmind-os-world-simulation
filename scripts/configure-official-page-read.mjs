import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const entry = new URL(
  '../apps/world-web/dist/season1-immersive/index.html',
  import.meta.url,
);
const rootEntry = new URL('../apps/world-web/dist/index.html', import.meta.url);
const anchor = '<script src="country-context.js"></script>';
const start = '<!-- official-source-read-config:start -->';
const end = '<!-- official-source-read-config:end -->';

// This is a public, credential-free endpoint, supplied only after E's release
// verification. No endpoint is inferred from project IDs or browser URLs.
function configureAnchoredPage(html, address, insertionAnchor, anchorError) {
  const marker = new RegExp(`${start}[\\s\\S]*?${end}`, 'g');
  const clean = html.replace(marker, '');
  if (clean.split(insertionAnchor).length !== 2) throw Error(anchorError);
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
    insertionAnchor,
    `${start}<script>window.__ECONMIND_WORLD_READ_CONFIG__=Object.freeze(${config});</script>${end}${insertionAnchor}`,
  );
}

export function configurePage(html, address) {
  return configureAnchoredPage(
    html,
    address,
    anchor,
    'OFFICIAL_READ_SCRIPT_ANCHOR_INVALID',
  );
}

export function configureRootPage(html, address) {
  return configureAnchoredPage(
    html,
    address,
    '</head>',
    'OFFICIAL_READ_ROOT_ANCHOR_INVALID',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const address = process.env.WORLD_OFFICIAL_READ_BASE_URL;
  const [html, rootHtml] = await Promise.all([
    readFile(entry, 'utf8'),
    readFile(rootEntry, 'utf8'),
  ]);
  // Validate both outputs before writing either one. The same one public config
  // path feeds both pages; this never changes the immutable source HTML.
  const configured = configurePage(html, address);
  const configuredRoot = configureRootPage(rootHtml, address);
  if (configured !== html) await writeFile(entry, configured);
  if (configuredRoot !== rootHtml) await writeFile(rootEntry, configuredRoot);
  process.stdout.write(
    JSON.stringify({
      officialSourceRead: address ? 'CONFIGURED_READ_ONLY' : 'NOT_CONFIGURED',
      liveWorldState: false,
    }) + '\n',
  );
}
