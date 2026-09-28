import fs from 'node:fs/promises';
import path from 'node:path';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const root = process.env.ECONMIND_WORKTREE;
if (!root) throw new Error('ECONMIND_WORKTREE is required');
const data = JSON.parse(
  await fs.readFile(
    path.join(
      root,
      'artifacts/world-geography/reconciled-v2/tables/all_tables.json',
    ),
    'utf8',
  ),
);
const output = path.join(root, 'outputs/01a0e1b0-603c-7e13-81de-2cddb9c5d4c1');
await fs.mkdir(output, { recursive: true });
const previewDir = path.join(output, 'previews');
await fs.mkdir(previewDir, { recursive: true });

const names = {
  country_summary: '国家总表',
  fairness_audit: '公平性审计',
  regions: '地理分区122',
  deposits: '矿床240',
  facilities: '地图基建350',
  freight: '货运通道349',
  power: '电网候选70',
  rights: '权利条件70',
  basins: '水系71',
  climate_templates: '气候模板15',
  balance_checks: '区域缺口122',
  scenarios: '情景诊断3',
  country_opening_raw: '原始开局70',
  model_parameters: '参数来源',
};
const descriptions = {
  country_summary: '地图和地理推导的国家级预设；单位写在字段名中。',
  fairness_audit: '只提出金融授信与技术研究优先项；不修改地图资产。',
  regions: '区域路径过长时以 SHA-256 引用；完整坐标保存在同名 JSON。',
  deposits: '地质候选量；不是可观察的地下实测储量。',
  facilities: '350 处与国家图锚点一一对应，均为未投运候选。',
  freight: '勘测通道，未验收为实际道路或可用货流。',
  power: '电网建议尚未送电。',
  rights: '权利条件尚未登记生效。',
  basins: '简化水系归集，非实测流域。',
  climate_templates: '气候系数为虚构情景模板。',
  balance_checks: '地理供需诊断，不等同完整生产模拟。',
  scenarios: '仅粮食潜力情景，不等同 600 日运行验收。',
  country_opening_raw: '保留国家原始开局字段及嵌套列表的 JSON 文本。',
  model_parameters: '比例尺、建模系数、手册来源与启用阻塞项。',
};
const wb = Workbook.create();
const readme = wb.worksheets.add('阅读说明');
readme.showGridLines = false;
readme.tabColor = '#697A81';
readme.getRange('A2').values = [['World V2 · 70 国地图预设数据包']];
readme.getRange('A2').format.font = {
  name: 'Arial',
  size: 16,
  bold: true,
  color: '#17343D',
};
readme.getRange('A4:B11').values = [
  ['状态', 'ILLUSTRATIVE_PLANNING_ONLY / 未绑定正式赛季'],
  [
    '原则',
    '地图基建、地质候选、人口和地理资源以地图为准；平衡只提金融和技术。',
  ],
  ['国家与图', '70 张独立国家图、4 张大陆图；350 处基建有地图锚点。'],
  [
    '修订',
    '51、52 国人口及少量土地利用按地图上的聚落与开垦地修正；不为总量守恒挪动其他国家人口。',
  ],
  [
    '金融技术',
    '公平性审计中的授信和技术优先项均为提案，未计入实有库存或技术许可。',
  ],
  [
    '完整来源',
    '同目录之外的 artifacts/world-geography/reconciled-v2/*.json 是无损主数据。',
  ],
  ['几何', '超长 SVG 路径在表内显示哈希，原路径保存在 world-space.json。'],
  ['验收限制', '尚未完成 Core 配方、价格、权利、运输及 600 模拟日运行验证。'],
];
readme.getRange('A4:A11').format.font = {
  name: 'Arial',
  size: 10,
  bold: true,
  color: '#17343D',
};
readme.getRange('B4:B11').format.font = {
  name: 'Arial',
  size: 10,
  color: '#22333C',
};
readme.getRange('A4:A11').format.columnWidth = 19;
readme.getRange('B4:B11').format.columnWidth = 100;
readme.getRange('B4:B11').format.wrapText = true;
readme.getRange('A4:B11').format.rowHeight = 31;
readme.getRange('A13:B13').values = [['工作表', '内容']];
readme.getRange('A13:B13').format = {
  fill: '#17343D',
  font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' },
};
readme.getRangeByIndexes(13, 0, Object.keys(names).length, 2).values =
  Object.keys(names).map((key) => [names[key], descriptions[key]]);

