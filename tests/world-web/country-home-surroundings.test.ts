import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const base = 'apps/world-web/';
const source = readFileSync(
  base + 'public/country-home-surroundings.js',
  'utf8',
);
const displayLanguageRead =
  "window.localStorage.getItem('econmind-ui-language')";
function readsOnlyDisplayLanguagePreference(code: string): boolean {
  const parts = code.split(displayLanguageRead);
  // Exactly one existing display-preference read; every other localStorage
  // reference (including aliases, economic keys and all writes) stays banned.
  return parts.length === 2 && !/localStorage/.test(parts.join(''));
}
const partitionBytes = readFileSync(base + 'src/map-lab/land-partition.json');
const partition = JSON.parse(partitionBytes.toString());
const terrainBytes = readFileSync(
  base + 'src/assets/asterra-satellite-terrain-v8.png',
);
const detailIndexBytes = readFileSync(
  base + 'src/assets/country-detail/index.json',
);
const country = (number: string) =>
  JSON.parse(
    readFileSync(
      base + `public/season1-immersive/countries/data/${number}.json`,
      'utf8',
    ),
  );

class Node {
  attributes: Record<string, string> = {};
  properties: Record<string, string> = {};
  dataset: Record<string, string> = {};
  children: Node[] = [];
  className = '';
  classList = { add: (name: string) => (this.className += ` ${name}`) };
  textContent = '';
  hidden = false;
  value = '';
  tabIndex = 0;
  clientWidth = 1920;
  clientHeight = 1080;
  isConnected = true;
  style = {
    display: '',
    maskImage: '',
    maskComposite: '',
    maskSize: '',
    maskPosition: '',
    maskRepeat: '',
    setProperty: (key: string, value: string) => {
      this.properties[key] = value;
    },
  };
  constructor(readonly tag = 'div') {}
  get src() {
    return this.attributes.src
      ? new URL(this.attributes.src, 'https://fixture.invalid/').href
      : '';
  }
  set src(value: string) {
    this.attributes.src = value;
  }
  getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: this.clientWidth,
    height: this.clientHeight,
  });
  setAttribute = (key: string, value: string) => {
    this.attributes[key] = value;
  };
  append = (...children: Node[]) => {
    this.children.push(...children);
  };
  replaceChildren = (...children: Node[]) => {
    this.children = children;
  };
  prepend = (child: Node) => {
    this.children.unshift(child);
  };
  insertBefore = (child: Node, reference: Node) => {
    this.children.splice(this.children.indexOf(reference), 0, child);
  };
  querySelector = vi.fn<(selector: string) => Node | null>(() => null);
  querySelectorAll = vi.fn<(selector: string) => Node[]>(() => []);
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

