import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const base = 'apps/world-web/';
const source = readFileSync(
  base + 'public/country-home-surroundings.js',
  'utf8',
);
const partitionBytes = readFileSync(base + 'src/map-lab/land-partition.json');
const partition = JSON.parse(partitionBytes.toString());
const terrainBytes = readFileSync(
  base + 'src/assets/asterra-satellite-terrain-v8.png',
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
  clientWidth = 1920;
  clientHeight = 1080;
  isConnected = true;
  style = {
    setProperty: (key: string, value: string) => {
      this.properties[key] = value;
    },
  };
  constructor(readonly tag = 'div') {}
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
  prepend = (child: Node) => {
    this.children.unshift(child);
  };
  querySelector = vi.fn<(selector: string) => Node | null>(() => null);
  querySelectorAll = vi.fn<(selector: string) => Node[]>(() => []);
}

function fixture(failure?: 'http' | 'hash' | 'terrain-hash') {
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
          : url.pathname.endsWith('.png')
            ? terrainBytes
            : partitionBytes,
      ).buffer,
  }));
  const authority = vi.fn(() => {
    throw Error('No authority permitted');
  });
  const api = runInNewContext(
    source
      .replaceAll('export ', '')
      .replace(
        'import.meta.url',
        JSON.stringify(
          'https://fixture.invalid/prefix/country-home-surroundings.js',
        ),
      ) +
      '\n({regionalViewBox,regionalSvg,mountCountrySurroundings,mountLegacyCountryAtlas,projectPoint})',
    {
      URL,
      TextDecoder,
      Blob,
      Uint8Array,
      crypto: webcrypto,
      fetch,
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
      localStorage: { setItem: authority },
      submit: authority,
    },
  ) as {
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
  return { api, root, mission, scene, observers, fetch, authority, pins };
}

