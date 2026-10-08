import type { DecisionResultView } from './decision-result.js';

/** Existing drawer surface only. No HTML interpolation or local result inference. */
export function renderDecisionResult(
  document: Document,
  model: DecisionResultView,
): HTMLElement {
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Last committed decision');
  const node = (tag: string, text: string) => {
    const el = document.createElement(tag);
    el.textContent = text;
    return el;
  };
  section.append(node('h3', 'Last committed decision'));
  const result = model.result;
  if (!result || !result.cause) {
    section.append(
      node(
        'p',
        model.availability === 'NOT_AUTHORIZED'
          ? 'Private result · NOT_AUTHORIZED'
          : `Unavailable · ${model.reason}`,
      ),
    );
    return section;
  }
  const pending = result.businessState === 'PLAN_PENDING';
  section.append(
    node(
      'p',
      pending
        ? 'Plan committed · Matching pending'
        : result.businessState === 'MATCH_SETTLED'
          ? 'Matching settled · Partial result'
          : 'Committed · Applied',
    ),
  );
  if (model.availability === 'PARTIAL')
    section.append(node('p', 'Previous state not supplied'));
  const table = document.createElement('table');
  table.append(
    node('caption', 'Committed event changes · Not current balances'),
  );
  const header = document.createElement('tr');
  for (const label of ['Result', 'Before', 'Change', 'After']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    header.append(th);
  }
  const thead = document.createElement('thead');
  thead.append(header);
  const tbody = document.createElement('tbody');
  const labels: Record<string, string> = {
    CB_GOVERNMENT_SECURITIES: 'Government securities',
    CB_COMMERCIAL_BANK_RESERVES: 'Commercial bank reserves',
    'SOCIAL.matched': 'Matched',
    'SOCIAL.remainingUnemployed': 'Remaining unemployed',
    'SOCIAL.remainingVacancies': 'Remaining vacancies',
    'SOCIAL.remainingFreeServiceSlots': 'Remaining service slots',
  };
  for (const metric of result.metrics) {
    const tr = document.createElement('tr'),
      th = document.createElement('th');
    th.scope = 'row';
    th.textContent =
      labels[metric.key] ??
      metric.key
        .replace('POLITICAL_CAPITAL.', '')
        .replaceAll('_', ' ')
        .toLowerCase();
    tr.append(th);
    for (const value of [metric.before, metric.delta, metric.after])
      tr.append(
        node('td', value === null ? 'Not supplied' : `${value} ${metric.unit}`),
      );
    tbody.append(tr);
  }
  table.append(thead, tbody);
  section.append(table);
  const source = document.createElement('details'),
    fields = document.createElement('dl');
  source.append(node('summary', 'Result source'));
  const cause = result.cause;
  for (const [label, value] of [
    ['Source', result.source!],
    ['Semantics', result.semantics],
    [
      'Publication head',
      `World v${result.sourceHead.worldVersion} / event ${result.sourceHead.eventSequence}`,
    ],
    ['World', result.sourceHead.worldId],
    ['Command', cause.commandId],
    ['Command fingerprint', cause.commandFingerprint],
    ['Event', cause.eventId],
    ['Event fingerprint', cause.eventFingerprint],
    ['Event type', cause.eventType],
    ['Event sequence', cause.eventSequence],
    [
      'Result version',
      `${cause.worldVersionBefore} → ${cause.worldVersionAfter}`,
    ],
    ['Simulation ticks', cause.simTime],
    ...(cause.planCommandId ? [['Plan command', cause.planCommandId]] : []),
    ...(result.reason ? [['Partial reason', result.reason]] : []),
  ])
    fields.append(node('dt', label!), node('dd', value!));
  source.append(fields);
  section.append(source);
  return section;
}
