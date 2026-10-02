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
import { artwork, partition } from '../map-lab/display-layers.js';
import scenario from '../map-lab/geographic-scenario.json';
import {
  createOfficialExplorerCountryLoader,
  type OfficialExplorerCountry,
  type OfficialExplorerCountryLoadState,
} from '../official-data/official-explorer-country.js';
import { OFFICIAL_EXPLORER_SUMMARY } from '../official-data/official-explorer-country-manifest.js';
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
type OfficialFacility = OfficialExplorerCountry['facilities'][number];
export type ExplorerCountryBinding = {
  countryId: string;
  state: OfficialExplorerCountryLoadState;
};

// A switch must hide the previous country's numbers before its next effect runs.
export function currentExplorerSource(
  id: string,
  binding: ExplorerCountryBinding,
): OfficialExplorerCountryLoadState {
  if (!id) return { kind: 'idle' };
  if (binding.countryId !== id) return { kind: 'loading' };
  if (binding.state.kind === 'ready' && binding.state.data.id !== id)
    return { kind: 'error', reason: 'SOURCE_INVALID' };
  return binding.state;
}

export function requestExplorerCountry(
  id: string,
  loader: ReturnType<typeof createOfficialExplorerCountryLoader>,
  publish: (binding: ExplorerCountryBinding) => void,
) {
  const abort = new AbortController();
  let active = true;
  publish({ countryId: id, state: { kind: id ? 'loading' : 'idle' } });
  if (id) {
    void loader.load(id, { signal: abort.signal }).then(
      (state) => {
        if (active) publish({ countryId: id, state });
      },
      () => {
        if (active)
          publish({
            countryId: id,
            state: { kind: 'error', reason: 'SOURCE_UNAVAILABLE' },
          });
      },
    );
  }
  return () => {
    active = false;
    abort.abort();
  };
}

export function ExactOfficialValue({
  data,
  path,
  showUnit = false,
}: {
  data: OfficialExplorerCountry;
  path: string;
  showUnit?: boolean;
}) {
  const source = data.officialSource;
  const field = source?.fields?.[path];
  const dataset = field && source?.datasets?.[field.dataset];
  if (
    !field ||
    !dataset ||
    typeof field.exact !== 'string' ||
    !/^-?\d+(?:\.\d+)?$/.test(field.exact)
  )
    return <span data-source-field={path}>精确值缺失</span>;
  return (
    <span
      data-source-field={path}
      title={`${field.dataset} / ${field.rowId} / ${field.field}; ${field.sourcePointer}; raw=${field.rawToken}; ${dataset?.sha256 ?? '来源hash缺失'}; ${field.unit}; ${field.unitBasis}; ${field.nature}`}
    >
      {field.exact}
      {showUnit &&
        ` ${field.unit === 'UNIT_NOT_SPECIFIED_IN_SOURCE' ? '（源未注明单位）' : field.unit}`}
    </span>
  );
}

