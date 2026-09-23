import { useState } from 'react';

import type { PrototypeWorldBriefProjection } from './contracts.js';

type RateChoiceId = 'HOLD' | 'TIGHTEN_25' | 'TIGHTEN_50';
type GuidanceId =
  'DATA_DEPENDENT' | 'INFLATION_DEPENDENT' | 'EXPECT_TIGHTENING';

interface CentralBankGovernorProps {
  readonly projection: PrototypeWorldBriefProjection;
  readonly onNotice: (notice: string) => void;
}

interface RateChoice {
  readonly id: RateChoiceId;
  readonly changeBp: number;
  readonly label: string;
  readonly shortLabel: string;
  readonly consequence: string;
  readonly prompt: string;
  readonly impacts: readonly PolicyImpact[];
}

interface PolicyImpact {
  readonly id: 'PRICE' | 'CREDIT' | 'FX';
  readonly label: string;
  readonly state: string;
  readonly detail: string;
  readonly tone: 'red' | 'amber' | 'blue';
}

interface GuidanceChoice {
  readonly id: GuidanceId;
  readonly label: string;
  readonly detail: string;
}

const RATE_CHOICES: readonly RateChoice[] = [
  {
    id: 'HOLD',
    changeBp: 0,
    label: 'Hold the rate',
    shortLabel: 'HOLD',
    consequence: 'Keeps the current signal while the next price print arrives.',
    prompt: 'Wait for another reading',
    impacts: [
      {
        id: 'PRICE',
        label: 'Price signal',
        state: 'Pressure stays live',
        detail: 'No stronger anchor enters this meeting.',
        tone: 'red',
      },
      {
        id: 'CREDIT',
        label: 'Credit stance',
        state: 'No new drag',
        detail: 'Borrowing conditions keep their current signal.',
        tone: 'amber',
      },
      {
        id: 'FX',
        label: 'GCU demand',
        state: 'Neutral signal',
        detail: 'No rate-led support is added to the currency.',
        tone: 'blue',
      },
    ],
  },
  {
    id: 'TIGHTEN_25',
    changeBp: 25,
    label: 'Tighten 25 bp',
    shortLabel: '+25 BP',
    consequence: 'Raises the policy signal with a measured credit trade-off.',
    prompt: 'Lean against prices',
    impacts: [
      {
        id: 'PRICE',
        label: 'Price signal',
        state: 'Anchor strengthens',
        detail: 'The meeting adds a measured anti-inflation signal.',
        tone: 'red',
      },
      {
        id: 'CREDIT',
        label: 'Credit stance',
        state: 'Slightly tighter',
        detail: 'New credit conditions face a modest headwind.',
        tone: 'amber',
      },
      {
        id: 'FX',
        label: 'GCU demand',
        state: 'Mild support',
        detail: 'The rate signal may support demand for GCU assets.',
        tone: 'blue',
      },
    ],
  },
  {
    id: 'TIGHTEN_50',
    changeBp: 50,
    label: 'Tighten 50 bp',
    shortLabel: '+50 BP',
    consequence:
      'Makes a stronger price-stability signal at a larger credit cost.',
    prompt: 'Defend the target',
    impacts: [
      {
        id: 'PRICE',
        label: 'Price signal',
        state: 'Anchor hardens',
        detail: 'The meeting sends a stronger anti-inflation signal.',
        tone: 'red',
      },
      {
        id: 'CREDIT',
        label: 'Credit stance',
        state: 'Clearly tighter',
        detail: 'New lending conditions face a larger headwind.',
        tone: 'amber',
      },
      {
        id: 'FX',
        label: 'GCU demand',
        state: 'Stronger support',
        detail: 'The rate signal may increase demand for GCU assets.',
        tone: 'blue',
      },
    ],
  },
];

const WAITING_IMPACTS: readonly PolicyImpact[] = [
  {
    id: 'PRICE',
    label: 'Price signal',
    state: 'Choose a path',
    detail: 'A policy card reveals the price trade-off.',
    tone: 'red',
  },
  {
    id: 'CREDIT',
    label: 'Credit stance',
    state: 'Choose a path',
    detail: 'A policy card reveals the credit trade-off.',
    tone: 'amber',
  },
  {
    id: 'FX',
    label: 'GCU demand',
    state: 'Choose a path',
    detail: 'A policy card reveals the FX trade-off.',
    tone: 'blue',
  },
];

