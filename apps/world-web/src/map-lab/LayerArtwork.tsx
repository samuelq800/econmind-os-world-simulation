import scenario from './geographic-scenario.json';
import terrainUrl from '../assets/asterra-satellite-terrain-v8.png';
import {
  artwork,
  partition,
  maritime,
  resourceTypeById,
  type LayerVisibility,
} from './display-layers.js';

const facilityColors: Record<string, string> = {
  port: '#9ce5ea',
  hub: '#e9d294',
  mine: '#c2a5d6',
  farm: '#bbd88b',
  energy: '#edb78b',
  factory: '#b2c6df',
};
function FacilitySymbol({ kind }: { kind: string }) {
  switch (kind) {
    case 'port':
      return (
        <path d="M0 -8V8M-7 1V4Q0 13 7 4V1M-4 -4H4M-2 -8A2 2 0 1 0 2 -8" />
      );
    case 'hub':
      return <path d="M-7 -4L0 -8L7 -4V5L0 9L-7 5ZM-7 -4L0 0L7 -4M0 0V9" />;
    case 'mine':
      return <path d="M-8 -5Q0 -10 8 -2M2 -5L-6 8M-8 8L-4 10" />;
    case 'farm':
      return (
        <path d="M0 9V-8M0 4Q-8 3 -6 -2Q0 -2 0 4M0 -1Q8 -2 6 -7Q0 -6 0 -1" />
      );
    case 'energy':
      return <path d="M2 -9L-6 2H0L-2 9L7 -3H1Z" />;
    default:
      return <path d="M-8 8V-2L-2 -5V-1L4 -5V8ZM5 8V-9H9V8M-4 3V5M1 3V5" />;
  }
}
function CurrentArrows({ points, kind }: { points: number[][]; kind: string }) {
  return (
    <>
      {[0.28, 0.63].map((fraction) => {
        const i = Math.max(
          1,
          Math.min(points.length - 2, Math.floor(points.length * fraction)),
        );
        const p = points[i]!;
        const before = points[Math.max(0, i - 2)]!;
        const after = points[Math.min(points.length - 1, i + 2)]!;
        const angle =
          (Math.atan2(after[1]! - before[1]!, after[0]! - before[0]!) * 180) /
          Math.PI;
        return (
          <path
            key={fraction}
            className={`current-arrow ${kind}`}
            d="M-7 -5L5 0L-7 5"
            transform={`translate(${p[0]} ${p[1]}) rotate(${angle})`}
          />
        );
      })}
    </>
  );
}
export function LayerArtwork({
  visible,
  box,
  selected,
  onSelect,
  showLabels,
  detail,
  resourceGroup,
}: {
  visible: LayerVisibility;
  box: readonly number[];
  selected: string;
  onSelect: (id: string) => void;
  showLabels: boolean;
  detail: boolean;
  resourceGroup: string;
}) {
  const shownResources = artwork.resources.filter(
    (resource) =>
      resourceGroup === '全部' ||
      resourceTypeById.get(resource.kind)?.group === resourceGroup,
  );
  const selectedSea = maritime.countries.find(
    (country) => country.id === selected,
  );
  const active = Object.values(visible).filter(Boolean).length;
  const countryLabels = showLabels && visible.political && active === 1;
  const thematicLabels = showLabels && active <= 3;
  const infrastructure = [...artwork.nodes, ...artwork.facilities];
  const selectedIndex = artwork.political.countries.findIndex(
    (country) => country.id === selected,
  );
  return (
    <svg
      className="atlas-map"
      viewBox={box.join(' ')}
      role="img"
      aria-label="Asterra 地理与人文规划地图"
    >
      <defs>
        <pattern
          id="maritime-overlap-hatch"
          patternUnits="userSpaceOnUse"
          width="7"
          height="7"
          patternTransform="rotate(35)"
        >
          <path d="M0 0V7" stroke="#f2c773" strokeWidth="2" />
        </pattern>
        <clipPath id="atlas-land-clip">
          <path d={partition.coastPath} clipRule="evenodd" />
        </clipPath>
        <marker
          id="current-warm-tip"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0 0L10 5L0 10Z" fill="#fcaa7d" />
        </marker>
        <marker
          id="current-cold-tip"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0 0L10 5L0 10Z" fill="#73caed" />
        </marker>
        <pattern
          id="ridge-marks"
          patternUnits="userSpaceOnUse"
          width="10"
          height="10"
        >
          <path
            d="M0 9L5 1L10 9"
            fill="none"
            stroke="#e1d3b6"
            strokeWidth="1.5"
          />
        </pattern>
      </defs>
      <image
        href={terrainUrl}
        width={partition.width}
        height={partition.height}
        className={`terrain-base${visible.climate ? ' climate-base' : ''}`}
      />
      {visible.maritime && (
        <g data-layer="maritime" className="maritime-layer">
          <path
            d={maritime.highSeasPath}
            fill="#153e6a"
            fillOpacity="0.5"
            fillRule="evenodd"
          >
            <title>公海（水体）：候选专属经济区外的海域</title>
          </path>
          <path
            d={maritime.eezPath}
            fill="#429cd0"
            fillOpacity="0.48"
            fillRule="evenodd"
            className="eez-outline"
          >
            <title>
              专属经济区候选范围：距基线不超过 200 海里，重叠部分待协商
            </title>
          </path>
          <path
            d={maritime.territorialPath}
            fill="#7de0d6"
            fillOpacity="0.85"
            fillRule="evenodd"
            className="territorial-outline"
          >
            <title>领海候选范围：距基线不超过 12 海里</title>
          </path>
          <path
            d={maritime.overlapPath}
            fill="url(#maritime-overlap-hatch)"
            fillRule="evenodd"
          >
            <title>海域权利范围重叠：待协商划界</title>
          </path>
          {selectedSea && (
            <>
              <path
                className="selected-eez"
                d={selectedSea.eezCandidatePath}
                fillRule="evenodd"
              />
              <path
                className="selected-territorial"
                d={selectedSea.territorialCandidatePath}
                fillRule="evenodd"
              />
            </>
          )}
          {showLabels && !detail && (
            <text x="1060" y="214" className="map-text high-seas-label">
              公 海
            </text>
          )}
        </g>
      )}
      {visible.political && (
        <g
          data-layer="political-fill"
          className={
            visible.climate ? 'country-colors muted' : 'country-colors'
          }
        >
          {partition.territories.map((region, index) => (
            <path
              key={region.id}
              d={region.path}
              fillRule="evenodd"
              fill={artwork.political.countries[index]!.color}
              onClick={() => onSelect(region.id)}
            >
              <title>
                {region.number} · {artwork.political.countries[index]!.name}
              </title>
            </path>
          ))}
        </g>
      )}
      {visible.climate && (
        <g
          data-layer="climate"
          className="climate-zones"
          clipPath="url(#atlas-land-clip)"
        >
          {artwork.climates.map((zone) => (
            <path
              key={zone.id}
              d={zone.path}
              fill={zone.color}
              fillRule="evenodd"
            >
              <title>{zone.name} · 气候规划示意</title>
            </path>
          ))}
        </g>
      )}
      {visible.population && (
        <g data-layer="population">
          {scenario.regions.map((r) => {
            const density = r.initial.population / r.areaKm2;
            const color =
              density > 120 ? '#bd573e' : density > 45 ? '#d99757' : '#ead99d';
            return (
              <g key={r.id} onClick={() => onSelect(r.countryId)}>
                <path
                  d={r.path}
                  fill={color}
                  fillOpacity="0.58"
                  stroke="#ffe4b7"
                  strokeWidth="0.35"
                >
                  <title>
                    {r.humanGeography.settlementType} · {Math.round(density)}{' '}
                    人/km² · 情景估计
                  </title>
                </path>
                {detail && (
                  <text className="map-text" x={r.label[0]} y={r.label[1]}>
                    {(r.initial.population / 10000).toFixed(0)}万人
                  </text>
                )}
              </g>
            );
          })}
        </g>
      )}
      <path className="coast-outline" d={partition.coastPath} />
      {visible.political && (
        <g
          data-layer="political"
          className={active > 1 ? 'borders contextual' : 'borders'}
        >
          <path className="border-halo" d={artwork.political.sharedBorders} />
          <path className="border-line" d={artwork.political.sharedBorders} />
        </g>
      )}
      {visible.physical && (
        <g data-layer="physical" className="physical-layer">
          {artwork.physical.map((feature) => (
            <g key={feature.id}>
              <path
                className={`physical-line ${feature.kind}`}
                d={feature.path}
              >
                <title>{feature.name}</title>
              </path>
              {thematicLabels && (!feature.id.startsWith('H') || detail) && (
                <text
                  className={`map-text physical-name ${feature.kind}`}
                  x={feature.label[0]}
                  y={feature.label[1]}
                >
                  {feature.name}
                </text>
              )}
            </g>
          ))}
        </g>
      )}
      {selected && (
        <g
          data-layer="economic-regions"
          fill="none"
          stroke="#f3dbaa"
          strokeWidth="0.7"
          strokeDasharray="4 4"
          pointerEvents="none"
        >
          {scenario.regions
            .filter((r) => r.countryId === selected)
            .map((r) => (
              <path key={r.id} d={r.path}>
                <title>{r.id} · 经济区域</title>
              </path>
            ))}
        </g>
      )}
      {visible.trade && selected && (
        <g
          data-layer="survey-access"
          fill="none"
          stroke="#c08fc4"
          strokeWidth="1"
          strokeDasharray="3 5"
        >
          {scenario.freight
            .filter((r) => r.countryIds.includes(selected))
            .map((r) => (
              <path key={r.id} d={r.path}>
                <title>
                  待勘测通道 · {r.distanceKm} km ·{' '}
                  {r.requiresPortOrFerry ? '需港口或渡运' : '需建设与许可'}
                  ，未投运
                </title>
              </path>
            ))}
        </g>
      )}
      {visible.currents && (
        <g data-layer="currents" className="current-layer">
          {artwork.currents.map((current) => (
            <g key={current.id}>
              <path
                className={`current-line ${current.kind}`}
                d={current.path}
                markerEnd={`url(#current-${current.kind}-tip)`}
              >
                <title>{current.name} · 示意方向</title>
              </path>
              <CurrentArrows points={current.points} kind={current.kind} />
              {thematicLabels && (
                <text
                  className="map-text current-name"
                  x={
                    current.points[Math.floor(current.points.length * 0.4)]![0]
                  }
                  y={
                    current.points[
                      Math.floor(current.points.length * 0.4)
                    ]![1]! - 13
                  }
                >
                  {current.name}
                </text>
              )}
            </g>
          ))}
        </g>
      )}
      {visible.trade && (
        <g data-layer="trade" className="trade-layer">
          {artwork.routes.map((route) => (
            <g key={route.id}>
              <path className="route-halo" d={route.path} />
              <path className={`route-line ${route.mode}`} d={route.path}>
                <title>
                  {route.name} · {route.mode === 'sea' ? '海运' : '陆路'} ·
                  图上路径约 {route.distanceKm.toLocaleString()} km
                </title>
              </path>
            </g>
          ))}
          {artwork.nodes.map((node) => (
            <circle
              className={`route-node ${node.kind}`}
              key={node.id}
              cx={node.point[0]}
              cy={node.point[1]}
              r={node.kind === 'port' ? 4 : 3}
            >
              <title>{node.name}</title>
            </circle>
          ))}
        </g>
      )}
      {visible.resources && (
        <g data-layer="resources" className="resource-layer">
          {!detail
            ? partition.territories.map((region, index) => {
                const local = shownResources.filter(
                  (r) => r.countryId === region.id,
                );
                return local.length ? (
                  <g
                    key={region.id}
                    className="resource-cluster"
                    transform={`translate(${region.label.join(' ')})`}
                    onClick={() => onSelect(region.id)}
                  >
                    <circle r="15" fill="#182b30" stroke="#e0c683" />
                    <text className="resource-symbol" fill="#f4dc9f" y="1">
                      {local.length}
                    </text>
                    <title>
                      {region.number} ·{' '}
                      {artwork.political.countries[index]!.name}：{local.length}{' '}
                      个资源点，{new Set(local.map((r) => r.kind)).size} 类资源
                    </title>
                  </g>
                ) : null;
              })
            : shownResources
                .filter((r) => !selected || r.countryId === selected)
                .map((resource) => {
                  const kind = resourceTypeById.get(resource.kind)!;
                  return (
                    <g
                      key={resource.id}
                      transform={`translate(${resource.point.join(' ')})`}
                    >
                      <circle r="12" fill="#132732" stroke={kind.color} />
                      <text fill={kind.color} className="resource-symbol" y="1">
                        {kind.symbol}
                      </text>
                      <title>
                        {kind.name} · {resource.countryId.slice(-2)} 号区域 ·{' '}
                        {kind.context}（规划示意）
                      </title>
                    </g>
                  );
                })}
        </g>
      )}
      {visible.infrastructure && (
        <g data-layer="infrastructure" className="infrastructure-layer">
          {!detail
            ? partition.territories.map((region) => {
                const count = infrastructure.filter(
                  (item) => item.countryId === region.id,
                ).length;
                return (
                  <g
                    key={region.id}
                    className="resource-cluster"
                    transform={`translate(${region.label[0]} ${region.label[1]! + (visible.resources ? 32 : 0)})`}
                    onClick={() => onSelect(region.id)}
                  >
                    <rect
                      x="-18"
                      y="-12"
                      width="36"
                      height="24"
                      rx="5"
                      fill="#10232e"
                      stroke="#a4d9e2"
                    />
                    <text className="resource-symbol" fill="#b7edf1" y="1">
                      设{count}
                    </text>
                    <title>
                      {region.number} 号国家 · {count} 个基础设施点，放大查看
                    </title>
                  </g>
                );
              })
            : infrastructure
                .filter((i) => !selected || i.countryId === selected)
                .map((item) => (
                  <g
                    key={item.id}
                    transform={`translate(${item.point.join(' ')})`}
                  >
                    {/* Resource-linked facilities use an offset badge when both layers show. */}
                    {visible.resources &&
                    'resourceId' in item &&
                    item.resourceId ? (
                      <path d="M0 0L19 -17" className="facility-leader" />
                    ) : null}
                    <g
                      transform={
                        visible.resources &&
                        'resourceId' in item &&
                        item.resourceId
                          ? 'translate(19 -17)'
                          : undefined
                      }
                    >
                      <rect
                        x="-12"
                        y="-12"
                        width="24"
                        height="24"
                        rx="5"
                        fill="#10232e"
                        stroke={facilityColors[item.kind]}
                      />
                      <g
                        className="facility-symbol"
                        stroke={facilityColors[item.kind]}
                      >
                        <FacilitySymbol kind={item.kind} />
                      </g>
                      {thematicLabels && detail && active <= 2 && (
                        <text className="map-text facility-name" y="25">
                          {item.name.replace('（规划）', '')}
                        </text>
                      )}
                    </g>
                    <title>
                      {item.name} · {item.countryId.slice(-2)} 号区域 · 规划位置
                    </title>
                  </g>
                ))}
        </g>
      )}
      {countryLabels && (
        <g className={`country-labels${active > 1 ? ' subdued' : ''}`}>
          {partition.territories.map((region, index) => (
            <text
              key={region.id}
              x={region.label[0]}
              y={region.label[1]}
              className="map-text country-label"
            >
              {region.number}
              {detail && active === 1 && (
                <tspan x={region.label[0]} dy="18" className="country-name">
                  {artwork.political.countries[index]!.name}
                </tspan>
              )}
            </text>
          ))}
        </g>
      )}
      {showLabels && !detail && (
        <text x="824" y="541" className="map-text island-name">
          Callum Island
        </text>
      )}
      {selectedIndex >= 0 && (
        <g className="selected-region">
          <path
            d={partition.territories[selectedIndex]!.path}
            fillRule="evenodd"
          />
          <text
            className="map-text selection-label"
            x={partition.territories[selectedIndex]!.label[0]}
            y={partition.territories[selectedIndex]!.label[1]}
          >
            {artwork.political.countries[selectedIndex]!.number}
          </text>
        </g>
      )}
    </svg>
  );
}
