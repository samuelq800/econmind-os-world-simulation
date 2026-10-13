// Display-only context from the selected, immutable map publication.
// Geographic context stays separate from each country's illustrated scene.
const manifest =
  '9a83b2de3e0da39dae9e485e8de4be5bf236de26d68937c48c7941d7d50f795f';
const partitionHash =
  '394a43ffc94df7c27c8fe8610378d348f07c1680675c89ecad26300aa9c7b101';
const terrainHash =
  '4cc5e79b1293c5c5c6dbfecc0688a66aa031307ec144332c22f3fc962c179ed7';
const detailIndexHash =
  'b28794cb3285c6130c7f3c7d4e3af2f7c19f28eca625b3597e14636cdf360e06';
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
let detailIndexPromise;
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

async function loadDetailIndex() {
  if (!detailIndexPromise)
    detailIndexPromise = sourceBytes(
      'src/assets/country-detail/index.json',
      detailIndexHash,
      'DETAIL_INDEX',
    ).then((bytes) => {
      const maps = JSON.parse(new TextDecoder().decode(bytes));
      if (
        !Array.isArray(maps) ||
        maps.length !== 70 ||
        maps.some(
          (m) =>
            !Array.isArray(m.viewBox) ||
            m.viewBox.length !== 4 ||
            !m.viewBox.every(Number.isFinite) ||
            m.viewBox[2] <= 0 ||
            m.viewBox[3] <= 0 ||
            !/^\d{2}-[a-z]+\.svg$/.test(m.file),
        )
      )
        throw Error('DETAIL_INDEX_GEOMETRY_MISMATCH');
      return maps;
    });
  return detailIndexPromise;
}

// Fit and center the unchanged geographic bounds. At the source world edge,
// the camera may include unmapped blank space; source images still stop at
// their original extent. No tiling, mirrored coast or invented water is added.
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
  const w = Math.max(frame[2], frame[3] * aspect) * 1.05;
  const h = w / aspect;
  return [
    frame[0] + frame[2] / 2 - w / 2,
    frame[1] + frame[3] / 2 - h / 2,
    w,
    h,
  ];
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

// Only distinct circular anchors are direct hit targets. Dense/coincident
// records stay at their real coordinates and are selected from an ID list.
export function unambiguousPinIds(points, diameter = 28) {
  return points
    .filter((point, index) =>
      points.every(
        (other, otherIndex) =>
          index === otherIndex ||
          Math.hypot(point.x - other.x, point.y - other.y) >= diameter,
      ),
    )
    .map((point) => point.id);
}

// Dense groups are anchored at an existing source point, never a centroid.
export function geographicPinGroups(points, diameter = 30) {
  const remaining = new Set(points.map((p) => p.id)),
    groups = [];
  for (const first of points) {
    if (!remaining.delete(first.id)) continue;
    const members = [first];
    for (let i = 0; i < members.length; i++)
      for (const next of points) {
        if (
          remaining.has(next.id) &&
          Math.hypot(next.x - members[i].x, next.y - members[i].y) < diameter
        ) {
          remaining.delete(next.id);
          members.push(next);
        }
      }
    groups.push({
      id: first.id,
      x: first.x,
      y: first.y,
      ids: members.map((p) => p.id),
    });
  }
  return groups;
}

// HOME uses the same canonical geometry as the atlas. Original scene anchors
// remain owned by the legacy controller and are never reinterpreted as geography.
export function homeCamera(box, scale, dx, dy, worldWidth, worldHeight) {
  const aspect = box[2] / box[3];
  const width = Math.min(
    worldWidth * 2,
    worldHeight * aspect * 2,
    Math.max(24, box[2] * scale),
  );
  const height = width / aspect;
  const cx = box[0] + box[2] / 2 + dx;
  const cy = box[1] + box[3] / 2 + dy;
  return [
    Math.max(-width, Math.min(worldWidth, cx - width / 2)),
    Math.max(-height, Math.min(worldHeight, cy - height / 2)),
    width,
    height,
  ];
}

