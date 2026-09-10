import {
  canonicalDecimalValue,
  isLosslessJsonNumber,
  losslessArray,
  losslessObject,
  losslessScalarText,
  losslessString,
  parseLosslessJson,
  rawNumberToken,
  type LosslessJsonValue,
} from './lossless-json.js';
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

function scalarOrNull(
  value: LosslessJsonValue,
  context: string,
): string | null {
  return value === null ? null : losslessScalarText(value, context);
}

function booleanValue(value: LosslessJsonValue, context: string): boolean {
  if (typeof value !== 'boolean')
    throw new TypeError(`${context} must be boolean`);
  return value;
}

function integerMetadata(value: LosslessJsonValue, context: string): number {
  if (!isLosslessJsonNumber(value) || !/^(?:0|[1-9]\d*)$/u.test(value.raw)) {
    throw new TypeError(`${context} must be a non-negative integer token`);
  }
  const parsed = Number(value.raw);
  if (!Number.isSafeInteger(parsed))
    throw new RangeError(`${context} is out of range`);
  return parsed;
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
  sourceFamily: 'WORLD_BANK_WDI',
  provider: 'World Bank',
  endpointIdentity: 'WORLD_BANK_INDICATORS_API_V2',
  adapterVersion: '2.0.0',
  licenseUrl:
    'https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets',
  buildRequest(parameters): SourceRequest {
    const economy = required(parameters, 'economy');
    const indicator = required(parameters, 'indicator');
    const date = required(parameters, 'date');
    const query = {
      date,
      format: 'json',
      page: parameters['page'] ?? '1',
      per_page: parameters['per_page'] ?? '20000',
      source: parameters['source'] ?? '2',
    };
    return {
      sourceId: this.sourceId,
      method: 'GET',
      url: `https://api.worldbank.org/v2/country/${encodeURIComponent(economy)}/indicator/${encodeURIComponent(indicator)}?${encodeQuery(query)}`,
      parameters: { economy, indicator, ...query },
      expectedFormat: 'JSON',
    };
  },
  parse(bytes): readonly SourceRecord[] {
    const payload = losslessArray(parseLosslessJson(bytes), 'WDI payload');
    const records = losslessArray(payload[1] ?? null, 'WDI records');
    return records.map((item, index) => {
      const row = losslessObject(item, `WDI record ${index}`);
      const country = losslessObject(row['country'] ?? null, 'WDI country');
      const indicator = losslessObject(
        row['indicator'] ?? null,
        'WDI indicator',
      );
      const geographyId = losslessString(
        country['id'] ?? null,
        'WDI country.id',
      );
      const indicatorId = losslessString(
        indicator['id'] ?? null,
        'WDI indicator.id',
      );
      const period = losslessString(row['date'] ?? null, 'WDI date');
      const valueNode = row['value'] ?? null;
      const iso3 = scalarOrNull(
        row['countryiso3code'] ?? null,
        'WDI countryiso3code',
      );
      const unit = scalarOrNull(row['unit'] ?? null, 'WDI unit');
      const status = scalarOrNull(row['obs_status'] ?? null, 'WDI obs_status');
      return {
        sourceObservationKey: `${geographyId}:${indicatorId}:${period}`,
        variableCode: indicatorId,
        geographyId,
        period,
        value: canonicalDecimalValue(valueNode, 'WDI value'),
        rawNumericToken: rawNumberToken(valueNode, 'WDI value'),
        sourceUnit: unit === null || unit.length === 0 ? indicatorId : unit,
        qualityFlags: [
          ...(status === null || status.length === 0
            ? []
            : [`WDI_STATUS:${status}`]),
          ...(valueNode === null ? ['MISSING_OBSERVATION'] : []),
        ],
        attributes: {
          countryIso3: iso3,
          indicatorId,
          providerUnit: unit,
          providerDecimalField: scalarOrNull(
            row['decimal'] ?? null,
            'WDI decimal',
          ),
        },
      };
    });
  },
};

export interface WdiPagination {
  readonly page: number;
  readonly pages: number;
  readonly perPage: number;
  readonly total: number;
  readonly sourceId: string | null;
  readonly lastUpdated: string;
}

export function readWdiPagination(bytes: Uint8Array): WdiPagination {
  const payload = losslessArray(parseLosslessJson(bytes), 'WDI payload');
  const metadata = losslessObject(payload[0] ?? null, 'WDI metadata');
  return {
    page: integerMetadata(metadata['page'] ?? null, 'WDI page'),
    pages: integerMetadata(metadata['pages'] ?? null, 'WDI pages'),
    perPage: integerMetadata(metadata['per_page'] ?? null, 'WDI per_page'),
    total: integerMetadata(metadata['total'] ?? null, 'WDI total'),
    sourceId: scalarOrNull(metadata['sourceid'] ?? null, 'WDI sourceid'),
    lastUpdated: losslessString(
      metadata['lastupdated'] ?? null,
      'WDI lastupdated',
    ),
  };
}

