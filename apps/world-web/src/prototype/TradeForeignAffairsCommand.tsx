import { useState } from 'react';

import type { PrototypeWorldBriefProjection } from './contracts.js';

type TradePhase = 'SCAN' | 'OFFERS' | 'ASSEMBLE' | 'REVIEW' | 'RECORDED';
type TradeOfferId = 'TARSIS_FAST' | 'MERIDIAN_STABLE' | 'ASTER_CHEAP';

interface TradeForeignAffairsCommandProps {
  readonly projection: PrototypeWorldBriefProjection;
  readonly onNotice: (notice: string) => void;
}

interface TradeOffer {
  readonly id: TradeOfferId;
  readonly partner: string;
  readonly label: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly freightPerUnit: number;
  readonly insurancePerUnit: number;
  readonly tariffRate: number;
  readonly arrivalDay: number;
  readonly detail: string;
  readonly risk: string;
  readonly port: string;
}

const DAILY_DEMAND = 800;
const CURRENT_COVER_DAYS = 11;
const TARGET_COVER_DAYS = 21;
const REQUIRED_UNITS = (TARGET_COVER_DAYS - CURRENT_COVER_DAYS) * DAILY_DEMAND;
const QUOTA_REMAINING = 10_200;
const COMMODITY = 'Standardised semiconductor units';

const TRADE_OFFERS: readonly TradeOffer[] = [
  {
    id: 'TARSIS_FAST',
    partner: 'Tarsis Union',
    label: 'Fast cover',
    quantity: 2_400,
    unitPrice: 146,
    freightPerUnit: 12,
    insurancePerUnit: 2,
    tariffRate: 0.02,
    arrivalDay: 7,
    detail:
      'First cargo reaches Northstar before the production clock expires.',
    risk: 'Higher unit cost. Keeps the first bridge open.',
    port: 'Tarsis → Northstar · Day 7',
  },
  {
    id: 'MERIDIAN_STABLE',
    partner: 'Meridian Compact',
    label: 'Stable follow-on',
    quantity: 5_600,
    unitPrice: 130,
    freightPerUnit: 8,
    insurancePerUnit: 1.5,
    tariffRate: 0.04,
    arrivalDay: 12,
    detail: 'The main cargo is priced for a scheduled second port call.',
    risk: 'Arrives safely only after an earlier bridge cargo lands.',
    port: 'Meridian → Northstar · Day 12',
  },
  {
    id: 'ASTER_CHEAP',
    partner: 'Aster Republic',
    label: 'Lowest quote',
    quantity: 8_000,
    unitPrice: 120,
    freightPerUnit: 7,
    insurancePerUnit: 1,
    tariffRate: 0.06,
    arrivalDay: 16,
    detail: 'The cheapest full cover is waiting behind a long ocean window.',
    risk: 'Price wins only if Northstar can survive until Day 16.',
    port: 'Aster → Northstar · Day 16',
  },
];