export async function mountCountrySurroundings(root, country) {
  if (!root.isConnected || root.dataset.surroundingsMounted) return;
  root.dataset.surroundingsMounted = 'true';
  disposePrevious?.();
  disposePrevious = undefined;
  const note = document.createElement('small');
  note.className = 'national-map-layer-note';
  note.textContent =
    'Continuous geographic detail maps · Original coordinates · 推演细节，非测绘';
  root.querySelector('.national-edition').append(note);
  try {
    const [partition, terrain, detailIndex] = await Promise.all([
      loadPartition(),
      loadTerrain(),
      loadDetailIndex(),
    ]);
    if (!root.isConnected) return;
    const scene = root.querySelector('.national-world');
    const svg = regionalSvg(partition, country);
    if (!scene || !svg) throw Error('SURROUNDINGS_COUNTRY_MISSING');
    const detailBox = country.viewBox;
    if (
      !Array.isArray(detailBox) ||
      detailBox.length !== 4 ||
      !detailBox.every(Number.isFinite) ||
      detailBox[2] <= 0 ||
      detailBox[3] <= 0
    )
      throw Error('SURROUNDINGS_DETAIL_GEOMETRY_MISSING');
    // Resolve at the deployed public module base, before CSS consumes the URL.
    // A relative URL inherited through a custom property uses the stylesheet's
    // base, which differs from the original country page's asset base.
    scene.style.setProperty(
      '--national-scene-art',
      `url("${new URL(`season1-immersive/countries/${country.scene}`, moduleUrl).href}")`,
    );
    svg.children[0].setAttribute('href', terrain);
    svg.classList.add('national-home-terrain');
    const selected = partition.territories.find((t) => t.id === country.id);
    const neighborDetails = node('g', {
      class: 'national-neighbor-details',
      'data-geographic-detail-context': 'true',
    });
    const neighborDefs = node('defs');
    const neighborImages = detailIndex
      .filter((m) => m.id !== country.id)
      .map((m) => {
        const territory = partition.territories.find((t) => t.id === m.id);
        if (!territory) throw Error('DETAIL_INDEX_COUNTRY_MISMATCH');
        const id = `home-neighbor-${m.number}`;
        const clip = node('clipPath', { id, clipPathUnits: 'userSpaceOnUse' });
        clip.append(node('path', { d: territory.path }));
        neighborDefs.append(clip);
        return {
          box: m.viewBox,
          node: node('image', {
            href: new URL(
              `season1-immersive/countries/assets/details/${m.file}#svgView(preserveAspectRatio(none))`,
              moduleUrl,
            ).href,
            x: m.viewBox[0],
            y: m.viewBox[1],
            width: m.viewBox[2],
            height: m.viewBox[3],
            preserveAspectRatio: 'none',
            'clip-path': `url(#${id})`,
            'pointer-events': 'none',
            'data-neighbor-detail': m.number,
          }),
        };
      });
    svg.insertBefore(neighborDetails, svg.children[1]);
    svg.append(neighborDefs);
    const clipId = `home-detail-${country.id}`;
    const clipDefs = node('defs');
    const clip = node('clipPath', {
      id: clipId,
      clipPathUnits: 'userSpaceOnUse',
    });
    clip.append(node('path', { d: selected.path }));
    clipDefs.append(clip);
    svg.append(
      clipDefs,
      node('image', {
        href: new URL(
          `season1-immersive/countries/${country.detail}#svgView(preserveAspectRatio(none))`,
          moduleUrl,
        ).href,
        x: detailBox[0],
        y: detailBox[1],
        width: detailBox[2],
        height: detailBox[3],
        preserveAspectRatio: 'none',
        'clip-path': `url(#${clipId})`,
        'data-canonical-detail': country.id,
      }),
    );
    root.dataset.homeMap = 'true';
    root.dataset.mapPresentation = 'geographic';
    root.dataset.cameraPolicy = 'COUNTRY_CENTERED_UNMAPPED_EDGE_BLANK';
    scene.setAttribute('role', 'region');
    scene.setAttribute(
      'aria-label',
      `${country.name} continuous geographic map`,
    );
    const viewport = document.createElement('div');
    viewport.className = 'national-geographic-viewport';
    viewport.tabIndex = 0;
    viewport.setAttribute('aria-label', '本国地图：方向键平移，加减键缩放');
    viewport.append(svg);
    const markers = document.createElement('div');
    markers.className = 'national-geographic-markers';
    viewport.append(markers);
    const toolbar = document.createElement('nav');
    toolbar.className = 'national-map-toolbar';
    const countries = document.createElement('select');
    countries.setAttribute('aria-label', '切换地图国家');
    for (const t of partition.territories) {
      const option = document.createElement('option');
      option.value = t.number;
      option.textContent =
        t.id === country.id
          ? `${t.number} · ${country.name}`
          : `国家 ${t.number}`;
      countries.append(option);
    }
    countries.value = country.number;
    countries.addEventListener('change', () => {
      const url = new URL('season1-immersive/', moduleUrl);
      url.searchParams.set('role', root.dataset.office || 'finance');
      url.searchParams.set('country', countries.value);
      url.hash = 'country';
      window.location.assign(url.href);
    });
    const worldLink = document.createElement('a');
    worldLink.href = new URL('./?atlas=explorer', moduleUrl).href;
    worldLink.textContent = '返回世界 ↗';
    toolbar.append(countries, worldLink);
    const mode = document.createElement('button');
    mode.type = 'button';
    mode.className = 'national-map-mode';
    mode.textContent = '查看原场景插图';
    mode.setAttribute('aria-pressed', 'false');
    const controls = document.createElement('div');
    controls.className = 'national-map-camera';
    const inspector = document.createElement('aside');
    inspector.className = 'national-map-inspector';
    inspector.hidden = true;
    inspector.setAttribute('aria-live', 'polite');
    const chooser = document.createElement('details');
    chooser.className = 'national-map-sites';
    const summary = document.createElement('summary');
    summary.textContent = '按编号选择设施';
    const choices = document.createElement('div');
    chooser.append(summary, choices);
    const sites = country.facilities.filter(
      (site) =>
        site.countryId === country.id &&
        projectPoint(site.point, country.frame, 1, 1),
    );
    let selectedId = '';
    const openSite = (id) => {
      const site = sites.find((item) => item.id === id);
      if (!site) return;
      selectedId = id;
      inspector.replaceChildren();
      const title = document.createElement('strong');
      title.textContent = `${site.id} · ${site.name}`;
      const detail = document.createElement('a');
      const url = new URL('season1-immersive/countries/', moduleUrl);
      url.searchParams.set('role', root.dataset.office || 'finance');
      url.searchParams.set('country', country.number);
      url.hash = `facilities/${site.id}`;
      detail.href = url.href;
      detail.textContent = '打开原设施记录 ↗';
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = '关闭设施信息';
      close.addEventListener('click', () => {
        inspector.hidden = true;
        render();
      });
      inspector.dataset.siteId = site.id;
      inspector.append(title, detail, close);
      inspector.hidden = false;
      chooser.open = false;
      render();
    };
    const makeSiteButton = (site, className) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.dataset.homeSiteId = site.id;
      button.setAttribute('aria-label', `查看设施 ${site.id} ${site.name}`);
      button.textContent = className ? site.id : `${site.id} · ${site.name}`;
      button.addEventListener('click', () => openSite(site.id));
      return button;
    };
    choices.append(...sites.map((site) => makeSiteButton(site, '')));
    summary.addEventListener('click', () => {
      if (!chooser.open)
        choices.replaceChildren(
          ...sites.map((site) => makeSiteButton(site, '')),
        );
    });
    let box;
    const render = () => {
      if (!box) return;
      svg.setAttribute('viewBox', box.join(' '));
      const visibleDetails = neighborImages
        .filter(
          (m) =>
            m.box[0] < box[0] + box[2] &&
            m.box[0] + m.box[2] > box[0] &&
            m.box[1] < box[1] + box[3] &&
            m.box[1] + m.box[3] > box[1],
        )
        .map((m) => m.node);
      if (
        visibleDetails.length !== neighborDetails.children.length ||
        visibleDetails.some((n, i) => neighborDetails.children[i] !== n)
      )
        neighborDetails.replaceChildren(...visibleDetails);
      const width = viewport.clientWidth,
        height = viewport.clientHeight;
      const points = sites.map((site) => {
        const p = projectPoint(site.point, box, width, height);
        return { id: site.id, x: p[0], y: p[1] };
      });
      const groups = geographicPinGroups(points, 30);
      const bounds = viewport.getBoundingClientRect();
      const covered = [toolbar, controls, mode, chooser, inspector]
        .filter((e) => !e.hidden)
        .map((e) => e.getBoundingClientRect());
      const visible = (point) => {
        const blocked = covered.some(
          (b) =>
            point.x + bounds.left >= b.left - 16 &&
            point.x + bounds.left <= b.right + 16 &&
            point.y + bounds.top >= b.top - 16 &&
            point.y + bounds.top <= b.bottom + 16,
        );
        return (
          !blocked &&
          point.x >= 16 &&
          point.y >= 16 &&
          point.x <= width - 16 &&
          point.y <= height - 16
        );
      };
      const buttons = [];
      for (const group of groups) {
        const selectedPoint = points.find(
          (p) => p.id === selectedId && group.ids.includes(p.id),
        );
        const point = selectedPoint || group;
        if (!visible(point)) continue;
        let button;
        if (group.ids.length > 1 && !selectedPoint) {
          button = document.createElement('button');
          button.type = 'button';
          button.className = 'national-geographic-pin';
          button.textContent = `+${group.ids.length}`;
          button.dataset.homeClusterIds = group.ids.join(',');
          button.setAttribute(
            'aria-label',
            `选择重叠设施 ${group.ids.join(' ')}`,
          );
          button.addEventListener('click', () => {
            choices.replaceChildren(
              ...sites
                .filter((s) => group.ids.includes(s.id))
                .map((s) => makeSiteButton(s, '')),
            );
            chooser.open = true;
          });
        } else
          button = makeSiteButton(
            sites.find((s) => s.id === point.id),
            'national-geographic-pin',
          );
        button.style.setProperty('left', `${point.x}px`);
        button.style.setProperty('top', `${point.y}px`);
        buttons.push(button);
      }
      markers.replaceChildren(...buttons);
    };
    const fit = () => {
      box = regionalViewBox(
        country.viewBox,
        viewport.clientWidth,
        viewport.clientHeight,
        partition.width,
        partition.height,
      );
      render();
    };
    const change = (scale, dx = 0, dy = 0) => {
      box = homeCamera(box, scale, dx, dy, partition.width, partition.height);
      render();
    };
    for (const [label, text, action] of [
      ['放大本国地图', '+', () => change(0.75)],
      ['缩小本国地图', '−', () => change(1.333333)],
      ['适配本国地图', '⌖', fit],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', action);
      controls.append(button);
    }
    let drag;
    viewport.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button,a,summary') || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY };
      viewport.setPointerCapture(e.pointerId);
    });
    viewport.addEventListener('pointermove', (e) => {
      if (!drag) return;
      change(
        1,
        ((drag.x - e.clientX) * box[2]) / viewport.clientWidth,
        ((drag.y - e.clientY) * box[3]) / viewport.clientHeight,
      );
      drag = { x: e.clientX, y: e.clientY };
    });
    const release = () => {
      drag = undefined;
    };
    viewport.addEventListener('pointerup', release);
    viewport.addEventListener('pointercancel', release);
    viewport.addEventListener('keydown', (e) => {
      if (e.target !== viewport) return;
      const key = e.key;
      if (
        ![
          '+',
          '=',
          '-',
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
        ].includes(key)
      )
        return;
      e.preventDefault();
      change(
        key === '+' || key === '=' ? 0.75 : key === '-' ? 1.333333 : 1,
        key === 'ArrowLeft'
          ? -box[2] * 0.1
          : key === 'ArrowRight'
            ? box[2] * 0.1
            : 0,
        key === 'ArrowUp'
          ? -box[3] * 0.1
          : key === 'ArrowDown'
            ? box[3] * 0.1
            : 0,
      );
    });
    viewport.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          change(e.deltaY < 0 ? 0.9 : 1.1);
        }
      },
      { passive: false },
    );
    mode.addEventListener('click', () => {
      const illustrated = root.dataset.mapPresentation === 'geographic';
      root.dataset.mapPresentation = illustrated
        ? 'independent-illustration'
        : 'geographic';
      mode.textContent = illustrated ? '返回连续地理图' : '查看原场景插图';
      mode.setAttribute('aria-pressed', String(illustrated));
      viewport.hidden = illustrated;
      controls.hidden = illustrated;
      chooser.hidden = illustrated;
      inspector.hidden = true;
      if (!illustrated) render();
    });
    scene.append(viewport, toolbar, controls, mode, chooser, inspector);
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    fit();
    disposePrevious = () => observer.disconnect();
  } catch {
    note.textContent =
      'Continuous geography unavailable · Original illustration retained';
  }
}

