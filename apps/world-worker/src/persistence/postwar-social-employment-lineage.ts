/** Pure replay of every country's actual protected prefix. This is derived
 * data, never source admission/currentness or an authorization issuer. */
import {
  SOCIAL_POSITION_OFFER_CREATED_EVENT,
  SOCIAL_SERVICE_PLAN_EVENT,
  SOCIAL_JOB_MATCH_EVENT,
  PRODUCTION_SETTLED_EVENT_TYPE,
  createSocialPositionOfferLifecycleState,
  reduceSocialPositionOfferCreatedEvent,
  reduceSocialEmploymentServiceEvent,
  canonicalSerialize,
  type SocialPositionOfferLifecycleState,
  type SocialEmploymentServiceState,
  type ReplayReducerEvent,
  type AuthoritativeEvent,
} from '@econmind/core';
import { createHash } from 'node:crypto';
import {
  validatePostwarSocialEmploymentStateDocument,
  type PostwarSocialEmploymentStateDocument,
} from '../preparation/postwar-social-employment-state.js';
import type { ValidatedCanonicalLineageData } from './validated-canonical-lineage.js';
const digest = (v: string) => createHash('sha256').update(v).digest('hex');
const noDirectWrite = new Set([
  'CAPTAIN_POLITICAL_CAPITAL_ALLOCATED_V1',
  'CENTRAL_BANK_OMO_SETTLED_V1',
  'NARROW_TREASURY_GCU_RESERVED_V1',
  'NARROW_TREASURY_GCU_SHIPPED_V1',
  'NARROW_TREASURY_GCU_DELIVERED_V1',
  PRODUCTION_SETTLED_EVENT_TYPE,
]);
function invalid(reason: string): never {
  throw Error(`POSTWAR_SOCIAL_LINEAGE:${reason}`);
}
export interface SocialOfferCommittedOrigin {
  readonly positionId: string;
  readonly eventId: string;
  readonly payloadHash: string;
  readonly pointer: '/offer';
  readonly fromSimTime: string;
  readonly fromHead: Readonly<{ worldVersion: string; eventSequence: string }>;
}
export interface SocialEmploymentLifecycleCheckpoint {
  readonly eventId: string;
  readonly countryId: string;
  readonly beforeEmployment: SocialEmploymentServiceState;
  readonly afterEmployment: SocialEmploymentServiceState;
}
export function replayPostwarSocialEmploymentLineage(input: {
  readonly document: PostwarSocialEmploymentStateDocument;
  readonly lineage: Readonly<ValidatedCanonicalLineageData>;
}) {
  const document = validatePostwarSocialEmploymentStateDocument(input.document),
    { lineage } = input;
  if (
    document.inputs.worldId !== lineage.worldId ||
    document.inputs.seedId !== lineage.seed.seedId
  )
    invalid('actual source World/seed mismatch');
  const countries = new Map(
    document.countries.map((c) => [
      c.countryId,
      {
        countryId: c.countryId,
        lifecycle: createSocialPositionOfferLifecycleState(c.state, c.offers),
        offerOrigins: [] as SocialOfferCommittedOrigin[],
      },
    ]),
  );
  const checkpoints: SocialEmploymentLifecycleCheckpoint[] = [];
  for (const entry of lineage.transitions)
    for (const event of entry.transition.events) {
      if (event.correctsEventId !== null)
        invalid('unsupported source correction');
      if (noDirectWrite.has(event.eventType)) continue;
      if (
        ![
          SOCIAL_POSITION_OFFER_CREATED_EVENT,
          SOCIAL_SERVICE_PLAN_EVENT,
          SOCIAL_JOB_MATCH_EVENT,
        ].includes(event.eventType)
      )
        invalid(`unsupported canonical source event ${event.eventType}`);
      const country = countries.get(entry.command.countryId ?? '');
      if (!country) invalid('canonical source country absent');
      const payload: unknown = JSON.parse(event.canonicalPayload);
      const replayEvent: ReplayReducerEvent = {
        transitionId: entry.command.commandId,
        worldId: event.worldId,
        eventId: event.eventId,
        causationCommandId: event.causationCommandId,
        correctsEventId: event.correctsEventId,
        eventType: event.eventType,
        sequence: event.sequence,
        worldVersionBefore: entry.transition.worldVersionBefore,
        worldVersionAfter: entry.transition.worldVersionAfter,
        simTime: event.simTime,
        payload,
      };
      const beforeEmployment = country.lifecycle.employment;
      if (event.eventType === SOCIAL_POSITION_OFFER_CREATED_EVENT) {
        country.lifecycle = reduceSocialPositionOfferCreatedEvent({
          state: country.lifecycle,
          event: replayEvent,
          sha256Hex: digest,
        });
        const offer = (payload as { offer: { positionId: string } }).offer;
        country.offerOrigins.push({
          positionId: offer.positionId,
          eventId: event.eventId,
          payloadHash: event.payloadHash,
          pointer: '/offer',
          fromSimTime: event.simTime.toCanonicalValue(),
          fromHead: {
            worldVersion: event.worldVersion,
            eventSequence: event.sequence,
          },
        });
        checkpoints.push({
          eventId: event.eventId,
          countryId: country.countryId,
          beforeEmployment,
          afterEmployment: country.lifecycle.employment,
        });
      } else {
        const employment = reduceSocialEmploymentServiceEvent({
          state: beforeEmployment,
          event: replayEvent,
          sha256Hex: digest,
        });
        country.lifecycle = Object.freeze({ ...country.lifecycle, employment });
      }
    }
  return Object.freeze({
    classification: 'FULL_PREFIX_REPLAY_DATA_NOT_AUTHORITY' as const,
    countries: Object.freeze(
      [...countries.values()].map((c) =>
        Object.freeze({ ...c, offerOrigins: Object.freeze(c.offerOrigins) }),
      ),
    ),
    checkpoints: Object.freeze(checkpoints),
  });
}
/** Only the actual lineage Event can supply this offer original. Full lifecycle
 * replay is performed independently above; this check never accepts a DTO flag. */
export function assertSocialPositionOfferEventOriginal(input: {
  readonly lineage: Readonly<ValidatedCanonicalLineageData>;
  readonly eventId: string;
  readonly payloadHash: string;
  readonly pointer: string;
  readonly value: unknown;
  readonly countryId: string;
}): Readonly<AuthoritativeEvent> {
  const matches = input.lineage.transitions
    .flatMap((entry) =>
      entry.transition.events.map((event) => ({
        event,
        command: entry.command,
      })),
    )
    .filter(({ event }) => event.eventId === input.eventId);
  if (matches.length !== 1)
    invalid('committed event original absent or ambiguous');
  const { event, command } = matches[0]!;
  if (
    event.eventType !== SOCIAL_POSITION_OFFER_CREATED_EVENT ||
    event.correctsEventId !== null ||
    command.countryId !== input.countryId ||
    event.payloadHash !== input.payloadHash ||
    input.pointer !== '/offer'
  )
    invalid('unsupported event source binding');
  const payload: unknown = JSON.parse(event.canonicalPayload);
  if (
    canonicalSerialize((payload as { offer: unknown }).offer) !==
    canonicalSerialize(input.value)
  )
    invalid('offer differs from actual committed event payload');
  return event;
}
export type PostwarSocialCountryLifecycle = Readonly<{
  countryId: string;
  lifecycle: SocialPositionOfferLifecycleState;
  offerOrigins: readonly SocialOfferCommittedOrigin[];
}>;
