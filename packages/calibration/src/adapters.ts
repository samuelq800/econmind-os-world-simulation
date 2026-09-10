import type { SourceAdapter, SourceRecord, SourceRequest } from './types.js';

function required(
  parameters: Readonly<Record<string, string>>,
  key: string,
): string {
  const value = parameters[key];
  if (value === undefined || value.length === 0)
    throw new Error(`Missing adapter parameter: ${key}`);
  return value;
}

function encodeQuery(parameters: Readonly<Record<string, string>>): string {
  return Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join('&');
}

function decimalText(value: unknown, context: string): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value))
    return value.toString();
  throw new TypeError(
    `${context} must retain its source decimal as text or a safe integer`,
  );
}

function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(
    new TextDecoder('utf8', { fatal: true }).decode(bytes),
  ) as unknown;
}

function parseCsv(text: string): readonly Readonly<Record<string, string>>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error('Unterminated CSV quoted field');
  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  const [headers, ...values] = rows;
  if (headers === undefined) return [];
  return values.map((cells) => {
    if (cells.length !== headers.length)
      throw new Error('CSV row width does not match header');
    return Object.fromEntries(
      headers.map((header, index) => [header, cells[index] ?? '']),
    );
  });
}

export const wdiAdapter: SourceAdapter = {
  sourceId: 'WB_WDI_V2',
  buildRequest(parameters): SourceRequest {
    const economy = required(parameters, 'economy');
    const indicator = required(parameters, 'indicator');
    const date = required(parameters, 'date');
    const query = { date, format: 'json', per_page: '20000' };
    return {
      sourceId: this.sourceId,
      method: 'GET',
      url: `https://api.worldbank.org/v2/country/${encodeURIComponent(economy)}/indicator/${encodeURIComponent(indicator)}?${encodeQuery(query)}`,
      parameters: { economy, indicator, ...query },
      expectedFormat: 'JSON',
    };
  },
  parse(bytes): readonly SourceRecord[] {
    const payload = parseJson(bytes);
    if (!Array.isArray(payload) || !Array.isArray(payload[1]))
      throw new Error('Unexpected WDI payload');
    return payload[1].map((item: unknown) => {
      const row = item as Record<string, unknown>;
      const country = row['country'] as Record<string, unknown>;
      const indicator = row['indicator'] as Record<string, unknown>;
      const geographyId = country?.['id'];
      const indicatorId = indicator?.['id'];
      const period = row['date'];
      if (
        typeof geographyId !== 'string' ||
        typeof indicatorId !== 'string' ||
        typeof period !== 'string'
      ) {
        throw new Error('WDI record is missing identity fields');
      }
      return {
        sourceObservationKey: `${geographyId}:${indicatorId}:${period}`,
        geographyId,
        period,
        value: decimalText(row['value'], 'WDI value'),
        sourceUnit:
          typeof row['unit'] === 'string' && row['unit'].length > 0
            ? row['unit']
            : indicatorId,
        qualityFlags:
          row['obs_status'] === '' || row['obs_status'] === undefined
            ? []
            : [`WDI_STATUS:${String(row['obs_status'])}`],
      };
    });
  },
};

export const wtoAdapter: SourceAdapter = {
  sourceId: 'WTO_TIMESERIES_V1',
  buildRequest(parameters): SourceRequest {
    const indicator = required(parameters, 'indicator');
    const reporter = required(parameters, 'reporter');
    const year = required(parameters, 'year');
    const query = { i: indicator, r: reporter, ps: year, pc: 'true' };
    return {
      sourceId: this.sourceId,
      method: 'GET',
      url: `https://api.wto.org/timeseries/v1/indicator?${encodeQuery(query)}`,
      parameters: { indicator, reporter, year, ...query },
      expectedFormat: 'CSV',
    };
  },
  parse(bytes): readonly SourceRecord[] {
    return parseCsv(new TextDecoder('utf8', { fatal: true }).decode(bytes)).map(
      (row) => {
        const reporter = required(row, 'ReporterISO3');
        const partner = required(row, 'PartnerISO3');
        const product = required(row, 'ProductCode');
        const year = required(row, 'Year');
        const indicator = required(row, 'IndicatorCode');
        return {
          sourceObservationKey: `${reporter}:${partner}:${product}:${indicator}:${year}`,
          geographyId: reporter,
          period: year,
          value: row['Value'] === '' ? null : required(row, 'Value'),
          sourceUnit: required(row, 'Unit'),
          qualityFlags:
            row['Flag'] === undefined || row['Flag'] === ''
              ? []
              : [`WTO_FLAG:${row['Flag']}`],
        };
      },
    );
  },
};

export const comtradeAdapter: SourceAdapter = {
  sourceId: 'UN_COMTRADE_V1',
  buildRequest(parameters): SourceRequest {
    const reporterCode = required(parameters, 'reporterCode');
    const period = required(parameters, 'period');
    const flowCode = required(parameters, 'flowCode');
    const query = {
      reporterCode,
      period,
      flowCode,
      partnerCode: parameters['partnerCode'] ?? '0',
      cmdCode: parameters['cmdCode'] ?? 'TOTAL',
      aggregateBy: '6',
      breakdownMode: 'classic',
    };
    return {
      sourceId: this.sourceId,
      method: 'GET',
      url: `https://comtradeapi.un.org/public/v1/preview/C/A/HS?${encodeQuery(query)}`,
      parameters: query,
      expectedFormat: 'JSON',
    };
  },
  parse(bytes): readonly SourceRecord[] {
    const payload = parseJson(bytes) as Record<string, unknown>;
    if (!Array.isArray(payload['data']))
      throw new Error('Unexpected UN Comtrade payload');
    return payload['data'].map((item: unknown) => {
      const row = item as Record<string, unknown>;
      const reporter = row['reporterISO'];
      const partner = row['partnerISO'];
      const period = row['period'];
      const flow = row['flowCode'];
      const commodity = row['cmdCode'];
      if (
        typeof reporter !== 'string' ||
        typeof partner !== 'string' ||
        (typeof period !== 'string' && typeof period !== 'number') ||
        typeof flow !== 'string' ||
        typeof commodity !== 'string'
      ) {
        throw new Error('UN Comtrade record is missing identity fields');
      }
      return {
        sourceObservationKey: `${reporter}:${partner}:${commodity}:${flow}:${String(period)}`,
        geographyId: reporter,
        period: String(period),
        value: decimalText(row['primaryValue'], 'UN Comtrade primaryValue'),
        sourceUnit:
          typeof row['primaryValueUnit'] === 'string'
            ? row['primaryValueUnit']
            : 'USD',
        qualityFlags: row['isAggregate'] === true ? ['COMTRADE_AGGREGATE'] : [],
      };
    });
  },
};

export const calibrationAdapters = Object.freeze([
  wdiAdapter,
  wtoAdapter,
  comtradeAdapter,
]);