function formatUnits(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatGcu(value: number): string {
  return `${(value / 1_000_000).toFixed(2)}m GCU`;
}

function landedCost(offer: TradeOffer): number {
  const customsValue = offer.quantity * offer.unitPrice;
  return (
    customsValue +
    offer.quantity * (offer.freightPerUnit + offer.insurancePerUnit) +
    customsValue * offer.tariffRate
  );
}

function offerClass(offer: TradeOffer): string {
  if (offer.id === 'TARSIS_FAST') return 'is-fast';
  if (offer.id === 'MERIDIAN_STABLE') return 'is-stable';
  return 'is-cheap';
}

export function TradeForeignAffairsCommand({
  projection,
  onNotice,
}: TradeForeignAffairsCommandProps) {
  const [desk, setDesk] = useState(78);
  const [phase, setPhase] = useState<TradePhase>('SCAN');
  const [corridorScanned, setCorridorScanned] = useState(false);
  const [selectedOfferIds, setSelectedOfferIds] = useState<
    readonly TradeOfferId[]
  >([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [replay, setReplay] = useState<readonly string[]>([
    'Foreign desk opened · local corridor rehearsal',
  ]);

  const selectedOffers = TRADE_OFFERS.filter((offer) =>
    selectedOfferIds.includes(offer.id),
  );
  const selectedQuantity = selectedOffers.reduce(
    (total, offer) => total + offer.quantity,
    0,
  );
  const totalLandedCost = selectedOffers.reduce(
    (total, offer) => total + landedCost(offer),
    0,
  );
  const tariffCost = selectedOffers.reduce(
    (total, offer) =>
      total + offer.quantity * offer.unitPrice * offer.tariffRate,
    0,
  );
  const proposedCoverDays =
    CURRENT_COVER_DAYS + selectedQuantity / DAILY_DEMAND;
  const remainingQuota = QUOTA_REMAINING - selectedQuantity;
  const orderedOffers = [...selectedOffers].sort(
    (left, right) => left.arrivalDay - right.arrivalDay,
  );

  let routeCoverageAtArrival = CURRENT_COVER_DAYS;
  let lateOffer: TradeOffer | null = null;
  for (const offer of orderedOffers) {
    if (offer.arrivalDay > routeCoverageAtArrival && !lateOffer) {
      lateOffer = offer;
    }
    routeCoverageAtArrival += offer.quantity / DAILY_DEMAND;
  }

  const quantityGap = Math.max(REQUIRED_UNITS - selectedQuantity, 0);
  const routeHasEnoughGoods = selectedQuantity >= REQUIRED_UNITS;
  const routeIsDiversified = selectedOffers.length >= 2;
  const quotaAvailable = remainingQuota >= 0;
  const canOpenReview =
    routeHasEnoughGoods && routeIsDiversified && quotaAvailable && !lateOffer;
  const recorded = phase === 'RECORDED';
  const progress = recorded
    ? 5
    : canOpenReview
      ? 4
      : selectedOffers.length
        ? 3
        : phase === 'ASSEMBLE'
          ? 2
          : corridorScanned
            ? 1
            : 0;

  const addReplay = (entry: string) => {
    setReplay((current) => [entry, ...current].slice(0, 4));
  };

  const scanCorridor = () => {
    if (corridorScanned || recorded) return;
    setCorridorScanned(true);
    setPhase('OFFERS');
    addReplay(
      `Semiconductor corridor scanned · ${CURRENT_COVER_DAYS} days of cover before a production stop`,
    );
    onNotice(
      'Corridor read. Partner offers can now be opened in this local rehearsal.',
    );
  };

  const openOfferBoard = () => {
    if (!corridorScanned || recorded) return;
    setPhase('ASSEMBLE');
    addReplay(
      'Offer board opened · every quote includes price, tariff, port, and arrival day',
    );
    onNotice(
      'Offer board opened. Build a route that arrives before Northstar runs dry.',
    );
  };

  const toggleOffer = (offer: TradeOffer) => {
    if (recorded) return;
    const included = selectedOfferIds.includes(offer.id);
    const next = included
      ? selectedOfferIds.filter((id) => id !== offer.id)
      : [...selectedOfferIds, offer.id];
    setSelectedOfferIds(next);
    setPhase('ASSEMBLE');
    setReviewOpen(false);
    addReplay(
      `${offer.partner} ${included ? 'removed from' : 'added to'} the local import route`,
    );
  };

  const rebuildTwoPortRoute = () => {
    setSelectedOfferIds(['TARSIS_FAST', 'MERIDIAN_STABLE']);
    setPhase('ASSEMBLE');
    setReviewOpen(false);
    addReplay(
      'Two-port route rebuilt · fast bridge paired with scheduled follow-on cargo',
    );
    onNotice(
      'Two-port route staged locally. Recheck the delivery chain before recording it.',
    );
  };

  const openReview = () => {
    if (!canOpenReview || recorded) return;
    setPhase('REVIEW');
    setReviewOpen(true);
    addReplay(
      'Counteroffer review opened · goods, FX demand, tariff and delivery are visible',
    );
    onNotice(
      'Counteroffer review opened. This is still a local Trade rehearsal.',
    );
  };

  const recordCorridor = () => {
    if (!canOpenReview || !reviewOpen || recorded) return;
    setPhase('RECORDED');
    addReplay(
      `Corridor route recorded locally · ${formatUnits(selectedQuantity)} units / ${formatGcu(totalLandedCost)} landed cost`,
    );
    onNotice(
      'Local corridor route recorded. No order, shipment, FX payment, tariff receipt, or contract was submitted.',
    );
  };

  const openNextDesk = () => {
    setDesk((current) => current + 1);
    setPhase('SCAN');
    setCorridorScanned(false);
    setSelectedOfferIds([]);
    setReviewOpen(false);
    addReplay(`Desk ${desk + 1} opened · local corridor draft cleared`);
    onNotice(`Local Trade desk ${desk + 1} opened. No world state changed.`);
  };

  const loopStepClass = (step: number) => {
    if (progress >= step) return 'is-complete';
    if (progress + 1 === step) return 'is-current';
    return undefined;
  };

  return (
    <section className="trade-command" aria-labelledby="trade-command-title">
      <header className="trade-command__header">
        <div>
          <p>TRADE &amp; FOREIGN AFFAIRS · NORTHSTAR · DESK {desk}</p>
          <h1 id="trade-command-title">Keep the corridor alive.</h1>
          <span>
            Price matters. Arrival matters first. Turn a foreign quote into a
            route the country can actually carry.
          </span>
        </div>
        <dl className="trade-command__hud" aria-label="Current corridor state">
          <div>
            <dt>Production cover</dt>
            <dd>{CURRENT_COVER_DAYS} days</dd>
          </div>
          <div>
            <dt>Import gap</dt>
            <dd>{formatUnits(REQUIRED_UNITS)} units</dd>
          </div>
          <div>
            <dt>Quota free</dt>
            <dd>{formatUnits(QUOTA_REMAINING)}</dd>
          </div>
        </dl>
      </header>

      <section
        className="trade-command__loop"
        aria-label="Trade route mission loop"
      >
        {[
          'Read shortage',
          'Open offers',
          'Build route',
          'Verify arrival',
          'Record route',
        ].map((label, index) => (
          <span className={loopStepClass(index + 1)} key={label}>
            <b>0{index + 1}</b> {label}
          </span>
        ))}
        <strong>{progress} / 5 mission steps</strong>
      </section>

      <div className="trade-command__board">
        <section
          className="trade-corridor"
          aria-labelledby="trade-corridor-title"
        >
          <header>
            <div>
              <p>SUPPLY LINE · {COMMODITY.toUpperCase()}</p>
              <h2 id="trade-corridor-title">The clock is in the cargo.</h2>
            </div>
            <span>
              {selectedOffers.length ? 'LOCAL ROUTE VIEW' : 'READ THE LINE'}
            </span>
          </header>
          <p>
            Northstar consumes {formatUnits(DAILY_DEMAND)} units each day. Goods
            count only after a delivery is confirmed; a cheap shipment that
            arrives late does not save the line.
          </p>
          <div
            className="trade-corridor__map"
            aria-label="Local import corridor preview"
          >
            <div className="trade-corridor__horizon">
              <span>Production cut · Day {CURRENT_COVER_DAYS + 1}</span>
            </div>
            <article className="trade-corridor__northstar">
              <span>NORTHSTAR</span>
              <strong>{CURRENT_COVER_DAYS} DAYS</strong>
              <small>Current semiconductor cover</small>
            </article>
            <div className="trade-corridor__lanes">
              {TRADE_OFFERS.map((offer) => {
                const selected = selectedOfferIds.includes(offer.id);
                return (
                  <span
                    className={`${offerClass(offer)}${selected ? ' is-selected' : ''}`}
                    key={offer.id}
                  >
                    <b>{offer.partner}</b>
                    <small>Day {offer.arrivalDay}</small>
                  </span>
                );
              })}
            </div>
            <div
              className="trade-corridor__ports"
              aria-label="Selected shipment schedule"
            >
              {orderedOffers.length ? (
                orderedOffers.map((offer) => (
                  <span key={offer.id}>
                    <b>D{offer.arrivalDay}</b> {offer.partner} ·{' '}
                    {formatUnits(offer.quantity)} units
                  </span>
                ))
              ) : (
                <span>No foreign cargo held in this local draft.</span>
              )}
            </div>
          </div>
          <dl className="trade-corridor__facts">
            <div>
              <dt>Before</dt>
              <dd>{CURRENT_COVER_DAYS} days</dd>
            </div>
            <div>
              <dt>Proposed</dt>
              <dd>{proposedCoverDays.toFixed(0)} days</dd>
            </div>
            <div>
              <dt>Difference</dt>
              <dd>
                {selectedQuantity
                  ? `+${(selectedQuantity / DAILY_DEMAND).toFixed(0)} days`
                  : 'No cargo staged'}
              </dd>
            </div>
          </dl>
          {!corridorScanned ? (
            <button
              className="trade-button trade-button--primary"
              type="button"
              onClick={scanCorridor}
            >
              Read semiconductor corridor
            </button>
          ) : (
            <span className="trade-corridor__read">
              Shortage mapped · offer routes unlocked.
            </span>
          )}
        </section>

        <section
          className="trade-mission"
          aria-labelledby="trade-mission-title"
        >
          <header>
            <div>
              <p>FOREIGN DESK · IMPORT ROUTE</p>
              <h2 id="trade-mission-title">Semiconductor bridge</h2>
            </div>
            <span>TRADE OWNS TERMS</span>
          </header>
          <dl className="trade-mission__brief">
            <div>
              <dt>Domestic burn</dt>
              <dd>{formatUnits(DAILY_DEMAND)} / day</dd>
            </div>
            <div>
              <dt>Target cover</dt>
              <dd>{TARGET_COVER_DAYS} days</dd>
            </div>
            <div>
              <dt>Settlement</dt>
              <dd>Commercial FX</dd>
            </div>
          </dl>

          {!corridorScanned ? (
            <div className="trade-mission__lock">
              <strong>Supply line unread.</strong>
              <span>
                Trade cannot compare a foreign quote before seeing when domestic
                production runs out.
              </span>
            </div>
          ) : null}

          {corridorScanned && phase === 'OFFERS' ? (
            <button
              className="trade-button trade-button--primary"
              type="button"
              onClick={openOfferBoard}
            >
              Open partner offer board
            </button>
          ) : null}

          {phase === 'ASSEMBLE' || phase === 'REVIEW' ? (
            <div
              className="trade-offer-board"
              aria-label="Partner import offers"
            >
              <div className="trade-offer-board__heading">
                <div>
                  <p>LIVE QUOTE CARDS · LOCAL DRAFT</p>
                  <strong>Build the landing sequence.</strong>
                </div>
                <span>{projection.seasonDayLabel}</span>
              </div>
              <div className="trade-offer-grid">
                {TRADE_OFFERS.map((offer) => {
                  const selected = selectedOfferIds.includes(offer.id);
                  const total = landedCost(offer);
                  return (
                    <button
                      aria-pressed={selected}
                      className={`trade-offer-card ${offerClass(offer)}${selected ? ' is-selected' : ''}`}
                      key={offer.id}
                      type="button"
                      onClick={() => toggleOffer(offer)}
                    >
                      <span>
                        {selected ? 'IN ROUTE' : offer.label.toUpperCase()}
                      </span>
                      <strong>{offer.partner}</strong>
                      <b>{formatUnits(offer.quantity)} units</b>
                      <small>
                        {formatGcu(total)} landed · {offer.arrivalDay} days ·{' '}
                        {(offer.tariffRate * 100).toFixed(0)}% tariff
                      </small>
                      <em>{offer.detail}</em>
                    </button>
                  );
                })}
              </div>
              <div className="trade-route__totals">
                <span>
                  Secured cargo{' '}
                  <b>
                    {formatUnits(selectedQuantity)} /{' '}
                    {formatUnits(REQUIRED_UNITS)} units
                  </b>
                </span>
                <span
                  className={remainingQuota < 0 ? 'is-warning' : 'is-ready'}
                >
                  {remainingQuota < 0
                    ? `${formatUnits(Math.abs(remainingQuota))} units above quota`
                    : `${formatUnits(remainingQuota)} quota remains`}
                </span>
              </div>

              {selectedOffers.length ? (
                <section
                  className="trade-route__consequences"
                  aria-label="Route consequences"
                >
                  <span>
                    <b>Landed cost</b> {formatGcu(totalLandedCost)}
                  </span>
                  <span>
                    <b>Tariff line</b> {formatGcu(tariffCost)}
                  </span>
                  <span>
                    <b>Coverage</b> {proposedCoverDays.toFixed(0)} days if every
                    leg lands
                  </span>
                </section>
              ) : null}

              {selectedOffers.length && !canOpenReview ? (
                <div className="trade-route__blocker">
                  <strong>Route cannot be sent yet.</strong>
                  <span>
                    {lateOffer
                      ? `${lateOffer.partner} reaches Northstar on Day ${lateOffer.arrivalDay}, after the route's available cover runs out.`
                      : !quotaAvailable
                        ? 'The selected cargo exceeds the remaining import quota.'
                        : !routeIsDiversified
                          ? 'One port is not enough for a critical semiconductor line. Build a second route.'
                          : `Secure ${formatUnits(quantityGap)} more units to reach the ${TARGET_COVER_DAYS}-day cover target.`}
                  </span>
                  <button
                    className="trade-button"
                    type="button"
                    onClick={rebuildTwoPortRoute}
                  >
                    Rebuild the two-port route
                  </button>
                </div>
              ) : null}

              {canOpenReview && !reviewOpen ? (
                <button
                  className="trade-button trade-button--primary"
                  type="button"
                  onClick={openReview}
                >
                  Open counteroffer review
                </button>
              ) : null}

              {reviewOpen ? (
                <section
                  className="trade-publish-review"
                  aria-label="Local counteroffer review"
                >
                  <p>COUNTEROFFER REVIEW · LOCAL ONLY</p>
                  <h3>What this route would create</h3>
                  <ul>
                    <li>
                      {formatUnits(selectedQuantity)} {COMMODITY.toLowerCase()}{' '}
                      held as offer capacity; inventory changes only after
                      confirmed delivery.
                    </li>
                    <li>
                      {formatGcu(totalLandedCost)} commercial payment obligation
                      through FX demand; it does not draw official reserves.
                    </li>
                    <li>
                      {orderedOffers.map((offer) => offer.port).join(' · ')}{' '}
                      shipment intents, with no shipment record issued yet.
                    </li>
                  </ul>
                  <button
                    className="trade-button trade-button--primary"
                    type="button"
                    onClick={recordCorridor}
                  >
                    Record local corridor route
                  </button>
                </section>
              ) : null}
            </div>
          ) : null}

          {recorded ? (
            <div className="trade-mission__success">
              <strong>Corridor route recorded for this rehearsal.</strong>
              <span>
                Goods, payment, tariff, and delivery remain separate; no
                authoritative trade command was sent.
              </span>
              <button
                className="trade-button trade-button--primary"
                type="button"
                onClick={openNextDesk}
              >
                Open next foreign desk
              </button>
            </div>
          ) : null}
        </section>
      </div>

      <section
        className="trade-command__ledger"
        aria-labelledby="trade-ledger-title"
      >
        <article>
          <p>ROUTE CONSEQUENCES</p>
          <h2>Every port makes a different promise.</h2>
          <div className="trade-consequence-grid">
            <span>
              <b>Goods</b> A quoted cargo is not inventory. Delivery is the
              moment supply becomes usable.
            </span>
            <span>
              <b>Money</b> Commercial imports create FX demand, not an automatic
              draw on official reserves.
            </span>
            <span>
              <b>Authority</b> Industry reads the need; Trade negotiates the
              external terms and route.
            </span>
          </div>
        </article>
        <article>
          <p>FOREIGN DESK REPLAY</p>
          <h2 id="trade-ledger-title">What this desk changed.</h2>
          <ol>
            {replay.map((entry, index) => (
              <li key={`${index}-${entry}`}>{entry}</li>
            ))}
          </ol>
          <small>
            Local rehearsal only · no order, shipment, payment, tariff receipt,
            negotiation, or contract is submitted.
          </small>
        </article>
      </section>
    </section>
  );
}