describe('country HOME source-coordinate surroundings, not ownership', () => {
  it('resolves the bundled legacy Atlas geography from the explicit deployed public base', async () => {
    const f = fixture();
    const stage = new Node();
    const pins = new Node();
    f.root.querySelector.mockReturnValue(stage);
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
  it('adapts the legacy Atlas stage and reprojects recreated native facility and resource pins without rewriting their data or zoom', async () => {
    const f = fixture();
    const record = country('58');
    const before = JSON.stringify(record);
    const stage = new Node();
    stage.properties.height = '150%';
    const pins = new Node();
    const caption = new Node();
    const viewport = new Node();
    viewport.clientWidth = 960;
    viewport.clientHeight = 560;
    const facility = new Node();
    facility.dataset.id = record.facilities[0].id;
    const resource = new Node();
    resource.dataset.id = record.resources[0].id;
    f.root.querySelector.mockImplementation((selector) =>
      selector === '#map-stage'
        ? stage
        : selector === '.map-viewport'
          ? viewport
          : caption,
    );
    stage.querySelector.mockReturnValue(pins);
    stage.querySelectorAll.mockReturnValue([facility, resource]);
    await f.api.mountLegacyCountryAtlas(f.root, record);
    expect(f.root.dataset.regionalAtlas).toBe('true');
    expect(stage.children).toHaveLength(1);
    expect(stage.children[0].children[1].children).toHaveLength(70);
    expect(stage.properties.height).toBe('150%');
    const box = stage.children[0].attributes.viewBox.split(' ').map(Number);
    const expected = f.api.projectPoint(
      record.facilities[0].point,
      box,
      100,
      100,
    )!;
    expect(facility.style).toMatchObject({
      left: `${expected[0]}%`,
      top: `${expected[1]}%`,
    });
    expect(resource.dataset.regionalLocation).toBe('source-point');
    const recreated = new Node();
    recreated.dataset.id = facility.dataset.id;
    stage.querySelectorAll.mockReturnValue([recreated]);
    f.observers[0].callback();
    expect(recreated.style).toMatchObject({
      left: `${expected[0]}%`,
      top: `${expected[1]}%`,
    });
    viewport.clientWidth = 332;
    viewport.clientHeight = 332;
    f.observers[1].callback();
    const resizedBox = stage.children[0].attributes.viewBox
      .split(' ')
      .map(Number);
    expect(resizedBox[2] / resizedBox[3]).toBeCloseTo(1);
    expect(stage.properties['--regional-stage-ratio']).toBe('1');
    expect(stage.properties.height).toBe('150%');
    const resizedPoint = f.api.projectPoint(
      record.facilities[0].point,
      resizedBox,
      100,
      100,
    )!;
    expect(recreated.style).toMatchObject({
      left: `${resizedPoint[0]}%`,
      top: `${resizedPoint[1]}%`,
    });
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
    expect(source).not.toMatch(
      /addEventListener|localStorage|Command|eez|territorialCandidate|cloneNode/,
    );
    expect(authority).not.toHaveBeenCalled();
  });

  it.each(['01', '13', '54', '70'])(
    'keeps %s geography in bounds and the viewport aspect intact for portrait and landscape',
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
        expect(box[0]).toBeGreaterThanOrEqual(0);
        expect(box[1]).toBeGreaterThanOrEqual(0);
        expect(box[0] + box[2]).toBeLessThanOrEqual(partition.width + 1e-9);
        expect(box[1] + box[3]).toBeLessThanOrEqual(partition.height + 1e-9);
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

  it('mounts once per HOME, caches the pinned source, projects the same geography for the flowing mobile map without editing source anchors and disposes the prior observer', async () => {
    const f = fixture();
    const record = country('54');
    const before = structuredClone(record);
    await f.api.mountCountrySurroundings(f.root, record);
    expect(f.scene.children).toHaveLength(1);
    const svg = f.scene.children[0].children[0];
    expect(svg.attributes.viewBox).toBe(
      f.api.regionalViewBox(record.frame, 1920, 1080, 1774, 887)!.join(' '),
    );
    expect(f.scene.properties['--country-scene-size']).toBe('1080px');
    f.root.clientWidth = 390;
    f.root.clientHeight = 2400;
    f.scene.clientWidth = 390;
    f.scene.clientHeight = 390;
    f.observers[0].callback();
    expect(svg.attributes.viewBox).toBe(
      f.api.regionalViewBox(record.frame, 390, 390, 1774, 887)!.join(' '),
    );
    expect(f.scene.properties['--country-scene-size']).toBe('390px');
    expect(record).toEqual(before);
    await f.api.mountCountrySurroundings(f.root, record);
    expect(f.scene.children).toHaveLength(1);
    const nextRoot = new Node();
    nextRoot.querySelector = f.root.querySelector;
    await f.api.mountCountrySurroundings(nextRoot, record);
    expect(f.observers[0].disconnect).toHaveBeenCalledOnce();
    expect(f.fetch).toHaveBeenCalledTimes(2);
    expect(f.authority).not.toHaveBeenCalled();
    expect(f.mission.children[0].textContent).toContain('context only');
  });

  it.each(['http', 'hash', 'terrain-hash'] as const)(
    'fails closed on %s source failure without hiding the existing scene',
    async (failure) => {
      const f = fixture(failure);
      await f.api.mountCountrySurroundings(f.root, country('54'));
      expect(f.scene.children).toHaveLength(0);
      expect(f.scene.properties).toEqual({});
      expect(f.mission.children[0].textContent).toContain('unavailable');
      expect(f.observers).toHaveLength(0);
      expect(f.authority).not.toHaveBeenCalled();
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

  it('repositions only existing own-country site buttons from their real source points, without editing records or enabling a foreign site', async () => {
    const f = fixture();
    const record = country('54');
    const first = record.facilities[0];
    const second = record.facilities[1];
    second.countryId = 'visual-territory-55';
    const before = structuredClone(record);
    await f.api.mountCountrySurroundings(f.root, record);
    const box = f.api.regionalViewBox(record.frame, 1920, 1080, 1774, 887)!;
    const projected = f.api.projectPoint(first.point, box, 1920, 1080)!;
    expect(f.pins.get(first.id)?.properties['--regional-pin-x']).toBe(
      `${projected[0]}px`,
    );
    expect(f.pins.get(first.id)?.properties['--regional-pin-y']).toBe(
      `${projected[1]}px`,
    );
    expect(f.pins.get(first.id)?.dataset.regionalLocation).toBe('source-point');
    expect(f.pins.get(second.id)?.dataset.regionalLocation).toBeUndefined();
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