function fixture(
  failure?: 'http' | 'hash' | 'terrain-hash',
  initialLocale?: 'zh' | 'en',
) {
  const mission = new Node();
  const scene = new Node();
  const root = new Node();
  const pins = new Map<string, Node>(
    country('54').facilities.map((site: { id: string }) => [
      site.id,
      new Node('button'),
    ]),
  );
  root.querySelector.mockImplementation((selector) => {
    if (selector === '.national-edition') return mission;
    if (selector === '.national-world') return scene;
    return pins.get(selector.match(/data-id="([^"]+)"/)?.[1] ?? '') ?? null;
  });
  const observers: {
    callback: () => void;
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const fetch = vi.fn(async (url: URL) => ({
    ok: failure !== 'http',
    arrayBuffer: async () =>
      new Uint8Array(
        failure === 'hash' ||
          (failure === 'terrain-hash' && url.pathname.endsWith('.png'))
          ? [1, 2]
          : url.pathname.endsWith('country-detail/index.json')
            ? detailIndexBytes
            : url.pathname.endsWith('.png')
              ? terrainBytes
              : partitionBytes,
      ).buffer,
  }));
  const authority = vi.fn(() => {
    throw Error('No authority permitted');
  });
  let locale = initialLocale;
  const languageListeners = new Map<
    string,
    Set<(event: { key?: string | null }) => void>
  >();
  const localeWindow = {
    localStorage: {
      getItem: (key: string) => {
        if (key !== 'econmind-ui-language') return authority();
        return locale ?? null;
      },
      setItem: authority,
      removeItem: authority,
      clear: authority,
    },
    addEventListener: (
      name: string,
      callback: (event: { key?: string | null }) => void,
    ) => {
      if (!languageListeners.has(name)) languageListeners.set(name, new Set());
      languageListeners.get(name)!.add(callback);
    },
    removeEventListener: (
      name: string,
      callback: (event: { key?: string | null }) => void,
    ) => languageListeners.get(name)?.delete(callback),
    location: { assign: vi.fn() },
  };
  const api = runInNewContext(
    source
      .replaceAll('export ', '')
      .replace(
        'import.meta.url',
        JSON.stringify(
          'https://fixture.invalid/prefix/country-home-surroundings.js',
        ),
      ) +
      '\n({regionalViewBox,regionalSvg,mountCountrySurroundings,mountLegacyCountryAtlas,projectPoint,unambiguousPinIds,homeCamera,geographicPinGroups})',
    {
      URL,
      TextDecoder,
      Blob,
      Uint8Array,
      crypto: webcrypto,
      fetch,
      ...(initialLocale ? { window: localeWindow } : {}),
      document: {
        createElement: (name: string) => new Node(name),
        createElementNS: (_ns: string, name: string) => new Node(name),
      },
      ResizeObserver: class {
        constructor(callback: () => void) {
          observers.push({ callback, observe: vi.fn(), disconnect: vi.fn() });
          return observers.at(-1)!;
        }
      },
      MutationObserver: class {
        constructor(callback: () => void) {
          observers.push({ callback, observe: vi.fn(), disconnect: vi.fn() });
          return observers.at(-1)!;
        }
      },
      XMLSerializer: class {
        serializeToString(node: Node): string {
          const attributes = Object.entries(node.attributes)
            .map(([key, value]) => ` ${key}="${value}"`)
            .join('');
          return `<${node.tag}${attributes}>${node.children
            .map((child) => this.serializeToString(child))
            .join('')}</${node.tag}>`;
        }
      },
      localStorage: { setItem: authority },
      submit: authority,
    },
  ) as {
    homeCamera: (
      box: number[],
      scale: number,
      dx: number,
      dy: number,
      w: number,
      h: number,
    ) => number[];
    geographicPinGroups: (
      points: { id: string; x: number; y: number }[],
      diameter?: number,
    ) => { id: string; x: number; y: number; ids: string[] }[];
    unambiguousPinIds: (
      points: { id: string; x: number; y: number }[],
      diameter?: number,
    ) => string[];
    projectPoint: (
      point: number[],
      box: number[],
      width: number,
      height: number,
    ) => number[] | null;
    regionalViewBox: (
      frame: number[],
      width: number,
      height: number,
      worldWidth: number,
      worldHeight: number,
    ) => number[] | null;
    regionalSvg: (
      data: typeof partition,
      record: ReturnType<typeof country>,
    ) => Node | null;
    mountCountrySurroundings: (
      root: Node,
      record: ReturnType<typeof country>,
    ) => Promise<void>;
    mountLegacyCountryAtlas: (
      root: Node,
      record: ReturnType<typeof country>,
      publicationBase?: URL,
    ) => Promise<void>;
  };
  return {
    api,
    root,
    mission,
    scene,
    observers,
    fetch,
    authority,
    pins,
    languageListeners,
    changeLocale: (next: 'zh' | 'en', event = 'econmind-language-change') => {
      locale = next;
      for (const listener of languageListeners.get(event) ?? [])
        listener({ key: 'econmind-ui-language' });
    },
  };
}

describe('canonical HOME camera and dense hit groups', () => {
  it('keeps bounded blank-edge camera motion without changing geography or viewport aspect, for 320/390/1440', () => {
    const { api } = fixture();
    for (const width of [320, 390, 1440]) {
      const initial = api.regionalViewBox(
        country('58').frame,
        width,
        590,
        1774,
        887,
      )!;
      for (const scale of [0.75, 1, 1.333333, 100])
        for (const d of [-10000, 0, 10000]) {
          const box = api.homeCamera(initial, scale, d, d, 1774, 887);
          expect(box[0]).toBeGreaterThanOrEqual(-box[2]);
          expect(box[1]).toBeGreaterThanOrEqual(-box[3]);
          expect(box[0]).toBeLessThanOrEqual(1774);
          expect(box[1]).toBeLessThanOrEqual(887);
          expect(box[2] / box[3]).toBeCloseTo(initial[2] / initial[3]);
        }
    }
  });
  it('aggregates coincident and transitively dense IDs at an original point without mutating or losing any record', () => {
    const { api } = fixture();
    const points = [
      { id: 'A', x: 10, y: 20 },
      { id: 'B', x: 10, y: 20 },
      { id: 'C', x: 35, y: 20 },
      { id: 'D', x: 100, y: 100 },
    ];
    const before = structuredClone(points);
    const groups = api.geographicPinGroups(points, 30);
    expect(groups.map((g) => [g.id, g.x, g.y, g.ids])).toEqual([
      ['A', 10, 20, ['A', 'B', 'C']],
      ['D', 100, 100, ['D']],
    ]);
    expect(points).toEqual(before);
    expect(groups.flatMap((g) => g.ids).sort()).toEqual(
      points.map((p) => p.id).sort(),
    );
  });
});

describe('country HOME source-coordinate surroundings, not ownership', () => {
  it.each([262, 332, 974])(
    'keeps resource 58 direct hit targets unambiguous at stage width %s through zoom and translation',
    (width) => {
      const f = fixture();
      const record = country('58');
      const original = structuredClone(record.resources);
      for (const zoom of [1, 1.25, 2]) {
        const points = record.resources.map(
          (r: { id: string; point: number[] }) => ({
            id: r.id,
            x:
              ((r.point[0] - record.viewBox[0]) / record.viewBox[2]) *
                width *
                zoom -
              156,
            y:
              ((r.point[1] - record.viewBox[1]) / record.viewBox[3]) *
                width *
                zoom -
              295.5,
          }),
        );
        expect(f.api.unambiguousPinIds(points)).toEqual(
          record.resources.map((r: { id: string }) => r.id),
        );
      }
      expect(record.resources).toEqual(original);
    },
  );
  it('routes dense/coincident geography through ID choices instead of assigning one overlapping hit to another resource', () => {
    const f = fixture();
    const record = country('66');
    const points = record.resources.map(
      (r: { id: string; point: number[] }) => ({
        id: r.id,
        x: ((r.point[0] - record.viewBox[0]) / record.viewBox[2]) * 262,
        y: ((r.point[1] - record.viewBox[1]) / record.viewBox[3]) * 262,
      }),
    );
    const safe = f.api.unambiguousPinIds(points);
    expect(safe).not.toContain('RES14');
    expect(safe).not.toContain('RES47');
    expect(safe).not.toContain('RES41');
    expect(safe).not.toContain('RES79');
    expect(
      f.api.unambiguousPinIds([
        { id: 'one', x: 0, y: 0 },
        { id: 'two', x: 0, y: 0 },
      ]),
    ).toEqual([]);
    expect(
      f.api.unambiguousPinIds(
        points.map((p) => ({ ...p, x: p.x * 2, y: p.y * 2 })),
      ),
    ).toContain('RES14');
    expect(f.authority).not.toHaveBeenCalled();
  });

  it('makes dense resource points noninteractive and exposes exact native resource IDs without moving source anchors', async () => {
    const f = fixture();
    const record = country('66');
    const before = structuredClone(record);
    const image = new Node('img');
    image.attributes.src = record.detail;
    const stage = new Node();
    const viewport = new Node();
    const caption = new Node();
    const pins = new Node();
    const a = new Node('button');
    const b = new Node('button');
    a.dataset = { action: 'resource', id: 'RES14' };
    b.dataset = { action: 'resource', id: 'RES47' };
    a.properties = { left: '10%', top: '20%' };
    b.properties = { left: '12%', top: '22%' };
    a.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 28,
      height: 28,
      right: 28,
      bottom: 28,
    });
    b.getBoundingClientRect = () => ({
      left: 10,
      top: 10,
      width: 28,
      height: 28,
      right: 38,
      bottom: 38,
    });
    pins.querySelectorAll.mockReturnValue([a, b]);
    const label = new Node('em');
    label.getBoundingClientRect = () => ({
      left: 8,
      top: 28,
      width: 28,
      height: 16,
      right: 36,
      bottom: 44,
    });
    a.querySelector.mockReturnValue(label);

    f.root.querySelector.mockImplementation((selector) =>
      selector === '#country-image'
        ? image
        : selector === '#map-stage'
          ? stage
          : selector === '#map-pins'
            ? pins
            : selector === '.map-caption'
              ? caption
              : viewport,
    );
    await f.api.mountLegacyCountryAtlas(f.root, record);
    expect(a.dataset).toMatchObject({
      action: 'resource',
      id: 'RES14',
      resourceCollision: 'true',
    });
    expect(b.dataset).toMatchObject({
      action: 'resource',
      id: 'RES47',
      resourceCollision: 'true',
    });
    expect(a.attributes['aria-hidden']).toBe('true');
    expect(a.dataset.resourceLabelHidden).toBe('true');
    expect(a.properties).toEqual({ left: '10%', top: '20%' });
    expect(b.properties).toEqual({ left: '12%', top: '22%' });
    const choices = caption.children[0].children[1].children;
    expect(choices.map((button) => button.dataset.id)).toEqual(
      record.resources.map((r: { id: string }) => r.id),
    );
    expect(
      choices.every((button) => button.dataset.action === 'resource'),
    ).toBe(true);
    expect(record).toEqual(before);
    expect(f.authority).not.toHaveBeenCalled();
  });
  it('clips only legacy geographic artwork to its canonical country while keeping scene anchors and controls unchanged', async () => {
    const f = fixture();
    const record = country('58');
    const before = JSON.stringify(record);
    const image = new Node('img');
    image.attributes.src = `https://fixture.invalid/${record.detail}`;
    const viewport = new Node();
    f.root.querySelector.mockImplementation((selector) =>
      selector === '#country-image' ? image : viewport,
    );
    await f.api.mountLegacyCountryAtlas(f.root, record);
    const canonical = partition.territories.find(
      (territory: { id: string }) => territory.id === record.id,
    );
    const mask = decodeURIComponent(image.style.maskImage);
    expect(mask).toContain(`viewBox="${record.viewBox.join(' ')}"`);
    expect(mask).toContain(`d="${canonical.path}"`);
    expect(image.style.maskComposite).toBe('add');
    expect(image.attributes.src).toBe(
      `https://fixture.invalid/${record.detail}#svgView(preserveAspectRatio(none))`,
    );
    image.attributes.src = `https://fixture.invalid/${record.scene}`;
    f.observers
      .find((o) =>
        o.observe.mock.calls.some(([, options]) =>
          options?.attributeFilter?.includes('src'),
        ),
      )!
      .callback();
    expect(image.style.maskComposite).toBe('add');
    expect(image.style.maskImage).toBe('none');
    expect(f.root.children[0].style.display).toBe('none');
    expect(f.root.dataset.mapPresentation).toBe('independent-illustration');
    expect(JSON.stringify(record)).toBe(before);
    expect(f.authority).not.toHaveBeenCalled();
    f.root.isConnected = false;
    f.observers[0].callback();
    expect(
      f.observers.every((observer) => observer.disconnect.mock.calls.length),
    ).toBe(true);
  });
  it('resolves the bundled legacy Atlas geography from the explicit deployed public base', async () => {
    const f = fixture();
    const stage = new Node();
    const pins = new Node();
    const image = new Node('img');
    image.attributes.src = country('58').scene;
    f.root.querySelector.mockImplementation((selector) =>
      selector === '#country-image' ? image : stage,
    );
    stage.querySelector.mockReturnValue(pins);
    await f.api.mountLegacyCountryAtlas(
      f.root,
      country('58'),
      new URL('https://fixture.invalid/deployed-prefix/'),
    );
    expect(f.root.dataset.regionalAtlas).toBe('true');
    for (const [url] of f.fetch.mock.calls)
      expect(String(url)).toContain('/deployed-prefix/official-map-source/');
  });
  it('adds legacy geographic context without changing native scene/detail pins, zoom or scroll geometry', async () => {
    const f = fixture();
    const record = country('58');
    const before = JSON.stringify(record);
    const stage = new Node();
    stage.properties.height = '150%';
    const viewport = new Node();
    viewport.clientWidth = 960;
    viewport.clientHeight = 560;
    const facility = new Node();
    facility.dataset.id = record.facilities[0].id;
    facility.properties.left = '21.7%';
    const resource = new Node();
    resource.dataset.id = record.resources[0].id;
    resource.properties.left = '38.4673%';
    const image = new Node('img');
    image.attributes.src = record.scene;
    f.root.querySelector.mockImplementation((selector) =>
      selector === '.map-viewport'
        ? viewport
        : selector === '#country-image'
          ? image
          : stage,
    );
    let stageRect = { left: 200, top: 0, width: 560, height: 560 };
    stage.getBoundingClientRect = () => stageRect;
    stage.children = [image, facility, resource];
    const native = structuredClone(stage.properties);
    await f.api.mountLegacyCountryAtlas(f.root, record);
    expect(f.root.dataset.regionalAtlas).toBe('true');
    expect(f.root.children).toHaveLength(1);
    expect(f.root.children[0].children[1].children).toHaveLength(70);
    expect(f.root.children[0].attributes.preserveAspectRatio).toBe('none');
    expect(stage.children).toEqual([image, facility, resource]);
    expect(stage.properties).toEqual(native);
    expect(image.attributes.src).toBe(record.scene);
    expect(facility.properties.left).toBe('21.7%');
    expect(resource.properties.left).toBe('38.4673%');
    expect(facility.dataset.regionalLocation).toBeUndefined();
    expect(resource.dataset.regionalLocation).toBeUndefined();
    const geographicCorner = [record.frame[0], record.frame[1]];
    const camera = () =>
      f.root.children[0].attributes.viewBox.split(' ').map(Number);
    expect(f.api.projectPoint(geographicCorner, camera(), 960, 560)).toEqual([
      200, 0,
    ]);
    stageRect = { left: -40, top: -70, width: 840, height: 840 };
    f.observers[0].callback();
    const afterZoom = f.api.projectPoint(geographicCorner, camera(), 960, 560)!;
    expect(afterZoom[0]).toBeCloseTo(-40);
    expect(afterZoom[1]).toBeCloseTo(-70);
    expect(viewport.addEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      { passive: true },
    );
    viewport.clientWidth = 332;
    viewport.clientHeight = 332;
    stageRect = { left: 0, top: 0, width: 332, height: 332 };
    f.observers[0].callback();
    const resizedBox = f.root.children[0].attributes.viewBox
      .split(' ')
      .map(Number);
    expect(resizedBox[2] / resizedBox[3]).toBeCloseTo(1);
    expect(stage.properties).toEqual(native);
    expect(
      stage.querySelectorAll.mock.calls.every(
        ([selector]) => selector === 'button[data-action=resource]',
      ),
    ).toBe(true);
    expect(JSON.stringify(record)).toBe(before);
    expect(f.authority).not.toHaveBeenCalled();
  });

  it.each(['hash', 'terrain-hash'] as const)(
    'retains legacy Atlas illustration and controls when %s verification fails',
    async (failure) => {
      const f = fixture(failure);
      const stage = new Node();
      f.root.querySelector.mockReturnValue(stage);
      await f.api.mountLegacyCountryAtlas(f.root, country('58'));
      expect(f.root.dataset.regionalAtlas).toBeUndefined();
      expect(stage.children).toHaveLength(0);
      expect(f.authority).not.toHaveBeenCalled();
    },
  );
  it.each([
    'captain',
    'finance',
    'central_bank',
    'industry',
    'trade',
    'social',
  ])(
    'mounts the same country background for %s without changing its Office view',
    async (role) => {
      const f = fixture();
      f.root.dataset.office = role;
      await f.api.mountCountrySurroundings(f.root, country('54'));
      expect(f.root.dataset.office).toBe(role);
      expect(
        f.scene.children[0].children[0].attributes['data-selected-country'],
      ).toBe('visual-territory-54');
      expect(f.authority).not.toHaveBeenCalled();
      const game = readFileSync(
        base + 'public/season1-immersive/country-game.js',
        'utf8',
      );
      expect(game).toContain('module?.mountCountrySurroundings(root,c())');
    },
  );

  it('uses exactly the approved terrain and partition pins under deployment prefixes', () => {
    const index = JSON.parse(
      readFileSync(base + 'public/official-map-source/index.json', 'utf8'),
    );
    for (const path of [
      'src/assets/asterra-satellite-terrain-v8.png',
      'src/map-lab/land-partition.json',
    ]) {
      const entry = index.files.find(
        (row: { sourcePath: string }) => row.sourcePath === base + path,
      );
      expect(source).toContain(entry.sha256);
    }
    const { api } = fixture();
    const svg = api.regionalSvg(partition, country('54'))!;
    expect(svg.children[0].attributes.href).toContain(
      'https://fixture.invalid/prefix/official-map-source/' +
        index.manifestSha256 +
        '/files/apps/world-web/src/assets/asterra-satellite-terrain-v8.png',
    );
    expect(svg.attributes['data-projection']).toBe('V8_IMAGE_PIXELS_TOP_LEFT');
  });

  it('preserves all 70 original paths with exactly one country highlight, no foreign controls or maritime rights', () => {
    const { api, authority } = fixture();
    for (let i = 1; i <= 70; i++) {
      const record = country(String(i).padStart(2, '0'));
      const svg = api.regionalSvg(partition, record)!;
      expect(svg.children[1].children.map((node) => node.attributes.d)).toEqual(
        partition.territories.map((row: { path: string }) => row.path),
      );
      expect(
        svg.children.filter(
          (node) => node.attributes['data-highlight-country'],
        ),
      ).toHaveLength(1);
      expect(svg.children[2].attributes['data-highlight-country']).toBe(
        record.id,
      );
      expect(svg.children[2].attributes.d).toBe(
        partition.territories.find(
          (row: { id: string }) => row.id === record.id,
        ).path,
      );
      expect(svg.children.filter((node) => node.tag === 'image')).toHaveLength(
        1,
      );
      expect(svg.attributes['aria-hidden']).toBe('true');
    }
    expect(readsOnlyDisplayLanguagePreference(source)).toBe(true);
    expect(source).not.toMatch(/Command|eez|territorialCandidate|cloneNode/);
    // Context may observe native scrolling; it cannot add input/authority
    // handlers or foreign-country hit targets.
    expect(
      [
        ...source
          .slice(
            source.indexOf('export async function mountLegacyCountryAtlas'),
          )
          .matchAll(/addEventListener\('([^']+)'/g),
      ].map((m) => m[1]),
    ).toEqual(['scroll']);
    expect(authority).not.toHaveBeenCalled();
  });

  it.each(['01', '13', '38', '54', '58', '70'])(
    'centers %s original geography at the world edge and preserves portrait/landscape aspect',
    (number) => {
      const { api } = fixture();
      const record = country(number);
      for (const [width, height] of [
        [1920, 1080],
        [1280, 930],
        [390, 2400],
        [3840, 1080],
      ]) {
        const box = api.regionalViewBox(
          record.frame,
          width,
          height,
          partition.width,
          partition.height,
        )!;
        expect(box[0] + box[2] / 2).toBeCloseTo(
          record.frame[0] + record.frame[2] / 2,
          10,
        );
        expect(box[1] + box[3] / 2).toBeCloseTo(
          record.frame[1] + record.frame[3] / 2,
          10,
        );
        expect(box[2]).toBeGreaterThanOrEqual(record.frame[2]);
        expect(box[3]).toBeGreaterThanOrEqual(record.frame[3]);
        expect(box[2] / box[3]).toBeCloseTo(width / height, 10);
      }
    },
  );

  it('rejects missing/invalid geometry instead of inventing a country', () => {
    const { api } = fixture();
    expect(
      api.regionalSvg(partition, { ...country('54'), id: 'missing' }),
    ).toBeNull();
    for (const frame of [[], [0, 0, 0, 1], [0, 0, NaN, 1]])
      expect(api.regionalViewBox(frame, 390, 844, 1774, 887)).toBeNull();
    expect(
      api.regionalViewBox(country('54').frame, 0, 844, 1774, 887),
    ).toBeNull();
  });

  it('defaults HOME to the original illustration, retains explicit geography, caches immutable sources and disposes the prior observer', async () => {
    const f = fixture();
    const record = country('54');
    const before = structuredClone(record);
    await f.api.mountCountrySurroundings(f.root, record);
    expect(f.root.dataset.mapPresentation).toBe('independent-illustration');
    expect(f.scene.children).toHaveLength(6);
    const viewport = f.scene.children[0];
    const svg = viewport.children[0];
    expect(svg.attributes['data-projection']).toBe('V8_IMAGE_PIXELS_TOP_LEFT');
    const mode = f.scene.children[3];
    expect(mode.textContent).toBe('返回连续地理图');
    expect(mode.attributes['aria-pressed']).toBe('true');
    expect(viewport.hidden).toBe(true);
    const toggle = mode.addEventListener.mock.calls.find(
      ([event]) => event === 'click',
    )![1] as () => void;
    toggle();
    expect(f.root.dataset.mapPresentation).toBe('geographic');
    expect(viewport.hidden).toBe(false);
    expect(mode.attributes['aria-pressed']).toBe('false');
    toggle();
    expect(f.root.dataset.mapPresentation).toBe('independent-illustration');
    expect(viewport.hidden).toBe(true);
    expect(svg.attributes.viewBox).toBe(
      f.api.regionalViewBox(record.viewBox, 1920, 1080, 1774, 887)!.join(' '),
    );
    expect(svg.children.at(-1)?.attributes['clip-path']).toContain(
      'home-detail-',
    );
    expect(f.scene.properties['--national-scene-art']).toBe(
      `url("https://fixture.invalid/prefix/season1-immersive/countries/${record.scene}")`,
    );
    const detail = svg.children.at(-1)!;
    const neighborLayer = svg.children.find(
      (n) => n.attributes['data-geographic-detail-context'] === 'true',
    )!;
    expect(neighborLayer.children.length).toBeGreaterThan(0);
    expect(svg.children.indexOf(neighborLayer)).toBeLessThan(
      svg.children.findIndex(
        (n) => n.attributes['data-distance-fade'] === 'country-outline',
      ),
    );
    const originals = JSON.parse(detailIndexBytes.toString());
    for (const tile of neighborLayer.children) {
      const original = originals.find(
        (m: { number: string }) =>
          m.number === tile.attributes['data-neighbor-detail'],
      );
      expect(
        ['x', 'y', 'width', 'height'].map((k) => Number(tile.attributes[k])),
      ).toEqual(original.viewBox);
      expect(tile.attributes['pointer-events']).toBe('none');
      expect(tile.attributes.href).toContain(
        '#svgView(preserveAspectRatio(none))',
      );
      const clipId = tile.attributes['clip-path'].slice(5, -1);
      const clip = svg.children
        .flatMap((n) => n.children)
        .find((n) => n.attributes.id === clipId)!;
      expect(clip.children[0]!.attributes.d).toBe(
        partition.territories.find((t: { id: string }) => t.id === original.id)
          .path,
      );
    }
    expect(
      ['x', 'y', 'width', 'height'].map((key) =>
        Number(detail.attributes[key]),
      ),
    ).toEqual(record.viewBox);
    expect(record.viewBox).not.toEqual(record.frame);
    f.root.clientWidth = 390;
    f.root.clientHeight = 2400;
    viewport.clientWidth = 390;
    viewport.clientHeight = 440;
    f.observers[0].callback();
    expect(svg.attributes.viewBox).toBe(
      f.api.regionalViewBox(record.viewBox, 390, 440, 1774, 887)!.join(' '),
    );
    expect(record).toEqual(before);
    expect(record).toEqual(before);
    await f.api.mountCountrySurroundings(f.root, record);
    expect(f.scene.children).toHaveLength(6);
    const nextRoot = new Node();
    nextRoot.querySelector = f.root.querySelector;
    await f.api.mountCountrySurroundings(nextRoot, record);
    expect(f.observers[0].disconnect).toHaveBeenCalledOnce();
    expect(f.fetch).toHaveBeenCalledTimes(3);
    expect(f.authority).not.toHaveBeenCalled();
    expect(f.mission.children[0].textContent).toBe(
      '连续地理细图 · 原始坐标 · 推演细节，非测绘',
    );
  });

  it.each(['38', '58', '70'])(
    'registers HOME %s detail in the original Atlas SVG viewBox, without stretching it into the scene frame',
    async (number) => {
      const f = fixture();
      const record = country(number);
      const before = structuredClone(record);
      const nativeSvg = readFileSync(
        base + 'src/assets/country-detail/' + record.detail.split('/').at(-1),
        'utf8',
      );
      const nativeBox = nativeSvg
        .match(/<svg[^>]*viewBox="([^"]+)"/)![1]!
        .split(/\s+/)
        .map(Number);
      await f.api.mountCountrySurroundings(f.root, record);
      const detail = f.scene.children[0]!.children[0]!.children.at(-1)!;
      expect(
        ['x', 'y', 'width', 'height'].map((key) =>
          Number(detail.attributes[key]),
        ),
      ).toEqual(nativeBox);
      expect(record.viewBox).toEqual(nativeBox);
      expect(record.frame).not.toEqual(nativeBox);
      expect(record).toEqual(before);
      expect(f.scene.properties['--national-scene-art']).toBe(
        `url("https://fixture.invalid/prefix/season1-immersive/countries/${record.scene}")`,
      );
    },
  );

  it('immediately redraws HOME marker avoidance every time the information panel closes', async () => {
    const f = fixture();
    await f.api.mountCountrySurroundings(f.root, country('54'));
    const viewport = f.scene.children[0]!;
    const markers = viewport.children[1]!;
    const redraw = vi.spyOn(markers, 'replaceChildren');
    const choice = f.scene.children[4]!.children[1]!.children[0]!;
    const open = choice.addEventListener.mock.calls.find(
      ([name]) => name === 'click',
    )![1];
    const inspector = f.scene.children[5]!;
    for (let i = 0; i < 3; i++) {
      open();
      expect(inspector.hidden).toBe(false);
      const close = inspector.children[2]!.addEventListener.mock.calls.find(
        ([name]) => name === 'click',
      )![1];
      close();
      expect(inspector.hidden).toBe(true);
      expect(redraw).toHaveBeenCalledTimes((i + 1) * 2);
    }
    expect(f.authority).not.toHaveBeenCalled();
  });

  it('permits only the exact existing display-language read, never economic storage or preference writes', () => {
    expect(readsOnlyDisplayLanguagePreference(source)).toBe(true);
    for (const forbidden of [
      "window.localStorage.getItem('economic-world-state')",
      "window.localStorage.setItem('economic-world-state', '{}')",
      "window.localStorage.setItem('econmind-ui-language', 'en')",
      "window.localStorage.removeItem('econmind-ui-language')",
      'window.localStorage.clear()',
      "window['localStorage'].getItem('econmind-ui-language')",
      'const { localStorage } = window',
      "const store = window.localStorage; store.setItem('balance', '1')",
    ]) {
      expect(
        readsOnlyDisplayLanguagePreference(`${source}\n${forbidden}`),
      ).toBe(false);
    }
    expect(
      readsOnlyDisplayLanguagePreference(
        source.replace(
          displayLanguageRead,
          "window.localStorage.getItem('economic-world-state')",
        ),
      ),
    ).toBe(false);
    expect(
      readsOnlyDisplayLanguagePreference(`${source}\n${displayLanguageRead}`),
    ).toBe(false);
  });

  it.each(['http', 'hash', 'terrain-hash'] as const)(
    'fails closed on %s source failure without hiding the existing scene',
    async (failure) => {
      for (const locale of ['zh', 'en'] as const) {
        const f = fixture(failure, locale);
        await f.api.mountCountrySurroundings(f.root, country('54'));
        expect(f.scene.children).toHaveLength(0);
        expect(f.scene.properties).toEqual({});
        expect(f.mission.children[0].textContent).toBe(
          locale === 'zh'
            ? '连续地理图暂不可用 · 保留原始插画'
            : 'Continuous geography unavailable · Original illustration retained',
        );
        expect(f.observers).toHaveLength(0);
        expect(f.authority).not.toHaveBeenCalled();
      }
    },
  );

  it('darkens by the actual selected outline, with a smooth world-coordinate blur and no rectangular scene frame', () => {
    const { api } = fixture();
    for (const number of ['13', '58', '70']) {
      const record = country(number);
      const svg = api.regionalSvg(partition, record)!;
      const defs = svg.children[3];
      const mask = defs.children[1];
      expect(mask.children[1].attributes.d).toBe(svg.children[2].attributes.d);
      expect(mask.children[2].attributes.d).toBe(svg.children[2].attributes.d);
      const filter = defs.children[0];
      const distance = Math.max(...record.frame.slice(2)) * 0.14;
      expect(filter.children[0].attributes).toMatchObject({
        operator: 'dilate',
        radius: String(distance * 2),
      });
      expect(filter.children[1].attributes.stdDeviation).toBe(String(distance));
      expect(filter.children[2].children[0].attributes.tableValues).toBe(
        '0 0.333333 0.666667 1 1',
      );
      expect(svg.children[4].attributes['data-distance-fade']).toBe(
        'country-outline',
      );
      expect(svg.children[4].attributes.width).toBe(String(partition.width));
      expect(svg.children[4].attributes.height).toBe(String(partition.height));
    }
    const css = readFileSync(base + 'public/country-home-layout.css', 'utf8');
    expect(css).not.toContain('.national-world::after');
  });

  it('projects real source points with the identical map scale, rejecting missing anchors instead of inventing coordinates', () => {
    const { api } = fixture();
    expect(
      api.projectPoint([150, 250], [100, 200, 100, 100], 400, 400),
    ).toEqual([200, 200]);
    expect(
      api.projectPoint([150, 250], [100, 200, 100, 100], 800, 800),
    ).toEqual([400, 400]);
    expect(api.projectPoint([], [100, 200, 100, 100], 400, 400)).toBeNull();
    expect(
      api.projectPoint([NaN, 250], [100, 200, 100, 100], 400, 400),
    ).toBeNull();
  });

  it('leaves native illustration anchors and buttons untouched instead of projecting geographic points onto a scene', async () => {
    const f = fixture();
    const record = country('54');
    const first = record.facilities[0];
    const second = record.facilities[1];
    second.countryId = 'visual-territory-55';
    const before = structuredClone(record);
    const pin = f.pins.get(first.id)!;
    pin.style.setProperty('left', '48%');
    pin.style.setProperty('top', '18.9%');
    await f.api.mountCountrySurroundings(f.root, record);
    expect(pin.properties).toEqual({ left: '48%', top: '18.9%' });
    expect(pin.dataset.regionalLocation).toBeUndefined();
    expect(f.pins.get(second.id)?.dataset.regionalLocation).toBeUndefined();
    expect(f.root.dataset.regionalMap).toBeUndefined();
    expect(f.scene.children).toHaveLength(6);
    expect(f.root.dataset.mapPresentation).toBe('independent-illustration');
    expect(record).toEqual(before);
    expect(f.authority).not.toHaveBeenCalled();
  });

  it('does not attach a stale asynchronous response to a discarded HOME', async () => {
    const f = fixture();
    f.root.isConnected = false;
    await f.api.mountCountrySurroundings(f.root, country('54'));
    expect(f.scene.children).toHaveLength(0);
    expect(f.observers).toHaveLength(0);
  });
});

