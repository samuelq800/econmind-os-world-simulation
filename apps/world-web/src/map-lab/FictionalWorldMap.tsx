import { ScenarioPanel } from './ScenarioPanel.js';
import { useRef, useState } from 'react';
import {
  artwork,
  partition,
  maritime,
  layerDefinitions,
  mapViews,
  visibilityFor,
  resourceTypeById,
  type LayerId,
} from './display-layers.js';
import { LayerArtwork } from './LayerArtwork.js';
import './fictional-world-map.css';

const presets: { name: string; layers: LayerId[] }[] = [
  { name: '国家分配', layers: ['political'] },
  { name: '海域划分', layers: ['political', 'maritime'] },
  { name: '人文地理', layers: ['political', 'population'] },
  { name: '自然地理', layers: ['physical', 'climate', 'currents'] },
  { name: '贸易与资源', layers: ['trade', 'resources', 'infrastructure'] },
  { name: '全部图层', layers: layerDefinitions.map((layer) => layer.id) },
];
export function FictionalWorldMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(visibilityFor('political'));
  const [viewId, setViewId] = useState<string>('overview');
  const [box, setBox] = useState<readonly number[]>(mapViews[0].box);
  const [selected, setSelected] = useState(() => {
    const code = new URLSearchParams(window.location.search).get('country');
    return partition.territories.find((c) => c.number === code)?.id ?? '';
  });
  const [showLabels, setShowLabels] = useState(true);
  const [resourceGroup, setResourceGroup] = useState('首季地质资源');
  const [showRouteTable, setShowRouteTable] = useState(false);
  const activeLayers = layerDefinitions.filter((layer) => visible[layer.id]);
  const selectedIndex = artwork.political.countries.findIndex(
    (country) => country.id === selected,
  );
  const country = artwork.political.countries[selectedIndex];
  const localResources = artwork.resources.filter(
    (resource) => resource.countryId === selected,
  );
  const localFacilities = [...artwork.nodes, ...artwork.facilities].filter(
    (item) => item.countryId === selected,
  );
  const countryRoutes = artwork.routes.filter((route) =>
    localFacilities.some((f) => f.id === route.fromId || f.id === route.toId),
  );
  function zoom(factor: number) {
    const [x = 0, y = 0, width = 1774, height = 887] = box;
    const nextWidth = Math.min(1774, Math.max(220, width * factor));
    const nextHeight = Math.min(887, Math.max(110, height * factor));
    setBox([
      Math.max(0, Math.min(1774 - nextWidth, x + (width - nextWidth) / 2)),
      Math.max(0, Math.min(887 - nextHeight, y + (height - nextHeight) / 2)),
      nextWidth,
      nextHeight,
    ]);
    setViewId('custom');
  }
  function focusCountry() {
    if (selectedIndex < 0) return;
    const [x = 0, y = 0] = partition.territories[selectedIndex]!.label;
    setBox([
      Math.max(0, Math.min(1374, x - 200)),
      Math.max(0, Math.min(637, y - 125)),
      400,
      250,
    ]);
    setViewId('custom');
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return (
    <main className="atlas-workbench">
      <header className="atlas-header">
        <div>
          <p className="atlas-eyebrow">ASTERRA / WORLD V2</p>
          <h1>世界地图 · 地理与开局情景</h1>
          <a
            className="explorer-entry"
            href={`?atlas=explorer${selected ? `&country=${selected.slice(-2)}` : ''}`}
          >
            打开沉浸式地图 ↗
          </a>
          <p className="atlas-intro">
            从自然地理到国家分配，在同一张地图上查看。
          </p>
        </div>
        <div className="atlas-summary">
          <strong>
            70<span>国家区域</span>
          </strong>
          <strong>
            {layerDefinitions.length}
            <span>地图图层</span>
          </strong>
          <span className="draft-badge">规划草案</span>
        </div>
      </header>

      <section className="atlas-controls" aria-label="地图控制">
        <div className="preset-row">
          <span className="control-label">视图组合</span>
          {presets.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className={
                activeLayers.length === preset.layers.length &&
                preset.layers.every((id) => visible[id])
                  ? 'preset active'
                  : 'preset'
              }
              onClick={() => setVisible(visibilityFor(...preset.layers))}
            >
              {preset.name}
            </button>
          ))}
          <button
            className="quiet-button"
            onClick={() => setVisible(visibilityFor())}
            type="button"
          >
            仅看底图
          </button>
        </div>
        <div className="layer-grid" role="group" aria-label="地图图层">
          {layerDefinitions.map((layer, index) => (
            <button
              type="button"
              key={layer.id}
              aria-pressed={visible[layer.id]}
              className={`layer-button${visible[layer.id] ? ' active' : ''}`}
              onClick={() =>
                setVisible((current) => ({
                  ...current,
                  [layer.id]: !current[layer.id],
                }))
              }
              title={layer.summary}
            >
              <span className="layer-index" style={{ color: layer.color }}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span>{layer.name}</span>
              <span className="layer-check" aria-hidden="true">
                {visible[layer.id] ? '✓' : '+'}
              </span>
            </button>
          ))}
        </div>
        <div className="region-toolbar" role="group" aria-label="地图区域">
          <span className="control-label">查看区域</span>
          {mapViews.map((view) => (
            <button
              type="button"
              key={view.id}
              aria-pressed={viewId === view.id}
              className={
                viewId === view.id ? 'view-button active' : 'view-button'
              }
              onClick={() => {
                setViewId(view.id);
                setBox(view.box);
              }}
            >
              {view.name}
            </button>
          ))}
        </div>
      </section>

      {(visible.resources || visible.climate) && (
        <div className="ecology-toolbar">
          <span>
            {artwork.climates.length} 种气候 · 6 类首季地质资源 ·{' '}
            {artwork.seasonAlignment.geologicalSites} 个矿床候选点
          </span>
          {visible.resources && (
            <label>
              资源筛选{' '}
              <select
                aria-label="资源类别"
                value={resourceGroup}
                onChange={(event) => setResourceGroup(event.target.value)}
              >
                {['全部', '首季地质资源', '农业用地', '未启用背景'].map(
                  (group) => (
                    <option key={group}>{group}</option>
                  ),
                )}
              </select>
            </label>
          )}
          {visible.resources && (
            <small>
              {box[2]! >= 1200
                ? '全图数字为各国资源点数量，点击或放大查看具体资源。'
                : '局部显示具体资源；数量不代表储量。'}
            </small>
          )}
        </div>
      )}
      {visible.maritime && (
        <section className="maritime-notice">
          <strong>12 海里领海 · 200 海里专属经济区 · 公海</strong>
          <p>
            按最大宽度绘制。专属经济区不是领海；黄色斜纹为重叠待议范围。领海在全图中很窄，放大近岸可查看。
          </p>
          <details>
            <summary>基线假设与法律依据</summary>
            <ul>
              {maritime.assumptions.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <div>
              {maritime.sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.label}
                </a>
              ))}
            </div>
          </details>
        </section>
      )}
      {visible.physical && (
        <p className="area-note">
          新增河湖为水系规划示意；内陆湖保留所属国家管辖，不作为海洋基线。
        </p>
      )}
      {visible.infrastructure && (
        <p className="area-note">
          350 个候选设施点 ·
          依聚居与接入条件分布。全图“设”后数字为设施数量，放大查看位置；局部选中国家后仅显示该国的资源与设施。
        </p>
      )}
      <div className="map-topline">
        <span>
          {activeLayers.length
            ? activeLayers.map((layer) => layer.name).join(' / ')
            : '原始地形底图'}
        </span>
        <div className="map-tools">
          <label>
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(event) => setShowLabels(event.target.checked)}
            />
            文字标注
          </label>
          <button type="button" aria-label="放大地图" onClick={() => zoom(0.7)}>
            ＋
          </button>
          <button
            type="button"
            aria-label="缩小地图"
            onClick={() => zoom(1 / 0.7)}
          >
            −
          </button>
        </div>
      </div>
      <div className="atlas-map-frame" ref={mapRef}>
        <LayerArtwork
          visible={visible}
          box={box}
          selected={selected}
          onSelect={setSelected}
          showLabels={showLabels}
          detail={box[2]! < 1200}
          resourceGroup={resourceGroup}
        />
      </div>
      <div className="map-caption">
        <span>海岸贴合底图 · 各图层统一坐标</span>
        <span>国界线 / 沿岸岛屿 / 01–70 编号</span>
      </div>

      <div className="atlas-bottom-grid">
        <section
          className="atlas-card layer-legends"
          aria-labelledby="legend-title"
        >
          <div className="card-heading">
            <h2 id="legend-title">当前图例</h2>
            <span>{activeLayers.length} 层已开启</span>
          </div>
          {activeLayers.length === 0 ? (
            <p className="muted-copy">点击上方图层，查看对应信息。</p>
          ) : (
            activeLayers.map((layer) => (
              <div key={layer.id} className="legend-group">
                <h3>
                  {layer.name}
                  <span>{layer.summary}</span>
                </h3>
                <div className="legend-items">
                  {layer.legend.map(([color, name]) => (
                    <span key={name}>
                      <i style={{ background: color }} />
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
        <section
          className="atlas-card country-card"
          aria-labelledby="country-title"
        >
          <div className="card-heading">
            <h2 id="country-title">国家分配工作区</h2>
            <span>待分配</span>
          </div>
          <label className="select-label" htmlFor="territory-select">
            选择国家区域
          </label>
          <div className="country-select-row">
            <select
              id="territory-select"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">选择编号或名称</option>
              {artwork.political.countries.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.number} · {item.name}
                </option>
              ))}
            </select>
            <button type="button" disabled={!selected} onClick={focusCountry}>
              定位
            </button>
          </div>
          <ScenarioPanel selected={selected} />
          <div aria-live="polite">
            {country ? (
              <>
                <h3 className="selected-name">
                  <span>{country.number}</span>
                  {country.name}
                </h3>
                <dl className="country-facts">
                  <div>
                    <dt>主要气候</dt>
                    <dd>
                      {
                        artwork.climates.find((c) => c.id === country.climateId)
                          ?.name
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>区内气候</dt>
                    <dd>
                      {country.climateMix
                        .filter((mix) => mix.sharePercent >= 3)
                        .map(
                          (mix) =>
                            `${artwork.climates.find((c) => c.id === mix.id)?.name} ${mix.sharePercent}%`,
                        )
                        .join('、')}
                      <small className="area-note">图上陆地面积占比</small>
                    </dd>
                  </div>
                  <div>
                    <dt>海域条件</dt>
                    <dd>
                      {maritime.countries.find((c) => c.id === selected)
                        ?.coastal
                        ? '沿海国家：可查看领海与专属经济区候选范围，重叠部分待划界。'
                        : '内陆国家：无本国海岸产生的领海或专属经济区。'}
                    </dd>
                  </div>
                  <div>
                    <dt>资源分布</dt>
                    <dd>
                      <strong>
                        {localResources.length} 个点 ·{' '}
                        {new Set(localResources.map((r) => r.kind)).size} 类
                      </strong>
                      <br />
                      {[...new Set(localResources.map((r) => r.kind))]
                        .map(
                          (kind) =>
                            `${resourceTypeById.get(kind)?.name}${resourceTypeById.get(kind)?.group === '未启用背景' ? '（未启用背景）' : ''} ×${localResources.filter((r) => r.kind === kind).length}`,
                        )
                        .join('、')}
                    </dd>
                  </div>
                  <div>
                    <dt>设施规划</dt>
                    <dd>
                      {localFacilities.length} 个设施：
                      {localFacilities
                        .map((f) => f.name.replace('（规划）', ''))
                        .join('、') || '尚未设置设施点'}
                    </dd>
                  </div>
                  <div>
                    <dt>陆上邻区</dt>
                    <dd>
                      {country.neighbours
                        .map((id) => id.slice(-2))
                        .join(' / ') || '无陆上接壤区域'}
                    </dd>
                  </div>
                  <div>
                    <dt>接入通道</dt>
                    <dd>
                      {countryRoutes.length
                        ? `${countryRoutes.length} 条规划通道`
                        : '尚未设置通道节点'}
                    </dd>
                  </div>
                </dl>
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => setSelected('')}
                >
                  取消选中
                </button>
              </>
            ) : (
              <p className="empty-country">
                点击国家区域，或按编号选择。
                <br />
                这里会显示该区域的气候、资源、设施和邻区，方便下一步分配。
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="atlas-card route-card">
        <button
          className="route-disclosure"
          aria-expanded={showRouteTable}
          onClick={() => setShowRouteTable(!showRouteTable)}
          type="button"
        >
          <span>
            规划交通网络{' '}
            <small>
              {artwork.routes.filter((r) => r.mode === 'land').length} 条陆路 ·{' '}
              {artwork.routes.filter((r) => r.mode === 'sea').length} 条海运 ·{' '}
              {artwork.nodes.filter((n) => n.kind === 'port').length} 个港口
            </small>
          </span>
          <span>{showRouteTable ? '收起 −' : '展开 ＋'}</span>
        </button>
        {showRouteTable && (
          <div className="route-table-wrap">
            <table>
              <caption>距离为虚构地图比例下沿所绘路径的测量值。</caption>
              <thead>
                <tr>
                  <th>编号</th>
                  <th>类型</th>
                  <th>节点连接</th>
                  <th>图上距离</th>
                </tr>
              </thead>
              <tbody>
                {artwork.routes.map((route) => (
                  <tr key={route.id}>
                    <td>{route.id}</td>
                    <td>{route.mode === 'sea' ? '海运' : '陆路'}</td>
                    <td>{route.name}</td>
                    <td>{route.distanceKm.toLocaleString()} km</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <footer className="atlas-footer">
        气候、洋流、资源、路线与设施均为虚构世界的规划示意。已补充可复现的地理与人文情景估值；正式经济体、配方与运行状态尚未启用。
      </footer>
    </main>
  );
}
