// Display-only context from the selected, immutable map publication.
// The illustrated country scene is a separate projection, never a map tile.
const manifest =
  '9a83b2de3e0da39dae9e485e8de4be5bf236de26d68937c48c7941d7d50f795f';
const partitionHash =
  '394a43ffc94df7c27c8fe8610378d348f07c1680675c89ecad26300aa9c7b101';
const terrainHash =
  '4cc5e79b1293c5c5c6dbfecc0688a66aa031307ec144332c22f3fc962c179ed7';
const sourceRoot = new URL(
  `official-map-source/${manifest}/files/apps/world-web/`,
  import.meta.url,
);
const ns = 'http://www.w3.org/2000/svg';
let partitionPromise;
let disposePrevious;

async function loadPartition() {
  if (!partitionPromise)
    partitionPromise = (async () => {
      const response = await fetch(
        new URL('src/map-lab/land-partition.json', sourceRoot),
      );
      if (!response.ok) throw Error('SURROUNDINGS_SOURCE_UNAVAILABLE');
      const bytes = await response.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hash = Array.from(new Uint8Array(digest), (value) =>
        value.toString(16).padStart(2, '0'),
      ).join('');
      if (hash !== partitionHash) throw Error('SURROUNDINGS_SOURCE_MISMATCH');
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

// Contain the geographic view in the real source extent without tiling, mirroring,
// distorting or inventing land at the poles/seam. The scene itself is NOT moved.
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
  return svg;
}

export async function mountCountrySurroundings(root, country) {
  if (!root.isConnected || root.dataset.surroundingsMounted) return;
  root.dataset.surroundingsMounted = 'true';
  disposePrevious?.();
  disposePrevious = undefined;
  const note = document.createElement('small');
  note.className = 'national-map-layer-note';
  note.textContent =
    'Regional atlas backdrop · Country scene is a separate illustration · No control over neighbours';
  root.querySelector('.national-edition').append(note);
  try {
    const partition = await loadPartition();
    if (!root.isConnected) return;
    const svg = regionalSvg(partition, country);
    if (!svg) throw Error('SURROUNDINGS_COUNTRY_MISSING');
    const backdrop = document.createElement('div');
    backdrop.className = 'national-surroundings';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.dataset.sourceManifest = manifest;
    backdrop.append(svg);
    root.prepend(backdrop);
    const scene = root.querySelector('.national-world');
    const resize = () => {
      const box = regionalViewBox(
        country.frame,
        root.clientWidth,
        root.clientHeight,
        partition.width,
        partition.height,
      );
      if (box) svg.setAttribute('viewBox', box.join(' '));
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
