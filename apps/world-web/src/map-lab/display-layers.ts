import artwork from './atlas-layers.json';
import partition from './land-partition.json';
import maritime from './maritime-zones.json';

export { artwork, partition, maritime };
export type LayerId =
  | 'physical'
  | 'climate'
  | 'currents'
  | 'trade'
  | 'resources'
  | 'political'
  | 'maritime'
  | 'infrastructure'
  | 'population';
export type LayerVisibility = Record<LayerId, boolean>;
export const layerDefinitions: {
  id: LayerId;
  name: string;
  color: string;
  summary: string;
  legend: readonly [string, string][];
}[] = [
  {
    id: 'physical',
    name: '地形与水系',
    color: '#a8dfdf',
    summary: '山脊、41 条河流与 30 处新增内陆湖',
    legend: [
      ['#dccbad', '山脉'],
      ['#85dcf4', '河流'],
      ['#246e96', '内陆湖泊'],
    ],
  },
  {
    id: 'climate',
    name: '气候分区',
    color: '#84bb83',
    summary: '结合纬度、山地与干湿特征的气候草案',
    legend: artwork.climates.map((c) => [c.color, c.name]),
  },
  {
    id: 'currents',
    name: '洋流',
    color: '#f49f78',
    summary: '暖流与寒流分色，以箭头标明方向',
    legend: [
      ['#fcaa7d', '暖流方向'],
      ['#73caed', '寒流方向'],
    ],
  },
  {
    id: 'trade',
    name: '贸易路线',
    color: '#edc479',
    summary: '陆路连接枢纽与港口，海运沿水域通行',
    legend: [
      ['#efc77e', '陆路通道'],
      ['#a1e6ee', '海运航线'],
    ],
  },
  {
    id: 'resources',
    name: '资源分布',
    color: '#c8b0dd',
    summary: '六类首季地质资源、农业用地与未启用背景',
    legend: artwork.resourceTypes.map((r) => [
      r.color,
      r.symbol + ' ' + r.name,
    ]),
  },
  {
    id: 'political',
    name: '国家分区与边界',
    color: '#e5c777',
    summary: '70 个陆地区域，共享国界与沿岸岛屿',
    legend: [
      ['#f3e3b0', '陆上国界'],
      ['#82bfc7', '海岸线'],
      ['#ffdc75', '选中区域'],
    ],
  },
  {
    id: 'maritime',
    name: '领海与公海',
    color: '#70c8e3',
    summary: '12 海里领海、200 海里专属经济区与公海；重叠海域待协商',
    legend: [
      ['#7de0d6', '领海候选范围'],
      ['#429cd0', '专属经济区候选范围'],
      ['#153e6a', '公海（水体）'],
      ['#f2c773', '重叠待议海域'],
    ],
  },
  {
    id: 'infrastructure',
    name: '基础设施',
    color: '#9abbdc',
    summary: '350 个具名候选设施，按人口与接入条件分布',
    legend: [
      ['#9ce5ea', '港口'],
      ['#e9d294', '物流枢纽'],
      ['#c2a5d6', '采矿'],
      ['#bbd88b', '农业'],
      ['#edb78b', '能源'],
      ['#b2c6df', '加工'],
    ],
  },
  {
    id: 'population',
    name: '人口与聚居',
    color: '#edba84',
    summary: '依河谷、农业平原与交通接入推导的情景人口',
    legend: [
      ['#ead99d', '低密度腹地'],
      ['#d99757', '农业与资源聚居'],
      ['#bd573e', '城市与交通集聚'],
    ],
  },
];
export function visibilityFor(...ids: LayerId[]): LayerVisibility {
  return Object.fromEntries(
    layerDefinitions.map((layer) => [layer.id, ids.includes(layer.id)]),
  ) as LayerVisibility;
}
export const mapViews = [
  { id: 'overview', name: '全图', box: [0, 0, 1774, 887] },
  { id: 'northwest', name: '西北大陆', box: [55, 112, 720, 415] },
  { id: 'central', name: 'Callum Island', box: [555, 290, 535, 405] },
  { id: 'northeast', name: '东北半岛', box: [1260, 205, 480, 355] },
  { id: 'southeast', name: '东南大陆', box: [910, 475, 750, 365] },
  { id: 'southwest', name: '西南群岛', box: [100, 480, 520, 325] },
] as const;
export const nodeById = new Map(artwork.nodes.map((node) => [node.id, node]));
export const resourceTypeById = new Map(
  artwork.resourceTypes.map((resource) => [resource.id, resource]),
);