// Native country.scene/detail images, pin coordinates, zoom and scroll remain
// owned by countries.js. This separate layer only supplies geographic context.
export async function mountLegacyCountryAtlas(root, country, publicationBase) {
  if (!root.isConnected || root.dataset.regionalAtlas) return;
  const viewport = root.querySelector('.map-viewport');
  if (!viewport) return;
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
    if (!svg) return;
    svg.children[0].setAttribute('href', terrain);
    svg.classList.add('legacy-regional-terrain');
    // Native mobile stages stretch detail images to their square viewport.
    // Match both axes rather than reintroducing SVG letterboxing behind them.
    svg.setAttribute('preserveAspectRatio', 'none');
    const image = root.querySelector('#country-image');
    const stage = root.querySelector('#map-stage');
    if (!image || !stage) return;
    const pinLayer = root.querySelector('#map-pins');
    const caption = root.querySelector('.map-caption');
    let choices;
    const updateResourceTargets = () => {
      if (!pinLayer || !caption) return;
      const resources = new URL(image.src).pathname.endsWith(country.detail);
      const buttons = Array.from(
        pinLayer.querySelectorAll('button[data-action=resource]'),
      );
      const points = buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          id: button.dataset.id,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      });
      const safe = new Set(unambiguousPinIds(points));
      for (const button of buttons) {
        const collision = resources && !safe.has(button.dataset.id);
        button.dataset.resourceCollision = String(collision);
        button.tabIndex = collision ? -1 : 0;
        button.setAttribute('aria-hidden', String(collision));
        const label = button.querySelector('em')?.getBoundingClientRect();
        const labelCoversAnotherTarget =
          label &&
          label.width > 0 &&
          buttons.some((other) => {
            if (other === button) return false;
            const target = other.getBoundingClientRect();
            const otherLabel = other
              .querySelector('em')
              ?.getBoundingClientRect();
            return [target, otherLabel].some(
              (rect) =>
                rect &&
                rect.width > 0 &&
                label.left < rect.right &&
                label.right > rect.left &&
                label.top < rect.bottom &&
                label.bottom > rect.top,
            );
          });
        button.dataset.resourceLabelHidden = String(
          Boolean(labelCoversAnotherTarget),
        );
      }
      if (resources && !choices) {
        choices = document.createElement('details');
        choices.className = 'map-resource-selector';
        const summary = document.createElement('summary');
        summary.textContent = 'Choose resource';
        const list = document.createElement('div');
        list.className = 'map-resource-choices';
        for (const resource of country.resources) {
          const button = document.createElement('button');
          // Reuse the existing native data-action router and exact record ID.
          button.dataset.action = 'resource';
          button.dataset.id = resource.id;
          button.textContent = `${resource.type.name} ${resource.id}`;
          button.setAttribute('aria-label', `Select resource ${resource.id}`);
          list.append(button);
        }
        choices.append(summary, list);
        caption.append(choices);
      }
      if (choices) choices.hidden = !resources;
    };
    const resize = () => {
      const frame = new URL(image.src).pathname.endsWith(country.detail)
        ? country.viewBox
        : country.frame;
      const outer = viewport.getBoundingClientRect();
      const inner = stage.getBoundingClientRect();
      if (!(inner.width > 0 && inner.height > 0)) return;
      const scaleX = frame[2] / inner.width;
      const scaleY = frame[3] / inner.height;
      // Native image, canonical terrain and country paths share this affine
      // camera. Stage zoom and viewport scrolling move every layer together.
      svg.setAttribute(
        'viewBox',
        [
          frame[0] - (inner.left - outer.left) * scaleX,
          frame[1] - (inner.top - outer.top) * scaleY,
          outer.width * scaleX,
          outer.height * scaleY,
        ].join(' '),
      );
      updateResourceTargets();
    };
    resize();
    root.prepend(svg);
    root.dataset.regionalAtlas = 'true';
    root.dataset.sourceManifest = manifest;
    const selected = partition.territories.find(
      (territory) => territory.id === country.id,
    );
    // Mask the image only: countries.js retains its native stage, zoom,
    // original scene anchors, geographic pins and all click/keyboard controls.
    const applyImageMask = () => {
      if (!image || !selected || !image.src || !root.isConnected) return;
      const geographic = new URL(image.src).pathname.endsWith(country.detail);
      root.dataset.mapPresentation = geographic
        ? 'geographic'
        : 'independent-illustration';
      svg.style.display = geographic ? '' : 'none';
      if (geographic) {
        // Original SVG width/height and geographic viewBox have different
        // ratios. A native SVG view fragment removes internal letterboxing
        // without rewriting the original asset or moving geographic pins.
        const detailUrl = new URL(image.src);
        if (detailUrl.hash !== '#svgView(preserveAspectRatio(none))') {
          detailUrl.hash = 'svgView(preserveAspectRatio(none))';
          image.src = detailUrl.href;
        }
        const mask = node('svg', {
          xmlns: 'http://www.w3.org/2000/svg',
          viewBox: country.viewBox.join(' '),
          preserveAspectRatio: 'none',
        });
        mask.append(node('path', { d: selected.path, fill: 'white' }));
        image.style.maskImage = `url("data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(mask))}")`;
        image.style.maskComposite = 'add';
      } else {
        // A perspective illustration has no geographic coast to blend.
        image.style.maskImage = 'none';
        image.style.maskComposite = 'add';
      }
      image.style.maskSize = '100% 100%';
      image.style.maskPosition = 'center';
      image.style.maskRepeat = 'no-repeat';
      resize();
    };
    applyImageMask();
    const observer = new ResizeObserver(() => {
      if (!root.isConnected) {
        observer.disconnect();
        imageObserver.disconnect();
        viewport.removeEventListener('scroll', resize);
        pinObserver?.disconnect();
      } else resize();
    });
    observer.observe(viewport);
    observer.observe(stage);
    viewport.addEventListener('scroll', resize, { passive: true });
    const pinObserver = pinLayer
      ? new MutationObserver((records) => {
          updateResourceTargets();
          if (choices && records?.some((record) => record.type === 'childList'))
            choices.open = false;
        })
      : undefined;
    pinObserver?.observe(pinLayer, {
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    const imageObserver = new MutationObserver(applyImageMask);
    if (image)
      imageObserver.observe(image, {
        attributes: true,
        attributeFilter: ['src'],
      });
  } catch {
    // Native country images and controls remain available without context.
  }
}