function safe(value) {
  if (value == null) return null;
  if (typeof value === 'string' && value.startsWith('=')) return `'${value}`;
  return value;
}
for (const [key, title] of Object.entries(names)) {
  const rows = data[key];
  const available = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const preferred =
    key === 'country_summary'
      ? [
          'countryNumber',
          'countryName',
          'population',
          'areaKm2',
          'mappedFacilityCount',
          'mineralCommodityCount',
          'foodNetTonnesDay',
          'treasuryCashGcu',
        ]
      : key === 'fairness_audit'
        ? [
            'countryNumber',
            'countryName',
            'mappedFacilityCount',
            'mineralCommodityCount',
            'proposedFinanceCreditLineGcu',
            'proposedTechnologyAccess',
          ]
        : key === 'regions'
          ? [
              'id',
              'countryId',
              'initial.population',
              'areaKm2',
              'natural.temperatureC',
              'natural.annualRainMm',
            ]
          : [];
  const columns = [
    ...preferred,
    ...available.filter((column) => !preferred.includes(column)),
  ];
  const sheet = wb.worksheets.add(title);
  sheet.showGridLines = false;
  if (key === 'country_summary') sheet.tabColor = '#17343D';
  if (key === 'fairness_audit') sheet.tabColor = '#325D69';
  sheet.getRange('A2').values = [[title]];
  sheet.getRange('A2').format.font = {
    name: 'Arial',
    size: 14,
    bold: true,
    color: '#17343D',
  };
  sheet.getRange('A3').values = [[descriptions[key]]];
  sheet.getRange('A3').format.font = {
    name: 'Arial',
    size: 10,
    italic: true,
    color: '#697A81',
  };
  sheet.getRangeByIndexes(3, 0, 1, columns.length).values = [columns];
  sheet.getRangeByIndexes(3, 0, 1, columns.length).format = {
    fill: '#17343D',
    font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' },
    rowHeight: 38,
    horizontalAlignment: 'center',
    verticalAlignment: 'center',
    wrapText: true,
  };
  const matrix = rows.map((row) => columns.map((col) => safe(row[col])));
  if (matrix.length)
    sheet.getRangeByIndexes(4, 0, matrix.length, columns.length).values =
      matrix;
  sheet.getRangeByIndexes(
    4,
    0,
    Math.max(1, matrix.length),
    columns.length,
  ).format.font = { name: 'Arial', size: 10, color: '#263942' };
  for (const [index, column] of columns.entries()) {
    const values = rows
      .map((row) => row[column])
      .filter((value) => value !== null && value !== undefined);
    const numeric = values.every((value) => typeof value === 'number');
    const textLength = numeric
      ? 0
      : Math.max(0, ...values.map((value) => String(value).length));
    const width =
      column === 'value'
        ? 90
        : Math.min(
            70,
            Math.max(18, column.length * 1.05, Math.min(textLength, 60) * 1.15),
          );
    const columnRange = sheet.getRangeByIndexes(3, index, rows.length + 1, 1);
    columnRange.format.columnWidth = width;
    if (numeric)
      sheet
        .getRangeByIndexes(4, index, rows.length, 1)
        .setNumberFormat(
          values.every(Number.isInteger) ? '#,##0' : '#,##0.###',
        );
    if (column === 'countryNumber')
      sheet.getRangeByIndexes(4, index, rows.length, 1).setNumberFormat('00');
    if (textLength > 65)
      sheet.getRangeByIndexes(4, index, rows.length, 1).format.wrapText = true;
  }
  sheet
    .getRangeByIndexes(4, 0, rows.length, columns.length)
    .format.autofitRows();
  sheet.freezePanes.freezeRows(4);
  sheet.freezePanes.freezeColumns(preferred.length ? 2 : 1);
  console.log(`${title}: ${rows.length} records, ${columns.length} columns`);
}
wb.recalculate();
for (const title of ['阅读说明', ...Object.values(names)]) {
  try {
    const png = await wb.render({
      sheetName: title,
      range: title === '阅读说明' ? 'A1:B17' : 'A1:D9',
      scale: 1,
      format: 'png',
    });
    await fs.writeFile(
      path.join(previewDir, `${title}.png`),
      new Uint8Array(await png.arrayBuffer()),
    );
  } catch (error) {
    console.error(`Render failed for ${title}: ${error.message}`);
    throw error;
  }
}
const inspect = await wb.inspect({
  kind: 'sheet',
  include: 'id,name',
  maxChars: 5000,
});
await fs.writeFile(
  path.join(output, 'workbook-inspection.json'),
  JSON.stringify(inspect, null, 2),
);
const file = await SpreadsheetFile.exportXlsx(wb);
await file.save(
  path.join(output, 'World_V2_70_Country_Presets_2026-09-28.xlsx'),
);
console.log(`Saved workbook to ${output}`);
