import { useMemo, useReducer, useRef, useState } from 'react';

import { LocalMockGoodsTransferTransport } from './mock-transfer-transport.js';
import type {
  EditableTransferField,
  PrototypeTransferReceipt,
  PrototypeTransferScenario,
} from './transfer-contracts.js';
import {
  createInitialTransferFlowState,
  createSubmitEnvelope,
  transferFlowReducer,
} from './transfer-flow.js';

interface GoodsTransferFlowProps {
  readonly onClose: () => void;
  readonly onAuthorizationRevoked: (reason: string) => void;
}

const scenarioOptions: ReadonlyArray<{
  readonly id: PrototypeTransferScenario;
  readonly label: string;
}> = [
  { id: 'COMMITTED', label: 'Final receipt: committed' },
  { id: 'REJECTED', label: 'Final receipt: rejected' },
  { id: 'UNKNOWN_OUTCOME', label: 'Unknown outcome, then find receipt' },
  { id: 'STALE_WORLD_VERSION', label: 'World version expired' },
  { id: 'AUTHORIZATION_REVOKED', label: 'Access revoked before submit' },
];

const stageIndex: Readonly<Record<string, number>> = {
  DRAFT: 0,
  REVIEW: 1,
  PENDING: 2,
  UNKNOWN_OUTCOME: 2,
  LOOKING_UP_RECEIPT: 2,
  STALE_WORLD_VERSION: 1,
  FINAL: 3,
  AUTHORIZATION_REVOKED: 0,
};

function FixedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="transfer-fixed-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  suffix,
  error,
  onChange,
}: {
  readonly id: EditableTransferField;
  readonly label: string;
  readonly value: string;
  readonly suffix: string;
  readonly error: string | undefined;
  readonly onChange: (field: EditableTransferField, value: string) => void;
}) {
  const errorId = `${id}-error`;
  return (
    <label className="transfer-field" htmlFor={id}>
      <span>{label}</span>
      <span className="transfer-input-shell">
        <input
          id={id}
          name={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(id, event.currentTarget.value)}
        />
        <strong>{suffix}</strong>
      </span>
      {error ? (
        <small className="field-error" id={errorId} role="alert">
          {error}
        </small>
      ) : null}
    </label>
  );
}

function ReviewSummary({
  review,
}: {
  readonly review: NonNullable<
    ReturnType<typeof createInitialTransferFlowState>['review']
  >;
}) {
  const { draft } = review;
  return (
    <div className="review-summary">
      <div
        className="review-route"
        aria-label="cross-country goods transfer route"
      >
        <article>
          <span>Seller</span>
          <strong>Northstar Republic</strong>
          <small>{draft.sellerCountryId} · Trade</small>
        </article>
        <span aria-hidden="true">→</span>
        <article>
          <span>Buyer</span>
          <strong>Meridian Republic</strong>
          <small>{draft.buyerCountryId} · Trade + Finance</small>
        </article>
      </div>
      <dl className="review-facts">
        <div>
          <dt>Commodity</dt>
          <dd>{draft.commodityId}</dd>
        </div>
        <div>
          <dt>Quantity</dt>
          <dd>
            {draft.quantity.amount} {draft.quantity.unit}
          </dd>
        </div>
        <div>
          <dt>Unit price</dt>
          <dd>
            {draft.unitPrice.amount} {draft.unitPrice.currency}/
            {draft.unitPrice.perUnit}
          </dd>
        </div>
        <div>
          <dt>Settlement source</dt>
          <dd>{draft.settlementSource}</dd>
        </div>
        <div>
          <dt>Bound version</dt>
          <dd>World v{review.reviewedWorldVersion}</dd>
        </div>
        <div>
          <dt>Idempotency key</dt>
          <dd>{draft.idempotencyKey}</dd>
        </div>
      </dl>
      <p className="review-boundary-note">
        Local review freezes string fields only. It does not calculate a total,
        grant approval, or replace a server fingerprint.
      </p>
    </div>
  );
}

function TransferReceipt({
  receipt,
}: {
  readonly receipt: PrototypeTransferReceipt;
}) {
  return (
    <section
      className={`transfer-receipt transfer-receipt--${receipt.outcome.toLowerCase()}`}
      aria-labelledby="transfer-receipt-title"
      aria-live="polite"
    >
      <div>
        <p className="eyebrow">Mock final receipt</p>
        <h3 id="transfer-receipt-title">
          {receipt.outcome === 'COMMITTED'
            ? 'Local flow received a final committed receipt'
            : 'Local flow received a final rejected receipt'}
        </h3>
      </div>
      <span>{receipt.outcome}</span>
      <dl>
        <div>
          <dt>Command ID</dt>
          <dd>{receipt.commandId}</dd>
        </div>
        <div>
          <dt>World version</dt>
          <dd>
            v{receipt.worldVersionBefore ?? '—'} → v
            {receipt.worldVersionAfter ?? '—'}
          </dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{receipt.reasonCode ?? '—'}</dd>
        </div>
        <div>
          <dt>Events</dt>
          <dd>{receipt.eventIds.length}</dd>
        </div>
      </dl>
      <small>{receipt.commandFingerprint} · PREPARATION_ONLY_NOT_RUNTIME</small>
    </section>
  );
}

