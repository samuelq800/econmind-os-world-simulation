import detailMaps from '../assets/country-detail/index.json';
import continentArtworks from '../assets/continent-scenes/index.json';
import sceneIndex from '../assets/country-scenes/index.json';
import { continentSceneUrls } from './continent-scene-urls.js';
import { continentFor } from './continent-layout.js';
import { countryDetailUrls } from './country-detail-urls.js';
import { countrySceneUrls } from './country-scene-urls.js';
import { shouldMountDetailTile } from './detail-tile-visibility.js';
import { layoutLabels } from './label-layout.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import terrain from '../assets/asterra-satellite-terrain-v8.png';
import {
  artwork,
  partition,
  resourceTypeById,
} from '../map-lab/display-layers.js';
import scenario from '../map-lab/geographic-scenario.json';
import './world-explorer.css';

type CountryScene = {
  id: string;
  file: string;
  frame: number[];
  anchors: Record<string, number[]>;
};
const scenes = sceneIndex as CountryScene[];
type Camera = { x: number; y: number; width: number };
type Size = { width: number; height: number };
const world: Camera = { x: 887, y: 443.5, width: 1900 };
const countries = partition.territories.map((country, index) => {
  const values = (
    country.path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? []
  ).map(Number);
  const xs = values.filter((_, i) => i % 2 === 0),
    ys = values.filter((_, i) => i % 2 === 1);
  return {
    ...country,
    name: artwork.political.countries[index]!.name,
    bounds: [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ] as const,
  };
});
const facilities = [...artwork.nodes, ...artwork.facilities].map((site) => ({
  ...site,
  record: scenario.facilities.find((f) => f.id === site.id)!,
}));
const units: Record<string, string> = {
  MW: 'MW',
  MWh: 'MWh',
  'barrel/sim-day': '桶/模拟日',
  'MMBtu/sim-day': 'MMBtu/模拟日',
  'tonne/sim-day': '吨/模拟日',
  'tonne U/sim-day': '吨铀/模拟日',
  'tonne LCE/sim-day': '吨碳酸锂当量/模拟日',
  'equipment-unit/sim-day': '设备单位/模拟日',
  'student-seat': '学位',
  'patient-visit/sim-day': '人次/模拟日',
  'dwelling-unit': '套住房',
};
const format = (n: number) =>
  n.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
const shortPopulation = (n: number) =>
  n >= 1e8 ? `${(n / 1e8).toFixed(2)} 亿` : `${(n / 1e4).toFixed(0)} 万`;
const readCountry = () => {
  const id = new URLSearchParams(window.location.search).get('country');
  return countries.find((c) => c.number === id || c.id === id)?.id ?? '';
};
function FacilityIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    mine: 'M4 8Q12 2 21 9M14 6L6 22M4 21L8 23',
    port: 'M12 3V23M3 13V17Q12 29 21 17V13M7 8H17M9 3H15',
    hub: 'M3 8L12 3L21 8V19L12 24L3 19ZM3 8L12 13L21 8M12 13V24',
    energy: 'M15 2L4 15H12L9 27L22 11H14Z',
    farm: 'M12 25V3M12 16Q1 15 4 7Q12 8 12 16M12 10Q23 9 20 2Q12 3 12 10',
    factory: 'M2 24V11L9 7V13L16 8V24ZM18 24V3H23V24M6 17V21M12 17V21',
  };
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d={paths[kind] ?? paths.factory} />
    </svg>
  );
}
function placeName(site: (typeof facilities)[number]) {
  const country = countries.find((c) => c.id === site.countryId)!;
  const [x0, y0, x1, y1] = country.bounds;
  const sourcePoint =
    facilities.find((candidate) => candidate.id === site.id)?.point ??
    site.point;
  const dx = (sourcePoint[0]! - (x0 + x1) / 2) / (x1 - x0),
    dy = (sourcePoint[1]! - (y0 + y1) / 2) / (y1 - y0);
  const direction =
    Math.abs(dx) > Math.abs(dy)
      ? dx < 0
        ? '西部'
        : '东部'
      : dy < 0
        ? '北部'
        : '南部';
  return `${direction}${site.record.name}`;
}