export function OfficialSourceDetails({
  data,
  prefix = '',
}: {
  data: OfficialExplorerCountry;
  prefix?: string;
}) {
  const source = data.officialSource;
  return (
    <details className="official-source-details">
      <summary>数字来源与版本 · 展开逐字段详情</summary>
      <p>
        STATIC_BASELINE · proposalFieldsAreExecuted:false · liveWorldState:false
      </p>
      <p>countries SHA256: {data.source.countriesSha256}</p>
      <p>本国文件 SHA256: {data.source.countryFileSha256}</p>
      <p>数值保留源十进制原文；以下详情可用触屏或键盘展开，不换算时间单位。</p>
      {Object.entries(source?.fields ?? {})
        .filter(([path]) => path.startsWith(prefix))
        .map(([path, field]) => (
          <details key={path} data-source-detail={path}>
            <summary>{path}</summary>
            <dl>
              {[
                ['dataset', field.dataset],
                ['rowId', field.rowId],
                ['field', field.field],
                ['outputPointer', path],
                ['sourcePointer', field.sourcePointer],
                ['exact', field.exact],
                ['rawToken', field.rawToken],
                ['unit', field.unit],
                ['unitBasis', field.unitBasis],
                ['nature', field.nature],
                [
                  'SHA256',
                  source?.datasets?.[field.dataset]?.sha256 ?? '来源hash缺失',
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
    </details>
  );
}

export function OfficialSourceState({
  state,
  onRetry,
}: {
  state: OfficialExplorerCountryLoadState;
  onRetry: () => void;
}) {
  return (
    <div className="official-source-status" data-source-state={state.kind}>
      <p role="status">{sourceStatus(state)}</p>
      {state.kind !== 'ready' && state.kind !== 'idle' && (
        <button type="button" onClick={onRetry}>
          重新读取本国来源（只读）
        </button>
      )}
    </div>
  );
}

export function OfficialFacilityFacts({
  data,
  index,
}: {
  data: OfficialExplorerCountry;
  index: number;
}) {
  const site = data.facilities[index];
  if (!site) return <p>官方设施记录缺失</p>;
  return (
    <>
      <div className="facility-status">
        ● {site.record.lifecycle} · operational:
        {String(site.record.operational)} · 非实时投运状态
      </div>
      <div className="facility-big-number">
        <ExactOfficialValue
          data={data}
          path={`/facilities/${index}/record/estimatedCapacity`}
        />
        <small>{site.record.capacityUnit} · 开局能力记录，不是已执行产量</small>
      </div>
      <dl>
        <div>
          <dt>项目编号</dt>
          <dd>{site.record.projectId ?? '源未指定'}</dd>
        </div>
        <div>
          <dt>设施编号</dt>
          <dd>{site.id}</dd>
        </div>
        {[
          ['所需人员', 'requiredWorkers'],
          ['用电需求', 'requiredPowerMW'],
          ['用水需求', 'requiredWaterM3Day'],
          ['设备需求', 'equipmentUnits'],
          ['维护提案', 'maintenanceGcuDay'],
          ['建设期提案', 'constructionSimDays'],
        ].map(([label, key]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>
              <ExactOfficialValue
                data={data}
                path={`/facilities/${index}/record/${key}`}
                showUnit
              />
            </dd>
          </div>
        ))}
        <div>
          <dt>配方状态</dt>
          <dd>{site.record.recipeStatus}</dd>
        </div>
        <div>
          <dt>来源角色</dt>
          <dd>{site.record.scenarioRole}</dd>
        </div>
        <div>
          <dt>开局可用性提案</dt>
          <dd>{String(site.record.openingAvailabilityProposal)} · 非已批准</dd>
        </div>
      </dl>
      <OfficialSourceDetails data={data} prefix={`/facilities/${index}/`} />
    </>
  );
}

export function OfficialCountryFacts({
  data,
}: {
  data: OfficialExplorerCountry;
}) {
  const metrics = (
    base: string,
    fields: readonly (readonly [string, string])[],
  ) => (
    <dl className="official-country-metrics">
      {fields.map(([label, key]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>
            <ExactOfficialValue data={data} path={`${base}/${key}`} showUnit />
          </dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className="country-note official-country-facts">
      <h3>官方开局条件</h3>
      <p>
        {data.source.packageId} · 选定来源，不是运行时 World
        State；开局种子未提交。设施是完整源集合，历史开发选项只是子集。
      </p>
      {metrics('', [['国土面积', 'areaKm2']])}
      {metrics('/profile', [
        ['人口', 'population'],
        ['劳动力', 'labourForce'],
        ['就业分配提案', 'scenarioEmployed'],
        ['未就业分配提案', 'scenarioUnemployed'],
        ['粮食产出参考', 'foodProductionTonnesDay'],
        ['粮食需求参考', 'foodDemandTonnesDay'],
        ['粮食开局库存', 'foodAvailableStockTonnes'],
      ])}
      <h3>资源记录 · {data.resources.length}</h3>
      {data.resources.map((resource, index) => (
        <details key={resource.id} data-resource-id={resource.id}>
          <summary>
            {resource.type.name} · {resource.id}
          </summary>
          <p>{resource.visibility} · 不因显示而可交易或开采</p>
          {metrics(`/resources/${index}/deposit`, [
            ['初始地质储量', 'initialGeological'],
            ['剩余地质储量', 'remainingGeological'],
            ['已发现剩余', 'discoveredRemaining'],
            ['可采剩余', 'recoverableRemaining'],
            ['已开发剩余（有条件）', 'developedRemaining'],
            ['能力提案', 'extractionCapacityPerDay'],
            ['运行时开采量字段（非live）', 'runtimeExtractionPerDay'],
            ['埋深', 'depthM'],
          ])}
        </details>
      ))}
      <h3>区域记录 · {data.regions.length}</h3>
      {data.regions.map((region, index) => (
        <details key={region.id} data-region-id={region.id}>
          <summary>{region.id}</summary>
          {metrics(`/regions/${index}`, [['区域面积', 'areaKm2']])}
          {metrics(`/regions/${index}/initial`, [
            ['区域人口', 'population'],
            ['耕地', 'croplandHa'],
            ['粮食产出参考', 'grainTonnesDay'],
          ])}
          {metrics(`/regions/${index}/natural`, [
            ['平均海拔', 'meanElevationM'],
            ['温度', 'temperatureC'],
            ['年降水', 'annualRainMm'],
            ['可分配水参考', 'allocatableWaterM3Day'],
            ['旱季水参考', 'drySeasonWaterM3Day'],
            ['太阳能条件', 'solarKwhM2Day'],
            ['风速', 'windMps'],
          ])}
          <p>
            月降水（源单位）：
            {Array.from({ length: 12 }, (_, month) => (
              <span key={month}>
                {month > 0 ? ' / ' : ''}
                <ExactOfficialValue
                  data={data}
                  path={`/regions/${index}/natural/monthlyRainMm/${month}`}
                />
              </span>
            ))}
          </p>
        </details>
      ))}
      <OfficialSourceDetails data={data} />
    </div>
  );
}
function sourceStatus(state: OfficialExplorerCountryLoadState) {
  switch (state.kind) {
    case 'ready':
      return '官方选定开局数据 · STATIC_BASELINE · 非实时 World State';
    case 'loading':
      return '官方开局数据加载中 · 不显示旧情景数值';
    case 'missing':
      return `官方开局数据缺失 · ${state.reason}`;
    case 'stale':
      return `官方开局数据版本不匹配 · ${state.reason}`;
    case 'error':
      return `官方开局数据加载失败 · ${state.reason}`;
    default:
      return '选择国家后按需读取官方开局数据';
  }
}
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
function placeName(site: Pick<OfficialFacility, 'name'>) {
  return site.name;
}

export function officialFacilityPoint(
  site: OfficialFacility,
  frame?: readonly number[],
) {
  return frame && site.anchor
    ? ([
        frame[0]! + site.anchor[0] * frame[2]!,
        frame[1]! + site.anchor[1] * frame[3]!,
      ] as const)
    : site.point;
}

export function WorldExplorer({
  initialOfficialSource,
}: { initialOfficialSource?: ExplorerCountryBinding } = {}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 1200, height: 800 });
  const [countryId, setCountryId] = useState(readCountry);
  const loader = useMemo(() => createOfficialExplorerCountryLoader({}), []);
  const [officialBinding, setOfficialBinding] =
    useState<ExplorerCountryBinding>(
      initialOfficialSource ?? { countryId: '', state: { kind: 'idle' } },
    );
  const cancelOfficialRequest = useRef<(() => void) | undefined>(undefined);
  const retryOfficialSource = useCallback(() => {
    cancelOfficialRequest.current?.();
    cancelOfficialRequest.current = requestExplorerCountry(
      countryId,
      loader,
      setOfficialBinding,
    );
  }, [countryId, loader]);
  useEffect(() => {
    retryOfficialSource();
    return () => {
      cancelOfficialRequest.current?.();
      cancelOfficialRequest.current = undefined;
    };
  }, [retryOfficialSource]);
  const officialState = currentExplorerSource(countryId, officialBinding);
  const official =
    officialState.kind === 'ready' ? officialState.data : undefined;
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
  const local = (official?.facilities ?? []).map((f, sourceIndex) => {
    return {
      ...f,
      sourceIndex,
      point: officialFacilityPoint(f, scene ? official?.frame : undefined),
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
      setFilter('全部');
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
            {official && (
              <div className="country-key-stats">
                <span>
                  <b>
                    <ExactOfficialValue
                      data={official}
                      path="/profile/population"
                    />
                  </b>
                  开局人口（人）
                </span>
                <span>
                  <b>{local.length}</b>完整设施记录（非已投运）
                </span>
                <span>
                  <b>{official.regions.length}</b>
                  经济区域
                </span>
              </div>
            )}
            {!country && (
              <div
                className="country-key-stats"
                title="官方选定平衡包固定汇总 · 非live World State"
              >
                <span>
                  <b>{OFFICIAL_EXPLORER_SUMMARY.countriesExact}</b>国家
                </span>
                <span>
                  <b>{OFFICIAL_EXPLORER_SUMMARY.populationExact}</b>
                  开局人口（人）
                </span>
                <span>
                  <b>{OFFICIAL_EXPLORER_SUMMARY.facilitiesExact}</b>
                  完整设施记录（非已投运）
                </span>
              </div>
            )}
            {country && <p role="status">{sourceStatus(officialState)}</p>}
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
                      {official && (
                        <ExactOfficialValue
                          data={official}
                          path={`/facilities/${site.sourceIndex}/record/estimatedCapacity`}
                        />
                      )}{' '}
                      {units[site.record.capacityUnit] ??
                        site.record.capacityUnit}
                    </small>
                    <em>
                      {site.id} · {site.record.lifecycle} / 未投运
                    </em>
                  </span>
                </button>
              );
            })}
          {!scene &&
            showResources &&
            (official?.resources ?? [])
              .filter((r) => visiblePoint(r.point))
              .map((r) => (
                <span
                  key={r.id}
                  className="explorer-resource-pin"
                  style={project(r.point)}
                  title={`${r.id} · ${r.type.name} · 选定开局储量，非运行时开采`}
                >
                  <i>◇</i>
                  {r.type.name}
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
                ? '本国场景插画仅供展示 · 图内旧文字不是数值来源 · 数字只取官方选定开局包 / 非实时 World State'
                : country
                  ? '历史地理底图仅供展示 · 图内旧文字不是数值来源 · 设施坐标取官方生成记录 / 非实时 World State'
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
            {selected && official ? (
              <div className="facility-inspector">
                <OfficialFacilityFacts
                  data={official}
                  index={selected.sourceIndex}
                />
                <button
                  className="explorer-primary"
                  onClick={() => focusSite(selected.id)}
                >
                  定位并放大 ↗
                </button>
                <p>
                  {scene
                    ? '插画不是数值来源。标记只复用源记录已有anchor；anchor为空时保留源point，不臆造图内位置。'
                    : '坐标复用官方生成记录point，仍是展示定位，不证明测绘精度或已投运。'}
                </p>
              </div>
            ) : (
              <>
                <OfficialSourceState
                  state={officialState}
                  onRetry={retryOfficialSource}
                />
                {official && (
                  <div className="facility-filters">
                    {[
                      ['全部', '全部'],
                      ['mine', '矿业'],
                      ['energy', '能源'],
                      ['port', '港口'],
                      ['hub', '物流'],
                      ['factory', '产业 / 社会'],
                      ['farm', '农业'],
                      ['education', '教育'],
                      ['health', '医疗'],
                      ['housing', '住房'],
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
                )}
                <div className="facility-directory">
                  {shown.map((site) => (
                    <button
                      key={site.id}
                      data-official-facility={site.id}
                      onClick={() => {
                        focusSite(site.id);
                      }}
                    >
                      <FacilityIcon kind={site.kind} />
                      <span>
                        <strong>{placeName(site)}</strong>
                        <small>
                          {site.id} ·{' '}
                          {official && (
                            <ExactOfficialValue
                              data={official}
                              path={`/facilities/${site.sourceIndex}/record/estimatedCapacity`}
                            />
                          )}{' '}
                          {units[site.record.capacityUnit] ??
                            site.record.capacityUnit}
                        </small>
                      </span>
                      <b>↗</b>
                    </button>
                  ))}
                </div>
                {official && <OfficialCountryFacts data={official} />}
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
