import { useEffect, useMemo, useState } from 'react';
import {
  createOfficialExplorerCountryLoader,
  type OfficialExplorerCountry,
  type OfficialExplorerCountryLoadState,
} from '../official-data/official-explorer-country.js';
import {
  ExactOfficialValue,
  OfficialSourceDetails,
} from '../official-data/OfficialSourceValue.js';
import {
  applyPreviewLocale,
  readPreviewLocale,
  subscribePreviewLocale,
  type PreviewLocale,
} from '../world-preview/locale.js';
import './country-opening-facts.css';

const labels = {
  en: {
    title: 'Opening dossier',
    static: 'Static opening data · Not live World State',
    population: 'Population · people',
    resources: 'Resource points',
    facilities: 'Facility records',
    regions: 'Economic regions',
    overview: 'Overview',
    resourceTab: 'Resources',
    facilityTab: 'Facilities',
    regionTab: 'Regions',
    labour: 'Labour force · people',
    area: 'Land area',
    unavailable: 'Source field unavailable',
    resourceNote:
      'Resource points are records, not reserve quantities or production.',
    facilityNote:
      'Source records include development options. A record is not an operating facility.',
    geology: 'Remaining geological stock',
    recoverable: 'Recoverable stock',
    developed: 'Developed stock · conditional',
    record: 'Source record',
    source: 'Selected package',
    country: 'Country',
    units: 'Original source units · Not extracted output',
    people: 'Population',
    elevation: 'Mean elevation',
    temperature: 'Temperature',
    rain: 'Annual rainfall',
    loading: 'Reading this country’s opening data…',
    error: 'Opening data unavailable. No previous country values are shown.',
    retry: 'Retry source read',
    countNote: 'Counts follow the verified country source.',
    fullMap: 'Open country & facility map ↗',
    sourceNames: 'Source names and identifiers are retained in the record.',
    empty: 'No resource points in this selected country source.',
    navigation: 'Opening data sections',
    language: 'Dossier language',
    other: 'Other public opening records',
    employment: 'Employment allocation proposal',
    unemployment: 'Unemployment allocation proposal',
    foodProduction: 'Food production reference',
    foodDemand: 'Food demand reference',
    foodStock: 'Opening food stock',
    initialGeology: 'Initial geological stock',
    discovered: 'Discovered remaining stock',
    capacity: 'Extraction capacity proposal',
    extraction: 'Source extraction field · Not live',
    depth: 'Depth',
    cropland: 'Cropland',
    grain: 'Grain production reference',
    water: 'Allocatable water reference',
    dryWater: 'Dry-season water reference',
    solar: 'Solar conditions',
    wind: 'Wind speed',
    monthlyRain: 'Monthly rainfall · source units',
  },
  zh: {
    title: '开局国情',
    static: '静态开局资料 · 非实时 World State',
    population: '人口 · 人',
    resources: '资源点',
    facilities: '设施记录',
    regions: '经济区域',
    overview: '概览',
    resourceTab: '资源',
    facilityTab: '设施',
    regionTab: '区域',
    labour: '劳动力 · 人',
    area: '国土面积',
    unavailable: '源字段未提供',
    resourceNote: '资源点是来源记录，不是储量数量或已执行产量。',
    facilityNote: '设施记录包含开发选项；记录存在不等于已投运。',
    geology: '剩余地质储量',
    recoverable: '可采剩余',
    developed: '已开发剩余 · 有条件',
    record: '来源记录',
    source: '选定数据包',
    country: '国家',
    units: '保留来源单位 · 非已开采产出',
    people: '人口',
    elevation: '平均海拔',
    temperature: '温度',
    rain: '年降水',
    loading: '正在读取本国开局资料…',
    error: '开局资料暂不可用，不显示前一国家的数值。',
    retry: '重新读取来源',
    countNote: '数量依据已核验的本国来源记录。',
    fullMap: '查看国家与设施地图 ↗',
    sourceNames: '来源原名称和标识保留于记录中。',
    empty: '此国选定来源没有资源点记录。',
    navigation: '开局资料栏目',
    language: '资料语言',
    other: '其他公开开局记录',
    employment: '就业分配提案',
    unemployment: '未就业分配提案',
    foodProduction: '粮食产出参考',
    foodDemand: '粮食需求参考',
    foodStock: '粮食开局库存',
    initialGeology: '初始地质储量',
    discovered: '已发现剩余',
    capacity: '开采能力提案',
    extraction: '来源开采量字段 · 非实时',
    depth: '埋深',
    cropland: '耕地',
    grain: '粮食产出参考',
    water: '可分配水参考',
    dryWater: '旱季水参考',
    solar: '太阳能条件',
    wind: '风速',
    monthlyRain: '月降水 · 来源单位',
  },
} as const;
const resourceNames: Readonly<Record<string, readonly [string, string]>> = {
  iron: ['Iron ore', '铁矿石'],
  copper: ['Copper', '铜'],
  oil: ['Crude oil', '原油'],
  gas: ['Natural gas', '天然气'],
  lithium: ['Lithium', '锂'],
  uranium: ['Uranium', '铀'],
};
const facilityNames: Readonly<Record<string, readonly [string, string]>> = {
  mine: ['Mining', '矿业'],
  energy: ['Energy', '能源'],
  farm: ['Agriculture', '农业'],
  port: ['Ports', '港口'],
  hub: ['Logistics', '物流'],
  factory: ['Industry', '产业'],
  education: ['Education', '教育'],
  health: ['Healthcare', '医疗'],
  housing: ['Housing', '住房'],
};
export function openingRecordGroups(records: readonly { kind: string }[]) {
  const groups = new Map<string, number>();
  for (const record of records)
    groups.set(record.kind, (groups.get(record.kind) ?? 0) + 1);
  return [...groups].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
export function openingPublicPaths(data: OfficialExplorerCountry) {
  return [
    '/profile/population',
    '/profile/labourForce',
    ...[
      'scenarioEmployed',
      'scenarioUnemployed',
      'foodProductionTonnesDay',
      'foodDemandTonnesDay',
      'foodAvailableStockTonnes',
    ].map((key) => `/profile/${key}`),
    '/areaKm2',
    ...data.resources.flatMap((_, i) =>
      [
        'initialGeological',
        'remainingGeological',
        'discoveredRemaining',
        'recoverableRemaining',
        'developedRemaining',
        'extractionCapacityPerDay',
        'runtimeExtractionPerDay',
        'depthM',
      ].map((key) => `/resources/${i}/deposit/${key}`),
    ),
    ...data.regions.flatMap((_, i) => [
      `/regions/${i}/areaKm2`,
      `/regions/${i}/initial/population`,
      `/regions/${i}/initial/croplandHa`,
      `/regions/${i}/initial/grainTonnesDay`,
      ...[
        'meanElevationM',
        'temperatureC',
        'annualRainMm',
        'allocatableWaterM3Day',
        'drySeasonWaterM3Day',
        'solarKwhM2Day',
        'windMps',
      ].map((key) => `/regions/${i}/natural/${key}`),
      ...Array.from(
        { length: 12 },
        (_, month) => `/regions/${i}/natural/monthlyRainMm/${month}`,
      ),
    ]),
  ];
}

/** Only a display consumer of the existing verified source. No whole profile enumeration. */
export function CountryOpeningFacts({
  data,
  locale: selectedLocale,
  onLocaleChange,
  showMapLink = false,
}: {
  data: OfficialExplorerCountry;
  locale?: PreviewLocale;
  onLocaleChange?: (locale: PreviewLocale) => void;
  showMapLink?: boolean;
}) {
  const [storedLocale, setStoredLocale] = useState(readPreviewLocale);
  useEffect(
    () => subscribePreviewLocale(() => setStoredLocale(readPreviewLocale())),
    [],
  );
  const locale = selectedLocale ?? storedLocale;
  const t = labels[locale];
  const [active, setActive] = useState('overview');
  const name = (kind: string, dictionary: typeof resourceNames) =>
    dictionary[kind]?.[locale === 'en' ? 0 : 1] ?? kind;
  const exact = (path: string, showUnit = false) => (
    <ExactOfficialValue
      data={data}
      path={path}
      locale={locale}
      showUnit={showUnit}
    />
  );
  const metric = (label: string, path: string) => (
    <div key={path}>
      <dt>{label}</dt>
      <dd>{exact(path, true)}</dd>
    </div>
  );
  const resourceGroups = openingRecordGroups(data.resources);
  const changeLanguage = (next: PreviewLocale) => {
    if (onLocaleChange) onLocaleChange(next);
    else {
      applyPreviewLocale(next);
      setStoredLocale(next);
    }
  };
  return (
    <section
      className="opening-facts"
      data-opening-country={data.number}
      aria-label={t.title}
    >
      <header className="opening-facts-heading">
        <span>{t.title}</span>
        <div role="group" aria-label={t.language}>
          {(['en', 'zh'] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={locale === l}
              onClick={() => changeLanguage(l)}
            >
              {l === 'en' ? 'EN' : '中文'}
            </button>
          ))}
        </div>
      </header>
      <dl className="opening-summary" aria-label={t.overview}>
        <div>
          <dt>{t.population}</dt>
          <dd>{exact('/profile/population')}</dd>
        </div>
        <div>
          <dt>{t.resources}</dt>
          <dd data-opening-count="resources">{data.resources.length}</dd>
        </div>
        <div>
          <dt>{t.facilities}</dt>
          <dd data-opening-count="facilities">{data.facilities.length}</dd>
        </div>
        <div>
          <dt>{t.regions}</dt>
          <dd data-opening-count="regions">{data.regions.length}</dd>
        </div>
      </dl>
      <p className="opening-source-badge">
        <b>STATIC BASELINE</b> {t.static}
        <span className="opening-package">{data.source.packageId}</span>
      </p>
      <nav className="opening-section-nav" aria-label={t.navigation}>
        {(['overview', 'resources', 'facilities', 'regions'] as const).map(
          (key) => (
            <button
              key={key}
              type="button"
              aria-current={active === key ? 'true' : undefined}
              aria-controls={`opening-${data.number}-${key}`}
              onClick={() => setActive(key)}
            >
              {
                {
                  overview: t.overview,
                  resources: t.resourceTab,
                  facilities: t.facilityTab,
                  regions: t.regionTab,
                }[key]
              }
            </button>
          ),
        )}
      </nav>
      <div className="opening-section-content">
        <div
          id={`opening-${data.number}-overview`}
          hidden={active !== 'overview'}
        >
          <dl className="opening-metrics">
            {metric(t.labour, '/profile/labourForce')}
            {metric(t.area, '/areaKm2')}
          </dl>
          <h3>{t.resourceTab}</h3>
          <div className="opening-kind-list">
            {resourceGroups.map(([kind, count]) => (
              <button
                type="button"
                key={kind}
                onClick={() => setActive('resources')}
              >
                {name(kind, resourceNames)} <b>{count}</b>
              </button>
            ))}
          </div>
          {data.resources.length === 0 && <p>{t.empty}</p>}
          <p>{t.resourceNote}</p>
          <p>{t.facilityNote}</p>
          <details className="opening-record">
            <summary>{t.other}</summary>
            <dl className="opening-metrics">
              {metric(t.employment, '/profile/scenarioEmployed')}
              {metric(t.unemployment, '/profile/scenarioUnemployed')}
              {metric(t.foodProduction, '/profile/foodProductionTonnesDay')}
              {metric(t.foodDemand, '/profile/foodDemandTonnesDay')}
              {metric(t.foodStock, '/profile/foodAvailableStockTonnes')}
            </dl>
          </details>
        </div>
        <div
          id={`opening-${data.number}-resources`}
          hidden={active !== 'resources'}
        >
          <p>{t.units}</p>
          {data.resources.length === 0 && <p>{t.empty}</p>}
          {data.resources.map((resource, index) => (
            <details
              className="opening-record"
              key={resource.id}
              data-resource-id={resource.id}
            >
              <summary>
                {name(resource.kind, resourceNames)}{' '}
                <small>{resource.id}</small>
              </summary>
              <p>
                {t.record}: {resource.type.name} · {resource.commodityId}
              </p>
              <dl className="opening-metrics">
                {metric(
                  t.initialGeology,
                  `/resources/${index}/deposit/initialGeological`,
                )}
                {metric(
                  t.geology,
                  `/resources/${index}/deposit/remainingGeological`,
                )}
                {metric(
                  t.recoverable,
                  `/resources/${index}/deposit/recoverableRemaining`,
                )}
                {metric(
                  t.discovered,
                  `/resources/${index}/deposit/discoveredRemaining`,
                )}
                {metric(
                  t.developed,
                  `/resources/${index}/deposit/developedRemaining`,
                )}
                {metric(
                  t.capacity,
                  `/resources/${index}/deposit/extractionCapacityPerDay`,
                )}
                {metric(
                  t.extraction,
                  `/resources/${index}/deposit/runtimeExtractionPerDay`,
                )}
                {metric(t.depth, `/resources/${index}/deposit/depthM`)}
              </dl>
            </details>
          ))}
          <p>{t.resourceNote}</p>
        </div>
        <div
          id={`opening-${data.number}-facilities`}
          hidden={active !== 'facilities'}
        >
          <dl className="opening-metrics">
            {openingRecordGroups(data.facilities).map(([kind, count]) => (
              <div key={kind}>
                <dt>{name(kind, facilityNames)}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
          <p>{t.facilityNote}</p>
          <p>{t.countNote}</p>
        </div>
        <div
          id={`opening-${data.number}-regions`}
          hidden={active !== 'regions'}
        >
          {data.regions.map((region, index) => (
            <details
              className="opening-record"
              key={region.id}
              data-region-id={region.id}
            >
              <summary>{region.id}</summary>
              <dl className="opening-metrics">
                {metric(t.area, `/regions/${index}/areaKm2`)}
                {metric(t.people, `/regions/${index}/initial/population`)}
                {metric(t.cropland, `/regions/${index}/initial/croplandHa`)}
                {metric(t.grain, `/regions/${index}/initial/grainTonnesDay`)}
                {metric(
                  t.elevation,
                  `/regions/${index}/natural/meanElevationM`,
                )}
                {metric(
                  t.temperature,
                  `/regions/${index}/natural/temperatureC`,
                )}
                {metric(t.rain, `/regions/${index}/natural/annualRainMm`)}
                {metric(
                  t.water,
                  `/regions/${index}/natural/allocatableWaterM3Day`,
                )}
                {metric(
                  t.dryWater,
                  `/regions/${index}/natural/drySeasonWaterM3Day`,
                )}
                {metric(t.solar, `/regions/${index}/natural/solarKwhM2Day`)}
                {metric(t.wind, `/regions/${index}/natural/windMps`)}
              </dl>
              <p>
                {t.monthlyRain}:{' '}
                {Array.from({ length: 12 }, (_, month) => (
                  <span key={month}>
                    {month > 0 ? ' / ' : ''}
                    {exact(`/regions/${index}/natural/monthlyRainMm/${month}`)}
                  </span>
                ))}
              </p>
            </details>
          ))}
        </div>
      </div>
      <footer className="opening-provenance">
        <OfficialSourceDetails
          data={data}
          paths={openingPublicPaths(data)}
          locale={locale}
        />
        {showMapLink && (
          <a
            className="opening-map-link"
            href={`?atlas=explorer&country=${data.number}`}
          >
            {t.fullMap}
          </a>
        )}
      </footer>
    </section>
  );
}

/** Same abort/matching-identity boundary as Explorer, without importing its maps. */
export function requestOpeningFacts(
  reference: string,
  loader: ReturnType<typeof createOfficialExplorerCountryLoader>,
  publish: (state: OfficialExplorerCountryLoadState) => void,
) {
  const abort = new AbortController();
  let active = true;
  publish({ kind: 'loading' });
  void loader.load(reference, { signal: abort.signal }).then(
    (state) => {
      if (!active) return;
      publish(
        state.kind === 'ready' &&
          (state.data.number !== reference ||
            state.data.id !== `visual-territory-${reference}`)
          ? { kind: 'error', reason: 'SOURCE_INVALID' }
          : state,
      );
    },
    () => {
      if (active) publish({ kind: 'error', reason: 'SOURCE_UNAVAILABLE' });
    },
  );
  return () => {
    active = false;
    abort.abort();
  };
}
export function CountryOpeningFactsLoader({
  reference,
  locale,
  onLocaleChange,
}: {
  reference: string;
  locale: PreviewLocale;
  onLocaleChange: (locale: PreviewLocale) => void;
}) {
  const loader = useMemo(() => createOfficialExplorerCountryLoader(), []);
  const [binding, setBinding] = useState<{
    reference: string;
    state: OfficialExplorerCountryLoadState;
  }>({ reference: '', state: { kind: 'idle' } });
  const [attempt, setAttempt] = useState(0);
  useEffect(
    () =>
      requestOpeningFacts(reference, loader, (state) =>
        setBinding({ reference, state }),
      ),
    [reference, loader, attempt],
  );
  const state =
    binding.reference === reference
      ? binding.state
      : { kind: 'loading' as const };
  if (state.kind === 'ready' && state.data.number === reference)
    return (
      <CountryOpeningFacts
        key={reference}
        data={state.data}
        locale={locale}
        onLocaleChange={onLocaleChange}
        showMapLink
      />
    );
  const loading = state.kind === 'loading' || state.kind === 'idle';
  return (
    <section className="opening-facts" data-opening-state={state.kind}>
      <p role={loading ? 'status' : 'alert'}>
        {loading ? labels[locale].loading : labels[locale].error}
      </p>
      {!loading && (
        <button type="button" onClick={() => setAttempt((v) => v + 1)}>
          {labels[locale].retry}
        </button>
      )}
    </section>
  );
}
