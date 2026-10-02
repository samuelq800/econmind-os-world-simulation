import {
  findOfficialMapSource,
  loadOfficialMapPublication,
  renderOfficialMapDirectory,
  resolveOfficialMapPublicUrl,
  serializeOfficialMapIndex,
  sha256,
} from './official-map-publication-index.mjs';

// A bounded local check of the actual Vite preview / Pages-shaped build output.
// No economic API, production origin or simulation command is contacted.
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--site-base')
  throw new Error(
    'Use --site-base http://127.0.0.1:<port>/<optional-project-base>/',
  );
const base = new URL(args[1]);
if (
  base.protocol !== 'http:' ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) ||
  !base.pathname.endsWith('/') ||
  base.search ||
  base.hash ||
  base.username ||
  base.password
)
  throw new Error('OFFICIAL_MAP_SMOKE_LOCAL_SITE_REQUIRED');
const index = await loadOfficialMapPublication();

async function get(relativePath) {
  const url = new URL(relativePath, base).href;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
    cache: 'no-store',
  });
  if (response.status !== 200)
    throw new Error(`OFFICIAL_MAP_SMOKE_HTTP_STATUS:${response.status}:${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { url, bytes, contentType: response.headers.get('content-type') };
}

const requests = [];
for (const [relative, expected] of [
  ['official-map-source/index.json', serializeOfficialMapIndex(index)],
  [index.immutableIndexUrl, serializeOfficialMapIndex(index)],
  ['official-map-source/index.html', renderOfficialMapDirectory(index)],
]) {
  const response = await get(relative);
  if (response.bytes.toString('utf8') !== expected)
    throw new Error(`OFFICIAL_MAP_SMOKE_INDEX_MISMATCH:${relative}`);
  requests.push({
    url: response.url,
    bytes: response.bytes.length,
    sha256: sha256(response.bytes),
    status: 200,
  });
}
const samples = [
  'apps/world-web/src/assets/country-scenes/02.png',
  index.files.find(
    (file) =>
      file.countryNumber === '70' && file.classification === 'COUNTRY_DETAIL',
  )?.sourcePath,
  // The UTF-8 global path proves encoded public URLs bind to original filenames.
  'artifacts/world-geography/previews/国家总表.png',
];
for (const sourcePath of samples) {
  if (!sourcePath) throw new Error('OFFICIAL_MAP_SMOKE_SAMPLE_MISSING');
  const file = findOfficialMapSource(index, sourcePath);
  const response = await get(file.publicUrl);
  if (
    response.bytes.length !== file.bytes ||
    sha256(response.bytes) !== file.sha256 ||
    response.url !== resolveOfficialMapPublicUrl(index, sourcePath, base.href)
  )
    throw new Error(`OFFICIAL_MAP_SMOKE_SOURCE_MISMATCH:${sourcePath}`);
  requests.push({
    sourcePath,
    countryNumber: file.countryNumber,
    url: response.url,
    bytes: response.bytes.length,
    sha256: file.sha256,
    contentType: response.contentType,
    status: 200,
  });
}
console.log(
  JSON.stringify(
    {
      status: 'PASS',
      siteBase: base.href,
      manifestSha256: index.manifestSha256,
      requests,
      sampleCountries: ['02', '70'],
      globalSamples: 1,
      filesFetched: samples.length,
      liveWorldState: false,
      productionDeploymentVerified: false,
    },
    null,
    2,
  ),
);