describe('explicit HOME geographic navigation locale', () => {
  it('keeps the unavailable-source notice localized without inventing a map', async () => {
    const f = fixture('http', 'zh');
    await f.api.mountCountrySurroundings(f.root, country('54'));
    expect(f.scene.children).toHaveLength(0);
    expect(f.mission.children[0]!.textContent).toBe(
      '连续地理图暂不可用 · 保留原始插画',
    );
    f.changeLocale('en');
    expect(f.mission.children[0]!.textContent).toBe(
      'Continuous geography unavailable · Original illustration retained',
    );
    f.changeLocale('zh');
    expect(f.mission.children[0]!.textContent).toBe(
      '连续地理图暂不可用 · 保留原始插画',
    );
    expect(f.authority).not.toHaveBeenCalled();
  });
  it.each(['econmind-language-change', 'storage'])(
    'updates complete ZH→EN→ZH navigation on %s without changing the scene or geography',
    async (event) => {
      const f = fixture(undefined, 'zh');
      const record = country('54');
      const originalRecord = structuredClone(record);
      await f.api.mountCountrySurroundings(f.root, record);
      const viewport = f.scene.children[0]!;
      const toolbar = f.scene.children[1]!;
      const select = toolbar.children[0]!;
      const world = toolbar.children[1]!;
      const controls = f.scene.children[2]!;
      const mode = f.scene.children[3]!;
      const originalBox = viewport.children[0]!.attributes.viewBox;
      const originalArt = f.scene.properties['--national-scene-art'];
      const originalHref = (world as Node & { href: string }).href;
      expect(select.attributes['aria-label']).toBe('切换地图国家');
      expect(world.textContent).toBe('返回世界 ↗');
      expect(mode.textContent).toBe('返回连续地理图');
      f.changeLocale('en', event);
      expect(select.attributes['aria-label']).toBe('Switch map country');
      expect(select.children[0]!.textContent).toBe('Country 01');
      expect(select.children[53]!.textContent).toBe(`54 · ${record.name}`);
      expect(world.textContent).toBe('Return to world ↗');
      expect(mode.textContent).toBe('Return to continuous geography');
      expect(controls.children[0]!.attributes['aria-label']).toBe(
        'Zoom in on country map',
      );
      expect(f.mission.children[0]!.textContent).toBe(
        'Continuous geographic detail maps · Original coordinates · Illustrative, not surveyed',
      );
      const toggle = mode.addEventListener.mock.calls.find(
        ([name]) => name === 'click',
      )![1] as () => void;
      toggle();
      expect(mode.textContent).toBe('View original scene illustration');
      expect(viewport.hidden).toBe(false);
      f.changeLocale('zh', event);
      expect(select.attributes['aria-label']).toBe('切换地图国家');
      expect(world.textContent).toBe('返回世界 ↗');
      expect(mode.textContent).toBe('查看原场景插图');
      expect(viewport.hidden).toBe(false);
      expect(viewport.children[0]!.attributes.viewBox).toBe(originalBox);
      expect(f.scene.properties['--national-scene-art']).toBe(originalArt);
      expect((world as Node & { href: string }).href).toBe(originalHref);
      for (const node of [f.scene, viewport, toolbar, controls, mode])
        expect(node.attributes['data-no-translate']).toBe('');
      expect(record).toEqual(originalRecord);
      expect(f.fetch).toHaveBeenCalledTimes(3);
      expect(f.authority).not.toHaveBeenCalled();
      f.root.isConnected = false;
      f.changeLocale('en', event);
      expect(f.languageListeners.get('econmind-language-change')?.size).toBe(0);
      expect(f.languageListeners.get('storage')?.size).toBe(0);
    },
  );
});

// The adapter attributes must disable native colliding pointer targets too.
describe('legacy resource collision presentation contract', () => {
  it('prevents the ignored native hit and exposes a usable source-ID chooser', () => {
    const css = readFileSync(base + 'src/brand-shell/brand-shell.css', 'utf8');
    expect(css).toMatch(
      /\[data-resource-collision='true'\][^{]*\{[^}]*pointer-events: none/s,
    );
    expect(css).toMatch(
      /\[data-resource-label-hidden='true'\] > em[^}]*visibility: hidden/s,
    );
    expect(css).toContain('.map-resource-choices');
    expect(css).toMatch(/map-resource-choices button[^}]*min-height: 36px/s);
  });
});