export function WorldExplorer() {
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 1200, height: 800 });
  const [countryId, setCountryId] = useState(readCountry);
  const [camera, setCamera] = useState<Camera>(world);
  const cameraRef = useRef(camera),
    sizeRef = useRef(size);
  cameraRef.current = camera;
  sizeRef.current = size;
  const [selectedSite, setSelectedSite] = useState('');
  const [filter, setFilter] = useState('全部');
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [showWater, setShowWater] = useState(true);
  const [showArtwork, setShowArtwork] = useState(true);
  const [sceneMode, setSceneMode] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const sceneModeRef = useRef(sceneMode);
  sceneModeRef.current = sceneMode;
  const [showResources, setShowResources] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const suppressClick = useRef(false);
  const pointerCountry = useRef('');
  const country = countries.find((c) => c.id === countryId);
  const detailMap = detailMaps.find((m) => m.id === countryId);
  const scene = sceneMode ? scenes.find((m) => m.id === countryId) : undefined;
  const society = scenario.countries.find((c) => c.countryId === countryId);
  const local = facilities
    .filter((f) => f.countryId === countryId)
    .map((f) => {
      const anchor = scene?.anchors[f.id];
      return {
        ...f,
        point:
          scene && anchor
            ? [
                scene.frame[0]! + anchor[0]! * scene.frame[2]!,
                scene.frame[1]! + anchor[1]! * scene.frame[3]!,
              ]
            : f.point,
      };
    });
  const selected = local.find((f) => f.id === selectedSite);
  const shown = local.filter((f) => filter === '全部' || f.kind === filter);
  const height = (camera.width * size.height) / size.width;
  const box = {
    x: camera.x - camera.width / 2,
    y: camera.y - height / 2,
    width: camera.width,
    height,
  };
  const project = (point: readonly number[]) => ({
    left: `${((point[0]! - box.x) / box.width) * 100}%`,
    top: `${((point[1]! - box.y) / box.height) * 100}%`,
  });
  const visiblePoint = (point: readonly number[]) =>
    point[0]! > box.x &&
    point[0]! < box.x + box.width &&
    point[1]! > box.y &&
    point[1]! < box.y + box.height;
  const markers = layoutLabels(
    (showLabels ? shown : [])
      .filter((s) => visiblePoint(s.point))
      .sort((a, b) => {
        const rank = (s: (typeof shown)[number]) =>
          s.id === selectedSite
            ? 0
            : s.kind === 'port'
              ? 1
              : s.kind === 'factory'
                ? 2
                : s.kind === 'hub'
                  ? 3
                  : 4;
        return rank(a) - rank(b);
      })
      .slice(0, size.width < 420 ? 1 : size.width < 750 ? 3 : 4)
      .map((s) => ({
        id: s.id,
        x: ((s.point[0]! - box.x) / box.width) * size.width,
        y: ((s.point[1]! - box.y) / box.height) * size.height,
      })),
    size,
    [
      {
        x: 10,
        y: 10,
        width: Math.min(360, size.width * 0.65),
        height: size.width < 750 ? 190 : 270,
      },
      { x: size.width - 66, y: 8, width: 62, height: 170 },
    ],
  );
  const fit = useCallback((id: string) => {
    const c = countries.find((item) => item.id === id);
    if (!c) {
      setCamera({
        ...world,
        width: sizeRef.current.width < 600 ? 700 : world.width,
      });
      return;
    }
    const scene = sceneModeRef.current
      ? scenes.find((m) => m.id === id)
      : undefined;
    const [x0, y0, x1, y1] = scene
      ? [
          scene.frame[0]!,
          scene.frame[1]!,
          scene.frame[0]! + scene.frame[2]!,
          scene.frame[1]! + scene.frame[3]!,
        ]
      : c.bounds;
    const ratio = sizeRef.current.width / sizeRef.current.height;
    setCamera({
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2,
      width: Math.max(x1 - x0, (y1 - y0) * ratio) * (scene ? 1.015 : 1.55),
    });
  }, []);
  const focusContinent = (id: string) => {
    const art = continentArtworks.find((item) => item.id === id);
    if (!art || country) return;
    const [x, y, width, height] = art.frame;
    const ratio = sizeRef.current.width / sizeRef.current.height;
    setCamera({
      x: x! + width! / 2,
      y: y! + height! / 2,
      width: Math.max(width!, height! * ratio) * 1.06,
    });
  };
  const navigate = useCallback(
    (id: string) => {
      const c = countries.find((item) => item.id === id);
      const url = new URL(window.location.href);
      url.searchParams.set('atlas', 'explorer');
      if (c) url.searchParams.set('country', c.number);
      else url.searchParams.delete('country');
      window.history.pushState({}, '', url);
      setCountryId(id);
      setSelectedSite('');
      setFilter('全部');
      setDrawer(false);
      fit(id);
    },
    [fit],
  );
  useEffect(() => {
    const el = viewport.current!;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        const next = {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        };
        sizeRef.current = next;
        setSize(next);
      }
    });
    observer.observe(el);
    const bounds = el.getBoundingClientRect();
    sizeRef.current = { width: bounds.width, height: bounds.height };
    fit(readCountry());
    const back = () => {
      const id = readCountry();
      setCountryId(id);
      setSelectedSite('');
      fit(id);
    };
    window.addEventListener('popstate', back);
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', back);
    };
  }, [fit]);
  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setCamera((c) => {
      const s = sizeRef.current;
      // Numerical guard only: no previous 220-pixel detail ceiling. Vector markers stay sharp.
      const next = Math.max(0.0001, Math.min(12000, c.width * factor));
      const dx = px / s.width - 0.5,
        dy = py / s.height - 0.5;
      return {
        x: c.x + dx * (c.width - next),
        y: c.y + (dy * (c.width - next) * s.height) / s.width,
        width: next,
      };
    });
  }, []);
  useEffect(() => {
    const el = viewport.current!;
    const wheel = (event: WheelEvent) => {
      if (
        (event.target as HTMLElement).closest(
          'button,input,select,a,.explorer-floating',
        )
      )
        return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(
        Math.exp(Math.max(-200, Math.min(200, event.deltaY)) * 0.0025),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoomAt]);
  const focusSite = (id: string) => {
    const site = local.find((f) => f.id === id)!;
    setSelectedSite(id);
    setCamera((c) => ({
      x: site.point[0]!,
      y: site.point[1]!,
      width: Math.min(c.width, scene ? scene.frame[2]! * 0.48 : 95),
    }));
  };
  const gridLines = useMemo(() => {
    if (camera.width > 180) return [];
    const step = 10 ** Math.floor(Math.log10(camera.width / 8));
    const result = [];
    for (
      let x = Math.ceil(box.x / step) * step;
      x < box.x + box.width;
      x += step
    )
      result.push(<path key={`x${x}`} d={`M${x} ${box.y}v${box.height}`} />);
    for (
      let y = Math.ceil(box.y / step) * step;
      y < box.y + box.height;
      y += step
    )
      result.push(<path key={`y${y}`} d={`M${box.x} ${y}h${box.width}`} />);
    return result;
  }, [camera.width, box.x, box.y, box.width, box.height]);
  const visibleDetailMaps = !country
    ? detailMaps.filter((map) => {
        const territory = countries.find((item) => item.id === map.id);
        return (
          territory &&
          shouldMountDetailTile(box, territory.bounds, !showArtwork)
        );
      })
    : [];
  return (
    <main className="world-explorer">
      <header className="explorer-topbar">
        <a href="?atlas=explorer" className="explorer-brand">
          E<span>ASTERRA ATLAS</span>
        </a>
        <nav>
          <button onClick={() => navigate('')}>世界总览</button>
          <a className="old-atlas" href="?atlas=continents">
            大陆图集
          </a>
          <span>/</span>
          <button onClick={() => setDrawer((v) => !v)}>
            {country ? `${country.number} · ${country.name}` : '探索 70 个国家'}{' '}
            <small>⌄</small>
          </button>
        </nav>
        <a className="old-atlas explorer-map-link" href="?atlas=map">
          图层工作台 ↗
        </a>
        <a
          className="old-atlas explorer-national-link"
          href={`./season1-immersive/?role=finance&country=${country?.number ?? '01'}#country`}
          title={
            country ? `${country.name} · 国家操作` : '默认国家 01 · Avenor'
          }
        >
          国家操作 ↗
        </a>
      </header>
      <div className="explorer-layout">
        <div
          ref={viewport}
          className={`explorer-viewport ${dragging ? 'is-dragging' : ''}`}
          tabIndex={0}
          aria-label="可拖拽缩放的世界地图"
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === '+' || e.key === '=') {
              e.preventDefault();
              zoomAt(0.7, size.width / 2, size.height / 2);
            }
            if (e.key === '-') {
              e.preventDefault();
              zoomAt(1.4, size.width / 2, size.height / 2);
            }
            if (e.key === '0') fit(countryId);
          }}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest('button,.explorer-floating'))
              return;
            const r = e.currentTarget.getBoundingClientRect();
            zoomAt(0.5, e.clientX - r.left, e.clientY - r.top);
          }}
          onPointerDown={(e) => {
            if (
              (e.target as HTMLElement).closest(
                'button,input,select,a,.explorer-floating',
              )
            )
              return;
            pointerCountry.current =
              (e.target as Element)
                .closest('[data-country]')
                ?.getAttribute('data-country') ?? '';
            e.currentTarget.setPointerCapture(e.pointerId);
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            pointer.current = {
              id: e.pointerId,
              x: e.clientX,
              y: e.clientY,
              startX: e.clientX,
              startY: e.clientY,
              moved: false,
            };
            setDragging(true);
            suppressClick.current = false;
          }}
          onPointerMove={(e) => {
            if (!pointers.current.has(e.pointerId)) return;
            const previous = [...pointers.current.values()];
            const before = pointers.current.get(e.pointerId)!;
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.current.size === 2) {
              const after = [...pointers.current.values()];
              const a = previous[0]!,
                b = previous[1]!,
                c = after[0]!,
                d = after[1]!;
              const oldDistance = Math.hypot(a.x - b.x, a.y - b.y),
                newDistance = Math.hypot(c.x - d.x, c.y - d.y);
              const rect = e.currentTarget.getBoundingClientRect();
              if (oldDistance > 0 && newDistance > 0)
                zoomAt(
                  oldDistance / newDistance,
                  (c.x + d.x) / 2 - rect.left,
                  (c.y + d.y) / 2 - rect.top,
                );
              suppressClick.current = true;
              return;
            }
            const deltaX = e.clientX - before.x,
              deltaY = e.clientY - before.y;
            if (
              pointer.current &&
              Math.hypot(
                e.clientX - pointer.current.startX,
                e.clientY - pointer.current.startY,
              ) > 4
            )
              suppressClick.current = true;
            const unitsPerPixel =
              cameraRef.current.width / sizeRef.current.width;
            setCamera((c) => ({
              ...c,
              x: c.x - deltaX * unitsPerPixel,
              y: c.y - deltaY * unitsPerPixel,
            }));
          }}
          onPointerUp={(e) => {
            if (
              pointerCountry.current &&
              !suppressClick.current &&
              pointers.current.size === 1
            )
              navigate(pointerCountry.current);
            pointerCountry.current = '';
            pointers.current.delete(e.pointerId);
            if (!pointers.current.size) {
              pointer.current = null;
              setDragging(false);
            }
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            pointer.current = null;
            setDragging(false);
          }}
        >
          <svg
            className="explorer-terrain"
            viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
            aria-label="国家地形与设施位置"
          >
            <defs>
              <filter id="terrain-contrast">
                <feColorMatrix type="saturate" values=".85" />
              </filter>
              <filter id="continent-land-art" colorInterpolationFilters="sRGB">
                <feColorMatrix
                  type="matrix"
                  values="1 0 0 0 0
                          0 1 0 0 0
                          0 0 1 0 0
                          1.4 .8 -1.8 0 .2"
                />
                <feComponentTransfer>
                  <feFuncA type="linear" slope="1.8" />
                </feComponentTransfer>
              </filter>
              {!country &&
                countries.map((item) => (
                  <clipPath
                    key={item.id}
                    id={`mosaic-${item.number}`}
                    clipPathUnits="userSpaceOnUse"
                  >
                    <path d={item.path} />
                  </clipPath>
                ))}
              {!country &&
                continentArtworks.map((scene) => (
                  <clipPath
                    key={scene.id}
                    id={`continent-land-${scene.id}`}
                    clipPathUnits="userSpaceOnUse"
                  >
                    {countries
                      .filter((item) => continentFor(item.label) === scene.id)
                      .map((item) => (
                        <path key={item.id} d={item.path} />
                      ))}
                  </clipPath>
                ))}
            </defs>
            <rect
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              fill="#102e39"
            />
            {scene ? (
              <image
                href={countrySceneUrls[scene.file]}
                x={scene.frame[0]}
                y={scene.frame[1]}
                width={scene.frame[2]}
                height={scene.frame[3]}
                preserveAspectRatio="none"
              />
            ) : detailMap ? (
              <image
                href={countryDetailUrls[detailMap.file]}
                x={detailMap.viewBox[0]}
                y={detailMap.viewBox[1]}
                width={detailMap.viewBox[2]}
                height={detailMap.viewBox[3]}
                preserveAspectRatio="none"
              />
            ) : (
              <>
                <image
                  href={terrain}
                  width="1774"
                  height="887"
                  filter="url(#terrain-contrast)"
                />
                {showArtwork &&
                  continentArtworks.map((art) => (
                    <image
                      key={art.id}
                      className="explorer-continent-art"
                      aria-hidden="true"
                      href={continentSceneUrls[art.file]}
                      x={art.frame[0]}
                      y={art.frame[1]}
                      width={art.frame[2]}
                      height={art.frame[3]}
                      preserveAspectRatio="xMidYMid slice"
                      filter="url(#continent-land-art)"
                      clipPath={`url(#continent-land-${art.id})`}
                      data-continent-art={art.id}
                    />
                  ))}
                {visibleDetailMaps.map((map) => {
                  const territory = countries.find(
                    (item) => item.id === map.id,
                  );
                  if (!territory) return null;
                  return (
                    <image
                      className={`explorer-mosaic-tile ${showArtwork ? 'with-artwork' : ''}`}
                      key={map.id}
                      aria-hidden="true"
                      href={countryDetailUrls[map.file]}
                      x={map.viewBox[0]}
                      y={map.viewBox[1]}
                      width={map.viewBox[2]}
                      height={map.viewBox[3]}
                      preserveAspectRatio="none"
                      clipPath={`url(#mosaic-${territory.number})`}
                      data-mosaic-country={territory.number}
                    />
                  );
                })}
              </>
            )}
            {!scene &&
              countries.map((c) => (
                <path
                  key={c.id}
                  d={c.path}
                  className={
                    c.id === countryId
                      ? 'explorer-country selected'
                      : 'explorer-country'
                  }
                  data-country={c.id}
                >
                  <title>
                    {c.number} · {c.name}
                  </title>
                </path>
              ))}
            {!scene &&
              showWater &&
              artwork.physical
                .filter((f) => f.kind !== 'mountain')
                .map((f) => (
                  <path
                    key={f.id}
                    d={f.path}
                    className={`explorer-water ${f.kind}`}
                  />
                ))}
            {!scene &&
              artwork.physical
                .filter((feature) => feature.kind === 'mountain')
                .map((feature) => (
                  <path
                    key={feature.id}
                    d={feature.path}
                    className="explorer-mountain"
                  />
                ))}
            {!scene &&
              showConnections &&
              scenario.freight
                .filter((l) => l.countryIds.includes(countryId))
                .map((l) => (
                  <path key={l.id} d={l.path} className="explorer-corridor">
                    <title>待勘测连接 · 非已投运道路</title>
                  </path>
                ))}
            <g className="explorer-detail-grid">{!scene && gridLines}</g>
          </svg>
          <div className="explorer-vignette" />
          <div className="explorer-heading explorer-floating">
            <span>
              {country
                ? 'COUNTRY / INDUSTRY & RESOURCES'
                : 'WORLD / GEOGRAPHY & SETTLEMENTS'}
            </span>
            <h1>{country ? country.name : '一个世界，七十种起点'}</h1>
            <p>
              {country
                ? `${country.number} 号经济体 · ${scene ? '独立国家场景' : '地理与国界'} · 聚居与基础设施`
                : '选择一个国家，沿着河谷、城市与产业进入它的内部。'}
            </p>
            {society && (
              <div className="country-key-stats">
                <span>
                  <b>{shortPopulation(society.population)}</b>情景人口
                </span>
                <span>
                  <b>{local.length}</b>设施候选
                </span>
                <span>
                  <b>
                    {
                      scenario.regions.filter((r) => r.countryId === countryId)
                        .length
                    }
                  </b>
                  经济区域
                </span>
              </div>
            )}
          </div>
          {!country &&
            size.width >= 600 &&
            countries
              .filter((c) => visiblePoint(c.label))
              .map((c) => (
                <button
                  key={c.id}
                  className="explorer-country-pin"
                  style={project(c.label)}
                  onClick={() => navigate(c.id)}
                  aria-label={`进入 ${c.number} ${c.name}`}
                >
                  <b>{c.number}</b>
                  <span>{c.name}</span>
                </button>
              ))}
          {!country && visiblePoint([824, 541]) && (
            <span className="explorer-island-badge" style={project([824, 541])}>
              Callum Island
            </span>
          )}
          {country && (
            <svg
              className="explorer-leaders"
              viewBox={`0 0 ${size.width} ${size.height}`}
              aria-hidden="true"
            >
              {markers.map((m) => (
                <g key={m.id}>
                  <path
                    d={`M${m.anchorX} ${m.anchorY}L${Math.max(m.x, Math.min(m.x + m.width, m.anchorX))} ${Math.max(m.y, Math.min(m.y + m.height, m.anchorY))}`}
                  />
                  <circle cx={m.anchorX} cy={m.anchorY} r="4" />
                </g>
              ))}
            </svg>
          )}
          {country &&
            showLabels &&
            shown
              .filter((s) => visiblePoint(s.point))
              .map((site) => (
                <button
                  key={`pin-${site.id}`}
                  className={`explorer-facility-dot ${selectedSite === site.id ? 'active' : ''}`}
                  style={project(site.point)}
                  onClick={() => setSelectedSite(site.id)}
                  aria-label={`查看${placeName(site)} ${site.id}`}
                  title={`${placeName(site)} · ${site.id}`}
                >
                  <FacilityIcon kind={site.kind} />
                </button>
              ))}
          {country &&
            markers.map((marker) => {
              const site = shown.find((s) => s.id === marker.id)!;
              return (
                <button
                  key={site.id}
                  className={`explorer-site ${selectedSite === site.id ? 'active' : ''}`}
                  style={{
                    left: marker.x,
                    top: marker.y,
                    width: marker.width,
                    height: marker.height,
                  }}
                  onClick={() => setSelectedSite(site.id)}
                  aria-label={`${placeName(site)} ${site.id}`}
                >
                  <span className="site-anchor" />
                  <FacilityIcon kind={site.kind} />
                  <span className="site-label">
                    <strong>{placeName(site)}</strong>
                    <small>
                      {site.record.estimatedCapacity >= 10000
                        ? `${(site.record.estimatedCapacity / 10000).toFixed(1)}万`
                        : format(site.record.estimatedCapacity)}{' '}
                      {units[site.record.capacityUnit] ??
                        site.record.capacityUnit}
                    </small>
                    <em>{site.id} · 候选 / 未投运</em>
                  </span>
                </button>
              );
            })}
          {!scene &&
            showResources &&
            artwork.resources
              .filter(
                (r) =>
                  r.countryId === countryId &&
                  r.classification === 'geological' &&
                  visiblePoint(r.point),
              )
              .map((r) => (
                <span
                  key={r.id}
                  className="explorer-resource-pin"
                  style={project(r.point)}
                  title={`${r.id} · ${resourceTypeById.get(r.kind)?.name}`}
                >
                  <i>◇</i>
                  {resourceTypeById.get(r.kind)?.name}
                </span>
              ))}
          <div className="explorer-controls explorer-floating">
            <button
              aria-label="放大地图"
              onClick={() => zoomAt(0.65, size.width / 2, size.height / 2)}
            >
              ＋
            </button>
            <button
              aria-label="缩小地图"
              onClick={() => zoomAt(1.5, size.width / 2, size.height / 2)}
            >
              −
            </button>
            <button aria-label="适配当前国家" onClick={() => fit(countryId)}>
              ⌖
            </button>
            <span>
              {((scene?.frame[2] ?? 1900) / camera.width).toFixed(1)}×
            </span>
          </div>
          <div className="explorer-layer-controls explorer-floating">
            {!country && (
              <select
                aria-label="聚焦大陆精绘"
                value=""
                onChange={(event) => focusContinent(event.target.value)}
              >
                <option value="">聚焦大陆…</option>
                {continentArtworks.map((art) => (
                  <option key={art.id} value={art.id}>
                    {art.name}
                  </option>
                ))}
              </select>
            )}
            {country && scenes.some((s) => s.id === countryId) && (
              <button
                aria-pressed={Boolean(scene)}
                onClick={() => {
                  sceneModeRef.current = !sceneMode;
                  setSceneMode(!sceneMode);
                  setSelectedSite('');
                  fit(countryId);
                }}
              >
                {scene ? '地理图 ↗' : '场景图 ↗'}
              </button>
            )}
            {country && (
              <button
                aria-pressed={showLabels}
                onClick={() => setShowLabels((v) => !v)}
              >
                设施标注
              </button>
            )}
            {!scene && (
              <>
                {!country && (
                  <button
                    aria-pressed={showArtwork}
                    onClick={() => setShowArtwork((value) => !value)}
                  >
                    大陆精绘
                  </button>
                )}
                <button
                  aria-pressed={showWater}
                  onClick={() => setShowWater((v) => !v)}
                >
                  河湖
                </button>
                <button
                  aria-pressed={showResources}
                  onClick={() => setShowResources((v) => !v)}
                >
                  矿产
                </button>
                <button
                  aria-pressed={showConnections}
                  onClick={() => setShowConnections((v) => !v)}
                >
                  接入草案
                </button>
              </>
            )}
          </div>
          <div className="explorer-map-caption explorer-floating">
            <span>拖拽平移 · 滚轮 / 双指缩放 · 双击放大</span>
            <small>
              {scene
                ? '本国规划场景插画 · 建筑为示意复原 · 能力为情景估值'
                : country
                  ? '地理底图 · 国界、水系与设施坐标来自地图数据'
                  : showArtwork
                    ? '四大陆精绘 · 放大后按需叠加 70 国地理细图 · 国界与水系保留 / 非实时 World State'
                    : '70 国地理细图全图模式 · 细图正按需载入 · 国界与水系保留 / 非实时 World State'}
            </small>
            <b>
              {scene
                ? '场景视图'
                : `${format((camera.width * 36000) / 1774 / 5)} km`}{' '}
              <i />
            </b>
          </div>
          {drawer && (
            <aside className="explorer-country-drawer explorer-floating">
              <div>
                <h2>国家目录</h2>
                <button
                  onClick={() => setDrawer(false)}
                  aria-label="关闭国家目录"
                >
                  ×
                </button>
              </div>
              <input
                autoFocus
                placeholder="搜索国家名称或编号"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <section>
                {countries
                  .filter((c) =>
                    `${c.number} ${c.name}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((c) => (
                    <button key={c.id} onClick={() => navigate(c.id)}>
                      <b>{c.number}</b>
                      {c.name}
                      <span>↗</span>
                    </button>
                  ))}
              </section>
            </aside>
          )}
        </div>
        {country && (
          <aside className="explorer-sidebar">
            <div className="sidebar-title">
              <span>COUNTRY DIRECTORY</span>
              <h2>{selected ? placeName(selected) : '基础设施图谱'}</h2>
              {selected ? (
                <button onClick={() => setSelectedSite('')}>← 全部设施</button>
              ) : (
                <p>点击地图标牌，或从下面定位。</p>
              )}
            </div>
            {selected ? (
              <div className="facility-inspector">
                <div className="facility-status">● 候选设施 · 尚未投运</div>
                <div className="facility-big-number">
                  {format(selected.record.estimatedCapacity)}
                  <small>
                    {units[selected.record.capacityUnit] ??
                      selected.record.capacityUnit}
                  </small>
                </div>
                <dl>
                  {[
                    ['项目编号', selected.record.projectId],
                    ['设施编号', selected.id],
                    [
                      '所需人员',
                      `${format(selected.record.requiredWorkers)} 人`,
                    ],
                    [
                      '用电需求',
                      `${format(selected.record.requiredPowerMW)} MW`,
                    ],
                    [
                      '用水需求',
                      `${format(selected.record.requiredWaterM3Day)} m³/日`,
                    ],
                    [
                      '设备需求',
                      `${format(selected.record.equipmentUnits)} 单位`,
                    ],
                    [
                      '维护估计',
                      `${format(selected.record.maintenanceGcuDay)} GCU/日`,
                    ],
                    [
                      '建设估计',
                      `${selected.record.constructionSimDays} 模拟日`,
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <button
                  className="explorer-primary"
                  onClick={() => focusSite(selected.id)}
                >
                  定位并放大 ↗
                </button>
                <p>
                  {scene
                    ? '场景图展示规划建成后的形态，标记对应图中设施；精确地理位置请切换地理图。'
                    : '投运需要完成建设、人员、电网、运输与配方核验。标记位置来自当前地图数据。'}
                </p>
              </div>
            ) : (
              <>
                <div className="facility-filters">
                  {[
                    ['全部', '全部'],
                    ['mine', '矿业'],
                    ['energy', '能源'],
                    ['port', '港口'],
                    ['hub', '物流'],
                    ['factory', '产业 / 社会'],
                  ].map(([id, name]) => (
                    <button
                      key={id}
                      className={filter === id ? 'active' : ''}
                      onClick={() => setFilter(id!)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <div className="facility-directory">
                  {shown.map((site) => (
                    <button
                      key={site.id}
                      onClick={() => {
                        focusSite(site.id);
                      }}
                    >
                      <FacilityIcon kind={site.kind} />
                      <span>
                        <strong>{placeName(site)}</strong>
                        <small>
                          {site.id} · {format(site.record.estimatedCapacity)}{' '}
                          {units[site.record.capacityUnit] ??
                            site.record.capacityUnit}
                        </small>
                      </span>
                      <b>↗</b>
                    </button>
                  ))}
                </div>
                <div className="country-note">
                  <h3>这里的条件</h3>
                  <p>
                    人口、资源和设施候选依据地图及地理情景推导。起步机会只建议用金融与技术调节；设施不会因标注而自动投运。
                  </p>
                  <a href={`?atlas=coast-boundaries&country=${country.number}`}>
                    查看完整推导工作台 ↗
                  </a>
                </div>
              </>
            )}
            <footer className="country-pager">
              <button
                disabled={country.number === '01'}
                onClick={() =>
                  navigate(countries[Number(country.number) - 2]!.id)
                }
              >
                ← 上一国家
              </button>
              <button
                disabled={country.number === '70'}
                onClick={() => navigate(countries[Number(country.number)]!.id)}
              >
                下一国家 →
              </button>
            </footer>
          </aside>
        )}
      </div>
    </main>
  );
}
