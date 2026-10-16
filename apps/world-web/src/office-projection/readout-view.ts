import type { OfficeProjectionModel } from './model.js';
import { economicAvailabilityMessages } from './model.js';
import { renderCurrentFinancialPosition } from './financial-position-view.js';

/** The same parsed readback in both private drawers. No new field source,
 * balance calculation, FX conversion, rounding or authority is introduced. */
export function renderOfficeReadout(
  document: Document,
  model: OfficeProjectionModel,
): HTMLElement {
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Exact authorized World readback');
  const node = (tag: string, text: string) => {
    const el = document.createElement(tag);
    el.textContent = text;
    return el;
  };
  const source = document.createElement('details');
  source.append(
    node(
      'summary',
      `Source head · World v${model.head.worldVersion} / event ${model.head.eventSequence}`,
    ),
  );
  const provenance = document.createElement('dl');
  provenance.append(node('dt', 'source'), node('dd', model.source));
  for (const [key, value] of Object.entries(model.head))
    provenance.append(node('dt', key), node('dd', value));
  source.append(provenance);
  section.append(
    source,
    renderCurrentFinancialPosition(document, model.currentFinancialPosition),
    node('h3', 'Net Posting movement / activity'),
  );
  const fields = document.createElement('dl');
  fields.setAttribute('aria-label', 'Exact authorized projection values');
  for (const field of model.readouts)
    fields.append(
      node('dt', field.label),
      node('dd', `${field.canonicalValue} ${field.unit}`),
    );
  section.append(fields);
  for (const message of economicAvailabilityMessages(
    model.economicAvailability,
  ))
    section.append(node('p', message));
  if (
    model.economicAvailability.financial === 'AVAILABLE' &&
    model.readouts.length === 1
  )
    section.append(
      node(
        'p',
        'No authorized financial movement entries. This is not a zero or spendable balance.',
      ),
    );
  return section;
}
