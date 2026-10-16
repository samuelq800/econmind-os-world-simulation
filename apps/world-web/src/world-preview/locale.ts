export type PreviewLocale = 'zh' | 'en';
// Reuse the existing immutable country-page preference, not its DOM translator.
export const LANGUAGE_KEY = 'econmind-ui-language';
export const LANGUAGE_EVENT = 'econmind-language-change';

const zh = {
  overview: '世界总览',
  explore: '探索国家',
  layers: '地图图层',
  sources: '资料目录',
  atlas: '世界图集',
  navigation: '世界导航',
  menu: '打开导航菜单',
  closeMenu: '关闭导航菜单',
  language: '界面语言',
  search: '搜索国家',
  searchPlaceholder: '搜索国家名称或编号…',
  clearSearch: '清除搜索',
  groups: '既有地图分区',
  allCountries: '全部国家',
  countries: '国家列表',
  noResults: '没有匹配的国家',
  clearFilters: '清除筛选',
  results: '匹配国家',
  statistics: '世界统计',
  countryCount: '国家总数',
  groupCount: '图示分区',
  resourceCount: '公开资源图示',
  sourceCount: '本页来源文件',
  sourceGrouping: '分区沿用原地图的图示分组，不代表权属或行政分类。',
  northwest: '西北大陆与近海群岛',
  southwest: '西南大陆与群岛',
  central: '中央大陆与弧岛',
  east: '东部大陆',
  map: '可拖拽缩放的公开世界地图',
  mapHelp: '拖拽平移 · 滚轮或双指缩放 · 方向键平移',
  zoomIn: '放大地图',
  zoomOut: '缩小地图',
  reset: '重置世界视图',
  zoom: '缩放',
  terrain: '原始地形底图',
  details: '原地理细图',
  borders: '国家边界',
  water: '河流与湖泊',
  mountains: '山脉图示',
  resourcesLayer: '公开资源图示',
  settlements: '既有聚落节点',
  climate: '气候图示',
  currents: '洋流图示',
  routes: '既有交通走廊',
  legend: '地图图例',
  close: '关闭面板',
  detailsTitle: '国家资料',
  selectCountry: '选择国家',
  number: '国家编号',
  name: '源名称',
  group: '图示分区',
  coordinate: '标记源坐标',
  sourcePixels: '源像素',
  screenPixels: '屏幕像素',
  outlinePixels: '陆地源栅格像素',
  geographicNote: '边界与标记沿用原地图。细节为推演图示，非测绘。',
  moreSources: '查看来源记录',
  returnWorld: '返回世界总览',
  publicStatus: '公开静态预览 · 非实时',
  sourceStatus: '既有公开地理来源',
  loading: '正在载入世界地图…',
  textureLoading: '底图载入中',
  textureError: '底图暂不可用；国家边界、搜索与选择仍可使用。',
  sourceTitle: '地理来源记录',
  sourceNote: '仅展示既有公开地理资料；未连接实时世界状态。',
  hash: '固定内容哈希',
  terrainSource: '原始世界地形',
  boundarySource: '70国边界与原始标记',
  layersSource: '既有地理图层',
  detailSource: '原国家地理细图索引',
  groupSource: '既有图示分区索引',
  unavailable: '源字段未提供',
  filtersOpen: '打开国家搜索与筛选',
  filtersClose: '关闭国家搜索与筛选',
  countryNote: '正式源名称保留原拼写；不推断人口、面积或经济数据。',
  sourceScale: '地图像素比例',
  coordinateHint: '坐标使用原始底图像素，不表示经纬度或地面距离。',
  error: '世界预览暂时不可用',
  retry: '重新载入',
  emptyLegend: '当前没有启用的附加图层',
  boundariesLegend: '国家边界与原编号',
  waterLegend: '河流、湖泊',
  selectedLegend: '当前选中国家',
  pointsLegend: '既有公开图示点',
  showDetails: '国家资料',
  collapseDetails: '关闭国家资料',
} as const;

