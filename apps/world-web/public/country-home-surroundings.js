// Display-only context from the selected, immutable map publication.
// One geographic projection for the country and every neighbouring territory.
const manifest =
  '9a83b2de3e0da39dae9e485e8de4be5bf236de26d68937c48c7941d7d50f795f';
const partitionHash =
  '394a43ffc94df7c27c8fe8610378d348f07c1680675c89ecad26300aa9c7b101';
const terrainHash =
  '4cc5e79b1293c5c5c6dbfecc0688a66aa031307ec144332c22f3fc962c179ed7';
// Keep this runtime publication URL out of Vite's asset-glob transform.
// The bundled legacy entry supplies its deployment base before loading sources.
const moduleUrl = import.meta.url;
let sourceRoot = new URL(
  `official-map-source/${manifest}/files/apps/world-web/`,
  moduleUrl,
);
const ns = 'http://www.w3.org/2000/svg';
let partitionPromise;
let terrainPromise;
let disposePrevious;

async function sourceBytes(relative, expected, label) {
  const response = await fetch(new URL(relative, sourceRoot));
  if (!response.ok) throw Error(`${label}_SOURCE_UNAVAILABLE`);
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  if (hash !== expected) throw Error(`${label}_SOURCE_MISMATCH`);
  return bytes;
}

async function loadPartition() {
  if (!partitionPromise)
    partitionPromise = (async () => {
      const bytes = await sourceBytes(
        'src/map-lab/land-partition.json',
        partitionHash,
        'SURROUNDINGS',
      );
      const partition = JSON.parse(new TextDecoder().decode(bytes));
      if (
        partition.width !== 1774 ||
        partition.height !== 887 ||
        partition.sourceSha256 !== terrainHash ||
        partition.territories.length !== 70
      )
        throw Error('SURROUNDINGS_PROJECTION_MISMATCH');
      return partition;
    })();
  return partitionPromise;
}

async function loadTerrain() {
  if (!terrainPromise)
    terrainPromise = sourceBytes(
      'src/assets/asterra-satellite-terrain-v8.png',
      terrainHash,
      'TERRAIN',
    ).then((bytes) =>
      URL.createObjectURL(new Blob([bytes], { type: 'image/png' })),
    );
  return terrainPromise;
}