export function GoodsTransferFlow({
  onClose,
  onAuthorizationRevoked,
}: GoodsTransferFlowProps) {
  const [flow, dispatch] = useReducer(
    transferFlowReducer,
    undefined,
    createInitialTransferFlowState,
  );
  const [scenario, setScenario] =
    useState<PrototypeTransferScenario>('COMMITTED');
  const transport = useMemo(
    () => new LocalMockGoodsTransferTransport(scenario),
    [scenario],
  );
  const submitInFlight = useRef(false);
  const commandId = 'COMMAND_PROTOTYPE_TRANSFER_002';
  const activeStage = stageIndex[flow.status] ?? 0;

  const editField = (field: EditableTransferField, value: string) => {
    dispatch({ type: 'EDIT_FIELD', field, value });
  };

  const submit = async () => {
    if (submitInFlight.current || flow.status !== 'REVIEW' || !flow.review) {
      return;
    }
    submitInFlight.current = true;
    const envelope = createSubmitEnvelope(flow.review, commandId);
    dispatch({ type: 'SUBMIT_STARTED', commandId });
    try {
      const result = await transport.submit(envelope);
      if (result.kind === 'FINAL') {
        dispatch({ type: 'FINAL_RECEIPT', receipt: result.receipt });
      } else if (result.kind === 'UNKNOWN_OUTCOME') {
        dispatch({ type: 'UNKNOWN_OUTCOME', commandId: result.commandId });
      } else if (result.kind === 'STALE_WORLD_VERSION') {
        dispatch({
          type: 'STALE_WORLD_VERSION',
          currentWorldVersion: result.currentWorldVersion,
        });
      } else {
        dispatch({
          type: 'AUTHORIZATION_REVOKED',
          reason: result.reason,
        });
        onAuthorizationRevoked(result.reason);
      }
    } finally {
      submitInFlight.current = false;
    }
  };

  const lookupReceipt = async () => {
    if (flow.status !== 'UNKNOWN_OUTCOME' || !flow.pendingCommandId) return;
    const lookupCommandId = flow.pendingCommandId;
    dispatch({ type: 'LOOKUP_STARTED' });
    const receipt = await transport.lookupReceipt(lookupCommandId);
    dispatch(
      receipt
        ? { type: 'FINAL_RECEIPT', receipt }
        : { type: 'LOOKUP_NOT_FOUND' },
    );
  };

  return (
    <section
      className="transfer-flow"
      id="mock-transfer-flow"
      aria-labelledby="transfer-flow-title"
    >
      <header className="transfer-flow__header">
        <div>
          <p className="eyebrow">PREPARATION ONLY · LOCAL INTERACTION</p>
          <h2 id="transfer-flow-title">
            Grain transfer: draft to final receipt
          </h2>
          <p>
            A local mock flow with no network access and no World State write.
            Every value and result here is fixture data.
          </p>
        </div>
        <div className="transfer-flow__header-actions">
          <label className="scenario-picker" htmlFor="mock-scenario">
            <span>Local mock scenario</span>
            <select
              id="mock-scenario"
              value={scenario}
              disabled={flow.status === 'PENDING'}
              onChange={(event) =>
                setScenario(
                  event.currentTarget.value as PrototypeTransferScenario,
                )
              }
            >
              {scenarioOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button className="six-text-button" type="button" onClick={onClose}>
            Back to grain network
          </button>
        </div>
      </header>

      <ol className="transfer-progress" aria-label="transfer flow progress">
        {['Draft', 'Review', 'Local handling', 'Final receipt'].map(
          (label, index) => (
            <li
              key={label}
              className={index <= activeStage ? 'is-active' : undefined}
              aria-current={index === activeStage ? 'step' : undefined}
            >
              <span>{index + 1}</span>
              {label}
            </li>
          ),
        )}
      </ol>

      {flow.status === 'DRAFT' && flow.draft ? (
        <form
          className="transfer-stage"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            dispatch({ type: 'REQUEST_REVIEW' });
          }}
        >
          <div className="stage-heading">
            <div>
              <p className="eyebrow">STEP 1 · DRAFT</p>
              <h3>Set two fields. The rest is fixed fixture data.</h3>
            </div>
            <span>World v{flow.draft.expectedWorldVersion}</span>
          </div>
          <div className="transfer-fixed-grid">
            <FixedField label="Seller / office" value="Northstar · Trade" />
            <FixedField
              label="Buyer / offices"
              value="Meridian · Trade + Finance"
            />
            <FixedField label="Commodity / unit" value="GRAIN · tonne" />
            <FixedField
              label="Settlement source"
              value="Buyer Treasury · GCU"
            />
          </div>
          <div className="transfer-fields">
            <Field
              id="quantityAmount"
              label="Transfer quantity"
              value={flow.draft.quantity.amount}
              suffix="tonne"
              error={flow.errors.quantityAmount}
              onChange={editField}
            />
            <Field
              id="unitPriceAmount"
              label="Price per tonne"
              value={flow.draft.unitPrice.amount}
              suffix="GCU"
              error={flow.errors.unitPriceAmount}
              onChange={editField}
            />
          </div>
          {flow.message ? (
            <p className="form-message" role="alert">
              {flow.message}
            </p>
          ) : null}
          <div className="transfer-actions">
            <p>
              No Price × Quantity calculation occurs in the browser. A real Core
              must exact-or-reject.
            </p>
            <button className="primary-button" type="submit">
              Review fields
            </button>
          </div>
        </form>
      ) : null}

      {flow.status === 'REVIEW' && flow.review ? (
        <section className="transfer-stage" aria-labelledby="review-title">
          <div className="stage-heading">
            <div>
              <p className="eyebrow">STEP 2 · REVIEW</p>
              <h3 id="review-title">
                Read the key fields, then make one explicit local submit.
              </h3>
            </div>
            <span>Locally frozen</span>
          </div>
          <ReviewSummary review={flow.review} />
          <div className="transfer-actions transfer-actions--split">
            <button
              className="secondary-button"
              type="button"
              onClick={() => dispatch({ type: 'RETURN_TO_DRAFT' })}
            >
              Back to edit
            </button>
            <button className="primary-button" type="button" onClick={submit}>
              Submit to local mock
            </button>
          </div>
        </section>
      ) : null}

      {flow.status === 'PENDING' ? (
        <section className="transfer-stage transfer-state" aria-live="polite">
          <span className="pending-spinner" aria-hidden="true" />
          <div>
            <p className="eyebrow">STEP 3 · PENDING</p>
            <h3>
              Submission is frozen while the local mock returns a final result.
            </h3>
            <p>{flow.message}</p>
            <small>{flow.pendingCommandId} · duplicate submit disabled</small>
          </div>
        </section>
      ) : null}

      {flow.status === 'UNKNOWN_OUTCOME' ||
      flow.status === 'LOOKING_UP_RECEIPT' ? (
        <section className="transfer-stage transfer-state transfer-state--warning">
          <span aria-hidden="true">?</span>
          <div>
            <p className="eyebrow">RECOVERY · UNKNOWN OUTCOME</p>
            <h3>Do not resend. Look up the final receipt by command ID.</h3>
            <p>{flow.message}</p>
            <button
              className="primary-button"
              type="button"
              disabled={flow.status === 'LOOKING_UP_RECEIPT'}
              onClick={lookupReceipt}
            >
              {flow.status === 'LOOKING_UP_RECEIPT'
                ? 'Looking up receipt…'
                : 'Look up this command ID'}
            </button>
          </div>
        </section>
      ) : null}

      {flow.status === 'STALE_WORLD_VERSION' ? (
        <section className="transfer-stage transfer-state transfer-state--warning">
          <span aria-hidden="true">↻</span>
          <div>
            <p className="eyebrow">RECOVERY · STALE VERSION</p>
            <h3>The World version changed. The old review cannot continue.</h3>
            <p>{flow.message}</p>
            <button
              className="primary-button"
              type="button"
              onClick={() => dispatch({ type: 'REOPEN_AFTER_STALE' })}
            >
              Return to draft and review again
            </button>
          </div>
        </section>
      ) : null}

      {flow.status === 'FINAL' && flow.receipt ? (
        <section className="transfer-stage">
          <TransferReceipt receipt={flow.receipt} />
          <div className="transfer-actions">
            <p>
              The final state is a mock receipt. It never writes back to the
              World projection.
            </p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => dispatch({ type: 'RESET' })}
            >
              New local draft
            </button>
          </div>
        </section>
      ) : null}

      {flow.status === 'AUTHORIZATION_REVOKED' ? (
        <section
          className="transfer-stage transfer-state transfer-state--danger"
          role="alert"
        >
          <span aria-hidden="true">×</span>
          <div>
            <p className="eyebrow">ACCESS REVOKED</p>
            <h3>Office-private draft and review data were cleared.</h3>
            <p>{flow.message}</p>
          </div>
        </section>
      ) : null}
    </section>
  );
}