const en: { [K in keyof typeof zh]: string } = {
  overview: 'World overview',
  explore: 'Explore countries',
  layers: 'Map layers',
  sources: 'Source directory',
  atlas: 'WORLD ATLAS',
  navigation: 'World navigation',
  menu: 'Open navigation menu',
  closeMenu: 'Close navigation menu',
  language: 'Interface language',
  search: 'Search countries',
  searchPlaceholder: 'Search country name or number…',
  clearSearch: 'Clear search',
  groups: 'Existing map groups',
  allCountries: 'All countries',
  countries: 'Country list',
  noResults: 'No matching countries',
  clearFilters: 'Clear filters',
  results: 'Matching countries',
  statistics: 'World statistics',
  countryCount: 'Countries',
  groupCount: 'Illustrated groups',
  resourceCount: 'Public resource symbols',
  sourceCount: 'Source files',
  sourceGrouping:
    'Groups follow the existing illustrated map grouping; they are not ownership or administrative classifications.',
  northwest: 'Northwestern continent and offshore islands',
  southwest: 'Southwestern continent and islands',
  central: 'Central continent and arc islands',
  east: 'Eastern continent',
  map: 'Interactive public world map: drag and zoom',
  mapHelp: 'Drag to pan · Wheel or pinch to zoom · Arrow keys to pan',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  reset: 'Reset world view',
  zoom: 'Zoom',
  terrain: 'Original terrain',
  details: 'Original geographic detail',
  borders: 'Country boundaries',
  water: 'Rivers and lakes',
  mountains: 'Mountain symbols',
  resourcesLayer: 'Public resource symbols',
  settlements: 'Existing settlement nodes',
  climate: 'Illustrated climate',
  currents: 'Illustrated currents',
  routes: 'Existing transport corridors',
  legend: 'Map legend',
  close: 'Close panel',
  detailsTitle: 'Country information',
  selectCountry: 'Select country',
  number: 'Country number',
  name: 'Source name',
  group: 'Illustrated map group',
  coordinate: 'Original label coordinate',
  sourcePixels: 'source pixels',
  screenPixels: 'screen pixels',
  outlinePixels: 'Land source raster pixels',
  geographicNote:
    'Original boundaries and labels. Details are illustrative cartography, not surveyed geography.',
  moreSources: 'View source records',
  returnWorld: 'Return to world overview',
  publicStatus: 'Static public preview · Not realtime',
  sourceStatus: 'Existing public geographic sources',
  loading: 'Loading the world map…',
  textureLoading: 'Loading terrain',
  textureError:
    'Terrain is unavailable; country boundaries, search and selection remain usable.',
  sourceTitle: 'Geographic source records',
  sourceNote:
    'Existing public geography only; not connected to live World State.',
  hash: 'Pinned content hash',
  terrainSource: 'Original world terrain',
  boundarySource: '70 country boundaries and original labels',
  layersSource: 'Existing geographic layers',
  detailSource: 'Original country detail index',
  groupSource: 'Existing illustrated group index',
  unavailable: 'Source field unavailable',
  filtersOpen: 'Open country search and filters',
  filtersClose: 'Close country search and filters',
  countryNote:
    'Source names retain their original spelling. No population, area or economic figures are inferred.',
  sourceScale: 'Map pixel scale',
  coordinateHint:
    'Coordinates are original map pixels, not latitude/longitude or ground distance.',
  error: 'World preview is temporarily unavailable',
  retry: 'Reload preview',
  emptyLegend: 'No additional layers are enabled',
  boundariesLegend: 'Country boundaries and original numbers',
  waterLegend: 'Rivers and lakes',
  selectedLegend: 'Selected country',
  pointsLegend: 'Existing public illustrated points',
  showDetails: 'Country information',
  collapseDetails: 'Close country information',
};

export const messages = { zh, en };
export type MessageKey = keyof typeof zh;

export function resolvePreviewLocale(
  stored: string | null,
  fallback?: string,
): PreviewLocale {
  if (stored === 'zh' || stored === 'en') return stored;
  return fallback?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function readPreviewLocale(): PreviewLocale {
  if (typeof window === 'undefined') return 'en';
  try {
    return resolvePreviewLocale(window.localStorage.getItem(LANGUAGE_KEY));
  } catch {
    return 'en';
  }
}

export function applyPreviewLocale(locale: PreviewLocale) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.dataset.language = locale;
  }
  try {
    window.localStorage.setItem(LANGUAGE_KEY, locale);
  } catch {
    /* UI remains usable without storage. */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(LANGUAGE_EVENT, { detail: { language: locale } }),
    );
  }
}

/** Subscribe to the immutable page's existing preference/change contract. */
export function subscribePreviewLocale(onChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const storage = (event: StorageEvent) => {
    if (event.key === LANGUAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener(LANGUAGE_EVENT, onChange);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(LANGUAGE_EVENT, onChange);
    window.removeEventListener('storage', storage);
  };
}
