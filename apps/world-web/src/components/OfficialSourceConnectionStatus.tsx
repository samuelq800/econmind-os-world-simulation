import { useState, useSyncExternalStore } from 'react';
import type { SyntheticEvent } from 'react';
import {
  createOfficialSourceStatusSession,
  type OfficialSourceConnectionState,
} from '../official-data/official-source-status-catalog.js';
import {
  SOURCE_DOSSIER_OFFICES,
  sourceDossierCountry,
  sourceDossierHref,
  type SourceDossierOffice,
} from '../official-data/official-source-status-dossier.js';
import '../official-data/official-source-status-view.css';

const labels: Record<OfficialSourceConnectionState['kind'], string> = {
  NOT_CONFIGURED: '官方来源未配置',
  LOADING: '正在核对来源目录…',
  SELECTED_SOURCE_CATALOG_VERIFIED: '34 份来源目录身份已核对',
  UNAVAILABLE: '官方来源连接不可用',
};

export function OfficialSourceConnectionPanel({
  state,
  countryNumber = '01',
}: {
  readonly state: OfficialSourceConnectionState;
  readonly countryNumber?: string | null;
}) {
  const [country, setCountry] = useState(countryNumber);
  const syncCountry = () =>
    setCountry(sourceDossierCountry(window.location.search));
  const syncLink = (
    event: SyntheticEvent<HTMLAnchorElement>,
    office: SourceDossierOffice,
  ) => {
    const current = sourceDossierCountry(window.location.search);
    const href = sourceDossierHref(office, current);
    if (!href) {
      event.preventDefault();
      event.currentTarget.removeAttribute('href');
    } else event.currentTarget.href = href;
    setCountry(current);
  };
  return (
    <section
      className="official-source-connection"
      data-source-connection={state.kind}
      aria-label="官方来源连接"
    >
      <details onToggle={syncCountry}>
        <summary>
          <strong role="status" aria-live="polite">
            {labels[state.kind]}
          </strong>
          <span>来源，非实时 World</span>
          <span className="official-source-connection__more">
            来源说明与职位入口
          </span>
        </summary>
        <div className="official-source-connection__detail">
          <p>
            地图数字仍来自锁定的官方静态文件。目录身份核对不验证全部原始字节，也不代表经济状态刷新或世界已启动。
          </p>
          <p>
            <a href="./official-map-source/">
              官方地图与原件目录（203 份文件）
            </a>
          </p>
          <p>
            {country
              ? `国家 ${country} · 未选国家时使用默认 01。进入职位国家页面后，使用 ◈ 来源按钮查看 dossiers。`
              : '国家参数无效，请回到地图选择国家。'}
          </p>
          <nav aria-label="六职位页面及来源入口">
            {SOURCE_DOSSIER_OFFICES.map(([office, label]) => (
              <a
                key={office}
                href={sourceDossierHref(office, country)}
                aria-disabled={country === null || undefined}
                onFocus={(event) => syncLink(event, office)}
                onPointerDown={(event) => syncLink(event, office)}
                onClick={(event) => syncLink(event, office)}
              >
                {label} 页面
              </a>
            ))}
          </nav>
        </div>
      </details>
    </section>
  );
}

export function OfficialSourceConnectionStatus() {
  const [session] = useState(() =>
    createOfficialSourceStatusSession(
      (window as Window & { __ECONMIND_WORLD_READ_CONFIG__?: unknown })
        .__ECONMIND_WORLD_READ_CONFIG__,
    ),
  );
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  return (
    <OfficialSourceConnectionPanel
      state={state}
      countryNumber={sourceDossierCountry(window.location.search)}
    />
  );
}