// Contain the geographic view in the real source extent without tiling, mirroring,
// distorting or inventing land at the poles/seam.
export function regionalViewBox(frame, width, height, worldWidth, worldHeight) {
  if (
    !Array.isArray(frame) ||
    frame.length !== 4 ||
    !frame.every(Number.isFinite) ||
    frame[2] <= 0 ||
    frame[3] <= 0 ||
    ![width, height, worldWidth, worldHeight].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    return null;
  const aspect = width / height;
  let h = Math.max(frame[2], frame[3]) * 2;
  let w = h * aspect;
  if (w < frame[2] * 2) {
    w = frame[2] * 2;
    h = w / aspect;
  }
  const fit = Math.min(1, worldWidth / w, worldHeight / h);
  w *= fit;
  h *= fit;
  const x = Math.max(
    0,
    Math.min(worldWidth - w, frame[0] + frame[2] / 2 - w / 2),
  );
  const y = Math.max(
    0,
    Math.min(worldHeight - h, frame[1] + frame[3] / 2 - h / 2),
  );
  return [x, y, w, h];
}

function node(name, attributes = {}) {
  const element = document.createElementNS(ns, name);
  for (const [key, value] of Object.entries(attributes))
    element.setAttribute(key, String(value));
  return element;
}

export function regionalSvg(partition, country) {
  const selected = partition.territories.find(
    (territory) => territory.id === country.id,
  );
  if (
    !selected ||
    !regionalViewBox(country.frame, 1, 1, partition.width, partition.height)
  )
    return null;
  const svg = node('svg', {
    'aria-hidden': 'true',
    'data-projection': 'V8_IMAGE_PIXELS_TOP_LEFT',
    'data-selected-country': country.id,
    preserveAspectRatio: 'xMidYMid meet',
  });
  svg.append(
    node('image', {
      href: new URL('src/assets/asterra-satellite-terrain-v8.png', sourceRoot)
        .href,
      width: partition.width,
      height: partition.height,
    }),
  );
  const boundaries = node('g', { class: 'national-surrounding-boundaries' });
  for (const territory of partition.territories)
    boundaries.append(
      node('path', {
        d: territory.path,
        'data-territory': territory.id,
        'vector-effect': 'non-scaling-stroke',
      }),
    );
  svg.append(boundaries);
  svg.append(
    node('path', {
      d: selected.path,
      class: 'national-surrounding-selected',
      'data-highlight-country': selected.id,
      'vector-effect': 'non-scaling-stroke',
    }),
  );
  // Spread the exact silhouette before smoothing it. A blur alone has half
  // coverage at a straight border and creates a sudden dark step just outside
  // the country. The saturated plateau keeps both sides of that border clear,
  // then fades the neighbouring context in the same world coordinates.
  const extent = {
    x: 0,
    y: 0,
    width: partition.width,
    height: partition.height,
  };
  const suffix = country.id;
  const defs = node('defs');
  const filter = node('filter', {
    id: `country-distance-${suffix}`,
    ...extent,
    filterUnits: 'userSpaceOnUse',
    'color-interpolation-filters': 'sRGB',
  });
  const distance = Math.max(country.frame[2], country.frame[3]) * 0.14;
  const coverage = node('feComponentTransfer');
  coverage.append(
    node('feFuncA', { type: 'table', tableValues: '0 0.333333 0.666667 1 1' }),
  );
  filter.append(
    node('feMorphology', { operator: 'dilate', radius: distance * 2 }),
    node('feGaussianBlur', {
      stdDeviation: distance,
    }),
    coverage,
  );
  defs.append(filter);
  const mask = node('mask', {
    id: `country-context-${suffix}`,
    ...extent,
    maskUnits: 'userSpaceOnUse',
    'mask-type': 'luminance',
  });
  mask.append(node('rect', { ...extent, fill: 'white' }));
  mask.append(
    node('path', {
      d: selected.path,
      fill: 'black',
      filter: `url(#country-distance-${suffix})`,
    }),
  );
  mask.append(node('path', { d: selected.path, fill: 'black' }));
  defs.append(mask);
  svg.append(defs);
  svg.append(
    node('rect', {
      ...extent,
      fill: '#081c24',
      opacity: 0.88,
      mask: `url(#country-context-${suffix})`,
      'data-distance-fade': 'country-outline',
    }),
  );
  return svg;
}

export function projectPoint(point, box, width, height) {
  if (
    !Array.isArray(point) ||
    point.length !== 2 ||
    !point.every(Number.isFinite)
  )
    return null;
  return [
    ((point[0] - box[0]) / box[2]) * width,
    ((point[1] - box[1]) / box[3]) * height,
  ];
}

export async function mountCountrySurroundings(root, country) {
  if (!root.isConnected || root.dataset.surroundingsMounted) return;
  root.dataset.surroundingsMounted = 'true';
  disposePrevious?.();
  disposePrevious = undefined;
  const note = document.createElement('small');
  note.className = 'national-map-layer-note';
  note.textContent = 'Regional atlas loading · No control over neighbours';
  root.querySelector('.national-edition').append(note);
  try {
    const [partition, terrain] = await Promise.all([
      loadPartition(),
      loadTerrain(),
    ]);
    if (!root.isConnected) return;
    const svg = regionalSvg(partition, country);
    if (!svg) throw Error('SURROUNDINGS_COUNTRY_MISSING');
    const backdrop = document.createElement('div');
    backdrop.className = 'national-surroundings';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.dataset.sourceManifest = manifest;
    backdrop.dataset.terrainSha256 = terrainHash;
    svg.children[0].setAttribute('href', terrain);
    backdrop.append(svg);
    const scene = root.querySelector('.national-world');
    scene.append(backdrop);
    root.dataset.regionalMap = 'true';
    note.textContent = 'Regional atlas · Nearby countries are context only';
    const resize = () => {
      const box = regionalViewBox(
        country.frame,
        scene.clientWidth,
        scene.clientHeight,
        partition.width,
        partition.height,
      );
      if (!box) return;
      svg.setAttribute('viewBox', box.join(' '));
      const sceneBounds = scene.getBoundingClientRect();
      const rootBounds = root.getBoundingClientRect();
      for (const site of country.facilities) {
        const pin = root.querySelector(
          `.national-site-pins [data-id="${site.id}"]`,
        );
        if (!pin || site.countryId !== country.id) continue;
        const point = projectPoint(
          site.point,
          box,
          scene.clientWidth,
          scene.clientHeight,
        );
        if (!point) continue;
        pin.style.setProperty(
          '--regional-pin-x',
          `${sceneBounds.left - rootBounds.left + point[0]}px`,
        );
        pin.style.setProperty(
          '--regional-pin-y',
          `${sceneBounds.top - rootBounds.top + point[1]}px`,
        );
        pin.dataset.regionalLocation = 'source-point';
        pin.dataset.regionalVisible = String(
          point[0] >= 12 &&
            point[0] <= scene.clientWidth - 12 &&
            point[1] >= 12 &&
            point[1] <= scene.clientHeight - 12,
        );
      }
      // Retained for the original illustration fallback and its unchanged pins.
      scene.style.setProperty(
        '--country-scene-size',
        `${Math.min(scene.clientWidth, scene.clientHeight)}px`,
      );
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    observer.observe(scene);
    disposePrevious = () => observer.disconnect();
  } catch {
    if (root.isConnected)
      note.textContent =
        'Regional atlas unavailable · Country illustration and source records unchanged';
  }
}

// The existing public country-directory page has its own scrollable zoom stage.
// Adapt that stage only; its record, controls, pin actions and routing stay native.
export async function mountLegacyCountryAtlas(root, country, publicationBase) {
  if (!root.isConnected || root.dataset.regionalAtlas) return;
  const stage = root.querySelector('#map-stage');
  if (!stage) return;
  // A bundled caller may relocate this module into assets/. Its explicit
  // public base must resolve the same pinned package as the standalone HOME.
  if (publicationBase)
    sourceRoot = new URL(
      `official-map-source/${manifest}/files/apps/world-web/`,
      publicationBase,
    );
  try {
    const [partition, terrain] = await Promise.all([
      loadPartition(),
      loadTerrain(),
    ]);
    if (!root.isConnected) return;
    const svg = regionalSvg(partition, country);
    const viewport = root.querySelector('.map-viewport');
    if (!viewport) return;
    let box = regionalViewBox(
      country.frame,
      viewport.clientWidth,
      viewport.clientHeight,
      partition.width,
      partition.height,
    );
    if (!svg || !box) return;
    stage.style.setProperty(
      '--regional-stage-ratio',
      String(viewport.clientWidth / viewport.clientHeight),
    );
    svg.children[0].setAttribute('href', terrain);
    svg.setAttribute('viewBox', box.join(' '));
    svg.classList.add('legacy-regional-terrain');
    stage.prepend(svg);
    root.dataset.regionalAtlas = 'true';
    root.dataset.sourceManifest = manifest;
    const projectPins = () => {
      for (const pin of stage.querySelectorAll('#map-pins [data-id]')) {
        const record = [...country.facilities, ...country.resources].find(
          (item) => item.id === pin.dataset.id && item.countryId === country.id,
        );
        const point = record && projectPoint(record.point, box, 100, 100);
        if (!point) continue;
        pin.style.left = `${point[0]}%`;
        pin.style.top = `${point[1]}%`;
        pin.dataset.regionalLocation = 'source-point';
      }
      const caption = root.querySelector('#map-caption-text');
      const text = 'Regional atlas · Source coordinates · Nearby countries are context only';
      if (caption && caption.textContent !== text) caption.textContent = text;
    };
    projectPins();
    const observer = new MutationObserver(projectPins);
    observer.observe(stage.querySelector('#map-pins'), {
      childList: true,
      subtree: true,
    });
    const resize = new ResizeObserver(() => {
      if (!root.isConnected) {
        resize.disconnect();
        observer.disconnect();
        return;
      }
      const next = regionalViewBox(
        country.frame,
        viewport.clientWidth,
        viewport.clientHeight,
        partition.width,
        partition.height,
      );
      if (!next) return;
      box = next;
      stage.style.setProperty(
        '--regional-stage-ratio',
        String(viewport.clientWidth / viewport.clientHeight),
      );
      svg.setAttribute('viewBox', box.join(' '));
      projectPins();
    });
    resize.observe(viewport);
  } catch {
    // Keep the exact original illustration and interactive controls if the
    // immutable geography cannot be verified; never synthesize neighbours.
  }
}