export const wtoAdapter: SourceAdapter = {
  sourceId: 'WTO_TIMESERIES_V1',
  sourceFamily: 'WTO_TIMESERIES',
  provider: 'World Trade Organization',
  endpointIdentity: 'WTO_TIMESERIES_API_V1',
  adapterVersion: '2.0.0',
  licenseUrl: 'https://www.wto.org/english/info_e/copyright_e.htm',
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
          variableCode: indicator,
          geographyId: reporter,
          period: year,
          value: row['Value'] === '' ? null : required(row, 'Value'),
          rawNumericToken: row['Value'] === '' ? null : required(row, 'Value'),
          sourceUnit: required(row, 'Unit'),
          qualityFlags:
            row['Flag'] === undefined || row['Flag'] === ''
              ? []
              : [`WTO_FLAG:${row['Flag']}`],
          attributes: {
            reporterCode: reporter,
            partnerCode: partner,
            productCode: product,
            indicatorCode: indicator,
          },
        };
      },
    );
  },
};

export const comtradeAdapter: SourceAdapter = {
  sourceId: 'UN_COMTRADE_V1',
  sourceFamily: 'UN_COMTRADE',
  provider: 'United Nations Statistics Division',
  endpointIdentity: 'UN_COMTRADE_PUBLIC_PREVIEW_V1',
  adapterVersion: '2.0.0',
  licenseUrl: 'https://comtrade.un.org/db/help/LicenseAgreement.aspx',
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
      customsCode: parameters['customsCode'] ?? 'C00',
      motCode: parameters['motCode'] ?? '0',
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
    const payload = losslessObject(
      parseLosslessJson(bytes),
      'UN Comtrade payload',
    );
    const records = losslessArray(payload['data'] ?? null, 'UN Comtrade data');
    return records.map((item, index) => {
      const row = losslessObject(item, `UN Comtrade record ${index}`);
      const reporter = losslessScalarText(
        row['reporterCode'] ?? null,
        'Comtrade reporterCode',
      );
      const partner = losslessScalarText(
        row['partnerCode'] ?? null,
        'Comtrade partnerCode',
      );
      const period = losslessScalarText(
        row['period'] ?? null,
        'Comtrade period',
      );
      const flow = losslessString(row['flowCode'] ?? null, 'Comtrade flowCode');
      const commodity = losslessString(
        row['cmdCode'] ?? null,
        'Comtrade cmdCode',
      );
      const customsCode = losslessString(
        row['customsCode'] ?? null,
        'Comtrade customsCode',
      );
      const modeOfTransportCode = losslessScalarText(
        row['motCode'] ?? null,
        'Comtrade motCode',
      );
      const classification = losslessString(
        row['classificationCode'] ?? row['classificationSearchCode'] ?? null,
        'Comtrade classificationCode',
      );
      const primaryValue = row['primaryValue'] ?? null;
      const isAggregate = booleanValue(
        row['isAggregate'] ?? false,
        'Comtrade isAggregate',
      );
      return {
        sourceObservationKey: `${reporter}:${partner}:${classification}:${commodity}:${flow}:${period}:${customsCode}:${modeOfTransportCode}`,
        variableCode: 'PRIMARY_VALUE',
        geographyId: reporter,
        period,
        value: canonicalDecimalValue(primaryValue, 'UN Comtrade primaryValue'),
        rawNumericToken: rawNumberToken(
          primaryValue,
          'UN Comtrade primaryValue',
        ),
        sourceUnit: 'USD',
        qualityFlags: [
          ...(isAggregate ? ['COMTRADE_AGGREGATE'] : []),
          ...(primaryValue === null ? ['MISSING_OBSERVATION'] : []),
          ...(row['isReported'] === false
            ? ['COMTRADE_NOT_DIRECTLY_REPORTED']
            : []),
        ],
        attributes: {
          reporterCode: reporter,
          reporterIso: scalarOrNull(
            row['reporterISO'] ?? null,
            'Comtrade reporterISO',
          ),
          partnerCode: partner,
          partnerIso: scalarOrNull(
            row['partnerISO'] ?? null,
            'Comtrade partnerISO',
          ),
          flowCode: flow,
          productClassification: classification,
          productCode: commodity,
          customsCode,
          modeOfTransportCode,
          classificationSearchCode: scalarOrNull(
            row['classificationSearchCode'] ?? null,
            'Comtrade classificationSearchCode',
          ),
          isOriginalClassification:
            typeof row['isOriginalClassification'] === 'boolean'
              ? String(row['isOriginalClassification'])
              : null,
          quantityRawToken: rawNumberToken(row['qty'] ?? null, 'Comtrade qty'),
          quantityCanonical: canonicalDecimalValue(
            row['qty'] ?? null,
            'Comtrade qty',
          ),
          quantityUnitCode: scalarOrNull(
            row['qtyUnitCode'] ?? null,
            'Comtrade qtyUnitCode',
          ),
          quantityUnitAbbreviation: scalarOrNull(
            row['qtyUnitAbbr'] ?? null,
            'Comtrade qtyUnitAbbr',
          ),
          netWeightRawToken: rawNumberToken(
            row['netWgt'] ?? null,
            'Comtrade netWgt',
          ),
          netWeightCanonical: canonicalDecimalValue(
            row['netWgt'] ?? null,
            'Comtrade netWgt',
          ),
          fobValueRawToken: rawNumberToken(
            row['fobvalue'] ?? null,
            'Comtrade fobvalue',
          ),
          cifValueRawToken: rawNumberToken(
            row['cifvalue'] ?? null,
            'Comtrade cifvalue',
          ),
        },
      };
    });
  },
};

export const calibrationAdapters = Object.freeze([
  wdiAdapter,
  wtoAdapter,
  comtradeAdapter,
]);
