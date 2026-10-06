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
  setAttribute = (key: string, value: string) => {
    this.attributes[key] = value;
  };
  append = (child: Node) => {
    this.children.push(child);
  };
  prepend = (child: Node) => {
    this.children.unshift(child);
  };
  querySelector = vi.fn<(selector: string) => Node | null>(() => null);
}

function fixture(failure?: 'http' | 'hash') {
  const mission = new Node();
  const scene = new Node();
  const root = new Node();
  root.querySelector.mockImplementation((selector) =>
    selector === '.national-edition' ? mission : scene,
  );
  const observers: {
    callback: () => void;
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const fetch = vi.fn(async () => ({
    ok: failure !== 'http',
    arrayBuffer: async () =>
      new Uint8Array(failure === 'hash' ? [1, 2] : partitionBytes).buffer,
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
      ) + '\n({regionalViewBox,regionalSvg,mountCountrySurroundings})',
    {
      URL,
      TextDecoder,
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
      localStorage: { setItem: authority },
      submit: authority,
    },
  ) as {
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
  };
  return { api, root, mission, scene, observers, fetch, authority };
}

describe('country HOME source-coordinate surroundings, not ownership', () => {
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
        f.root.children[0].children[0].attributes['data-selected-country'],
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

  it('mounts once per HOME, caches the pinned source, resizes without touching scene anchors and disposes the prior observer', async () => {
    const f = fixture();
    const record = country('54');
    const before = structuredClone(record);
    await f.api.mountCountrySurroundings(f.root, record);
    expect(f.root.children).toHaveLength(1);
    const svg = f.root.children[0].children[0];
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
      f.api.regionalViewBox(record.frame, 390, 2400, 1774, 887)!.join(' '),
    );
    expect(f.scene.properties['--country-scene-size']).toBe('390px');
    expect(record).toEqual(before);
    await f.api.mountCountrySurroundings(f.root, record);
    expect(f.root.children).toHaveLength(1);
    const nextRoot = new Node();
    nextRoot.querySelector = f.root.querySelector;
    await f.api.mountCountrySurroundings(nextRoot, record);
    expect(f.observers[0].disconnect).toHaveBeenCalledOnce();
    expect(f.fetch).toHaveBeenCalledOnce();
    expect(f.authority).not.toHaveBeenCalled();
    expect(f.mission.children[0].textContent).toContain(
      'separate illustration',
    );
  });

  it.each(['http', 'hash'] as const)(
    'fails closed on %s source failure without hiding the existing scene',
    async (failure) => {
      const f = fixture(failure);
      await f.api.mountCountrySurroundings(f.root, country('54'));
      expect(f.root.children).toHaveLength(0);
      expect(f.scene.properties).toEqual({});
      expect(f.mission.children[0].textContent).toContain('unavailable');
      expect(f.observers).toHaveLength(0);
      expect(f.authority).not.toHaveBeenCalled();
    },
  );

  it('does not attach a stale asynchronous response to a discarded HOME', async () => {
    const f = fixture();
    f.root.isConnected = false;
    await f.api.mountCountrySurroundings(f.root, country('54'));
    expect(f.root.children).toHaveLength(0);
    expect(f.observers).toHaveLength(0);
  });
});
