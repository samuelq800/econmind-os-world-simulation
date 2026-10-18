import type { OfficialExplorerCountry } from './official-explorer-country-types.js';
import type { PreviewLocale } from '../world-preview/locale.js';

/** Display source decimal tokens verbatim; never rebuild them from JS numbers. */
export function ExactOfficialValue({
  data,
  path,
  showUnit = false,
  locale = 'zh',
}: {
  data: OfficialExplorerCountry;
  path: string;
  showUnit?: boolean;
  locale?: PreviewLocale;
}) {
  const source = data.officialSource;
  const field = source?.fields?.[path];
  const dataset = field && source?.datasets?.[field.dataset];
  const missing =
    locale === 'en' ? 'Exact source value unavailable' : '精确值缺失';
  if (
    !field ||
    !dataset ||
    typeof field.exact !== 'string' ||
    !/^-?\d+(?:\.\d+)?$/.test(field.exact)
  )
    return (
      <span data-source-field={path} data-source-missing="true">
        {missing}
      </span>
    );
  return (
    <span
      data-source-field={path}
      title={`${field.dataset} / ${field.rowId} / ${field.field}; ${field.sourcePointer}; raw=${field.rawToken}; ${dataset.sha256}; ${field.unit}; ${field.unitBasis}; ${field.nature}`}
    >
      {field.exact}
      {showUnit &&
        ` ${
          field.unit === 'UNIT_NOT_SPECIFIED_IN_SOURCE'
            ? locale === 'en'
              ? '(unit not specified in source)'
              : '（源未注明单位）'
            : field.unit
        }`}
    </span>
  );
}

export function OfficialSourceDetails({
  data,
  prefix = '',
  paths,
  locale = 'zh',
}: {
  data: OfficialExplorerCountry;
  prefix?: string;
  paths?: readonly string[];
  locale?: PreviewLocale;
}) {
  const source = data.officialSource;
  const en = locale === 'en';
  return (
    <details className="official-source-details">
      <summary>
        {en
          ? 'Sources & version · Field records'
          : '数字来源与版本 · 展开逐字段详情'}
      </summary>
      <p>
        STATIC_BASELINE · proposalFieldsAreExecuted:false · liveWorldState:false
      </p>
      <p>
        {en ? 'Country dataset SHA256' : 'countries SHA256'}:{' '}
        {data.source.countriesSha256}
      </p>
      <p>
        {en ? 'This country file SHA256' : '本国文件 SHA256'}:{' '}
        {data.source.countryFileSha256}
      </p>
      <p>
        {en
          ? 'Original decimal tokens and source units. No live settlement.'
          : '数值保留源十进制原文；以下详情可用触屏或键盘展开，不换算时间单位。'}
      </p>
      {Object.entries(source?.fields ?? {})
        .filter(
          ([path]) =>
            path.startsWith(prefix) && (!paths || paths.includes(path)),
        )
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
                  source?.datasets?.[field.dataset]?.sha256 ??
                    (en ? 'Source hash unavailable' : '来源hash缺失'),
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
