import type { ReactNode } from 'react';

export type OfficialSourceView =
  | { readonly kind: 'NOT_CONNECTED' }
  | { readonly kind: 'LOADING' }
  | { readonly kind: 'UNAVAILABLE' }
  | { readonly kind: 'INVALID' }
  | { readonly kind: 'EMPTY'; readonly dataset: string }
  | {
      readonly kind: 'SOURCE';
      readonly dataset: string;
      readonly rowCount: number;
    };

/** Display-only prewire for the selected-source API. It deliberately has no
 * numeric fallback and never presents source rows as a running World. */
export function OfficialSourceStatus({
  view,
  onRetry,
}: {
  readonly view: OfficialSourceView;
  readonly onRetry?: () => void;
}): ReactNode {
  const isError = view.kind === 'UNAVAILABLE' || view.kind === 'INVALID';
  const messages: Record<OfficialSourceView['kind'], string> = {
    NOT_CONNECTED: 'Source not connected',
    LOADING: 'Reading source…',
    UNAVAILABLE: 'Source unavailable',
    INVALID: 'Source check failed',
    EMPTY: 'No source row here',
    SOURCE: 'Source records ready',
  };

  return (
    <section
      aria-label="Official source status"
      aria-live="polite"
      data-source-state={view.kind}
    >
      <span>OFFICIAL SOURCE · NOT LIVE</span>
      <strong role={isError ? 'alert' : undefined}>
        {messages[view.kind]}
      </strong>
      {view.kind === 'SOURCE' && <span>{view.rowCount} source records</span>}
      {isError && onRetry && (
        <button type="button" onClick={onRetry}>
          Retry read
        </button>
      )}
    </section>
  );
}