const GUIDANCE_CHOICES: readonly GuidanceChoice[] = [
  {
    id: 'DATA_DEPENDENT',
    label: 'Data dependent',
    detail: 'Wait for the next inflation and credit readings.',
  },
  {
    id: 'INFLATION_DEPENDENT',
    label: 'Inflation dependent',
    detail: 'Keep price convergence as the condition for the next move.',
  },
  {
    id: 'EXPECT_TIGHTENING',
    label: 'Expect further tightening',
    detail: 'Signal that rates may rise again if price pressure holds.',
  },
];

function metricValue(
  projection: PrototypeWorldBriefProjection,
  metricId: string,
  fallback: number,
): number {
  const metric = projection.metrics.find((item) => item.id === metricId);
  const parsed = metric ? Number(metric.displayValue) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatRate(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function CentralBankGovernor({
  projection,
  onNotice,
}: CentralBankGovernorProps) {
  const [meeting, setMeeting] = useState(12);
  const [policyRate, setPolicyRate] = useState(4.25);
  const [meetingBaseRate, setMeetingBaseRate] = useState(4.25);
  const [signalRead, setSignalRead] = useState(false);
  const [rateChoiceId, setRateChoiceId] = useState<RateChoiceId | null>(null);
  const [guidanceId, setGuidanceId] = useState<GuidanceId | null>(null);
  const [published, setPublished] = useState(false);
  const [log, setLog] = useState<readonly string[]>([
    'Meeting chamber opened · local policy rehearsal',
  ]);

  const inflation = metricValue(projection, 'inflation', 6.4);
  const expectedInflation = 5.8;
  const inflationTarget = 3;
  const toleranceBand = 1.5;
  const inflationGap = inflation - inflationTarget;
  const selectedRate = RATE_CHOICES.find(
    (choice) => choice.id === rateChoiceId,
  );
  const proposedRate = meetingBaseRate + (selectedRate?.changeBp ?? 0) / 100;
  const realPolicyRate = proposedRate - expectedInflation;
  const selectedGuidance = GUIDANCE_CHOICES.find(
    (choice) => choice.id === guidanceId,
  );
  const policyImpacts = selectedRate?.impacts ?? WAITING_IMPACTS;
  const progress = published
    ? 4
    : guidanceId
      ? 3
      : rateChoiceId
        ? 2
        : signalRead
          ? 1
          : 0;

  const addLog = (entry: string) => {
    setLog((current) => [entry, ...current].slice(0, 4));
  };

  const readSignal = () => {
    if (signalRead) return;
    setSignalRead(true);
    addLog(
      `Price signal read · inflation ${inflation.toFixed(1)}% is ${inflationGap.toFixed(1)} pp above target`,
    );
    onNotice(
      'Price signal read. Select a policy-rate path for the local meeting.',
    );
  };

  const chooseRate = (choice: RateChoice) => {
    if (!signalRead || published) return;
    setRateChoiceId(choice.id);
    setGuidanceId(null);
    addLog(
      `${choice.label} staged · proposed rate ${formatRate(meetingBaseRate + choice.changeBp / 100)}`,
    );
    onNotice(
      `${choice.label} staged locally. Choose the guidance before publication.`,
    );
  };

  const chooseGuidance = (choice: GuidanceChoice) => {
    if (!rateChoiceId || published) return;
    setGuidanceId(choice.id);
    addLog(`Guidance selected · ${choice.label}`);
    onNotice('Guidance set. The local policy statement can now be issued.');
  };

  const publishDecision = () => {
    if (!selectedRate || !selectedGuidance || published) return;
    setPublished(true);
    setPolicyRate(proposedRate);
    addLog(
      `Local decision issued · ${formatRate(proposedRate)} / ${selectedGuidance.label}`,
    );
    onNotice(
      `Local policy statement issued at ${formatRate(proposedRate)}. No World State changed.`,
    );
  };

  const openNextMeeting = () => {
    setMeeting((current) => current + 1);
    setSignalRead(false);
    setRateChoiceId(null);
    setGuidanceId(null);
    setPublished(false);
    setMeetingBaseRate(policyRate);
    addLog(
      `Meeting ${meeting + 1} opened · policy session reset for rehearsal`,
    );
    onNotice(`Local meeting ${meeting + 1} opened. No World State changed.`);
  };

  return (
    <section
      className="central-bank-command"
      aria-labelledby="central-bank-title"
    >
      <header className="central-bank-command__header">
        <div>
          <p>CENTRAL BANK · POLICY MEETING {meeting}</p>
          <h1 id="central-bank-title">Monetary policy chamber</h1>
          <span>Read the pressure. Set the signal. Own the consequences.</span>
        </div>
        <dl
          className="central-bank-command__hud"
          aria-label="Current policy state"
        >
          <div>
            <dt>Inflation</dt>
            <dd>{inflation.toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Target</dt>
            <dd>{inflationTarget.toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Policy rate</dt>
            <dd>{formatRate(policyRate)}</dd>
          </div>
        </dl>
      </header>

      <section
        className="central-bank-command__loop"
        aria-label="Monetary policy meeting loop"
      >
        {[
          'Read price pressure',
          'Set rate path',
          'Choose guidance',
          'Issue statement',
        ].map((label, index) => {
          const step = index + 1;
          return (
            <span
              className={
                progress >= step
                  ? 'is-complete'
                  : progress + 1 === step
                    ? 'is-current'
                    : undefined
              }
              key={label}
            >
              <b>0{step}</b>
              {label}
            </span>
          );
        })}
        <strong>{progress} / 4 meeting steps</strong>
      </section>

      <div className="central-bank-command__board">
        <section
          className="central-bank-signal"
          aria-labelledby="price-signal-title"
        >
          <div className="central-bank-signal__heading">
            <div>
              <p>PRICE SIGNAL</p>
              <h2 id="price-signal-title">The target is under pressure.</h2>
            </div>
            <span>LOCAL READ</span>
          </div>
          <div
            className="central-bank-signal__dial"
            aria-label="Inflation 6.4 percent against a 3 percent target"
          >
            <div>
              <span>Inflation</span>
              <strong>{inflation.toFixed(1)}%</strong>
              <small>target {inflationTarget.toFixed(1)}%</small>
            </div>
          </div>
          <div
            className="central-bank-signal__track"
            aria-label="Inflation target range"
          >
            <span className="central-bank-signal__track-target" />
            <i className="central-bank-signal__track-current" />
            <small>
              Target band {formatRate(inflationTarget - toleranceBand)} to{' '}
              {formatRate(inflationTarget + toleranceBand)}
            </small>
          </div>
          <dl className="central-bank-signal__facts">
            <div>
              <dt>Inflation gap</dt>
              <dd>+{inflationGap.toFixed(1)} pp</dd>
            </div>
            <div>
              <dt>Expected inflation</dt>
              <dd>{expectedInflation.toFixed(1)}%</dd>
            </div>
            <div>
              <dt>Short-term market</dt>
              <dd>4.70%</dd>
            </div>
          </dl>
          {!signalRead ? (
            <button
              className="central-bank-button central-bank-button--primary"
              type="button"
              onClick={readSignal}
            >
              Read the price signal
            </button>
          ) : (
            <span className="central-bank-signal__confirmed">
              Price signal recorded for this meeting.
            </span>
          )}
        </section>

        <section
          className="central-bank-decision"
          aria-labelledby="policy-decision-title"
        >
          <header>
            <div>
              <p>POLICY DECISION</p>
              <h2 id="policy-decision-title">Set the policy signal.</h2>
            </div>
            <span>CB AUTHORITY</span>
          </header>
          <div className="central-bank-decision__rule">
            <strong>Independent decision</strong>
            <span>
              Captain is notified after publication; cannot edit the rate.
            </span>
          </div>
          <div
            className="central-bank-rate-grid"
            role="group"
            aria-label="Policy rate choices"
          >
            {RATE_CHOICES.map((choice) => (
              <button
                aria-pressed={rateChoiceId === choice.id}
                className={
                  rateChoiceId === choice.id ? 'is-selected' : undefined
                }
                disabled={!signalRead || published}
                key={choice.id}
                type="button"
                onClick={() => chooseRate(choice)}
              >
                <small>{choice.shortLabel}</small>
                <strong>{choice.label}</strong>
                <span>
                  {formatRate(meetingBaseRate + choice.changeBp / 100)}
                </span>
                <em>{choice.prompt}</em>
              </button>
            ))}
          </div>
          <section
            className={`central-bank-impact-board${selectedRate ? ' is-active' : ''}`}
            aria-live="polite"
            aria-label="Policy move consequence preview"
          >
            <header>
              <div>
                <p>MOVE PREVIEW</p>
                <h3>
                  {selectedRate
                    ? `${selectedRate.shortLabel} policy card staged`
                    : 'Choose a policy card'}
                </h3>
              </div>
              <span>MODEL READ</span>
            </header>
            <div className="central-bank-impact-board__tracks">
              {policyImpacts.map((impact) => (
                <article className={`is-${impact.tone}`} key={impact.id}>
                  <span>{impact.label}</span>
                  <strong>{impact.state}</strong>
                  <small>{impact.detail}</small>
                </article>
              ))}
            </div>
            <p>
              {selectedRate
                ? 'Card staged. You can still change the path before issuing the statement.'
                : 'Pick one path to reveal what the meeting is trading off.'}
            </p>
          </section>
          {rateChoiceId ? (
            <div
              className="central-bank-guidance"
              role="group"
              aria-label="Forward guidance choices"
            >
              <p>Forward guidance</p>
              {GUIDANCE_CHOICES.map((choice) => (
                <button
                  aria-pressed={guidanceId === choice.id}
                  className={
                    guidanceId === choice.id ? 'is-selected' : undefined
                  }
                  disabled={published}
                  key={choice.id}
                  type="button"
                  onClick={() => chooseGuidance(choice)}
                >
                  <strong>{choice.label}</strong>
                  <span>{choice.detail}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="central-bank-decision__lock">
              Read the signal before choosing a rate path.
            </p>
          )}
          <dl
            className="central-bank-decision__calculator"
            aria-label="Pre-publication calculations"
          >
            <div>
              <dt>Proposed rate</dt>
              <dd>{formatRate(proposedRate)}</dd>
            </div>
            <div>
              <dt>Real policy rate</dt>
              <dd>{formatRate(realPolicyRate)}</dd>
            </div>
            <div>
              <dt>Transmission</dt>
              <dd>
                {selectedRate
                  ? selectedRate.consequence
                  : 'Rate path not selected'}
              </dd>
            </div>
          </dl>
          {!published ? (
            <button
              className="central-bank-button central-bank-button--primary"
              disabled={!selectedRate || !selectedGuidance}
              type="button"
              onClick={publishDecision}
            >
              Issue local policy statement
            </button>
          ) : (
            <div className="central-bank-decision__issued">
              <strong>Statement issued locally.</strong>
              <span>
                {formatRate(policyRate)} · {selectedGuidance?.label}
              </span>
              <button
                className="central-bank-button central-bank-button--primary"
                type="button"
                onClick={openNextMeeting}
              >
                Open next meeting
              </button>
            </div>
          )}
        </section>
      </div>

      <section
        className="central-bank-command__ledger"
        aria-label="Monetary policy context"
      >
        <article>
          <p>LEDGER GUARDRAIL</p>
          <h2>Rates are not a balance-sheet shortcut.</h2>
          <span>
            OMO, FX intervention, and emergency liquidity require their own
            ledger route.
          </span>
        </article>
        <article>
          <p>MEETING REPLAY</p>
          <h2>Every signal leaves a trace.</h2>
          <ol>
            {log.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ol>
          <small>
            Local rehearsal only · no monetary decision is submitted.
          </small>
        </article>
      </section>
    </section>
  );
}
