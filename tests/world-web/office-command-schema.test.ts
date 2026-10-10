import { describe, expect, it } from 'vitest';
import { readAuthenticatedPostgresFinalCommandReceipt } from '../../apps/world-api/src/integration/postgres-final-receipt-reader.js';
import { parseSupabaseAuthSubject } from '../../apps/world-api/src/integration/identity.js';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import { officeCommandFixture } from './office-command-fixture.js';
import { publishedDecisionFixture } from '../support/office-decision-result-consumer-fixture.js';

describe('actual existing SQL receipt serializer / classified projector / bounded TEST_ONLY vectors', () => {
  it.each(['captain', 'central_bank', 'social'] as const)(
    'existing FINAL schema consumes %s command identity without a new endpoint',
    async (role) => {
      const f = officeCommandFixture(role),
        identity = {
          worldId: f.request.request.worldId,
          commandId: f.request.request.commandId,
          idempotencyKey: f.request.request.idempotencyKey,
        };
      const row = {
        receipt_world_id: identity.worldId,
        receipt_command_id: identity.commandId,
        receipt_idempotency_key: identity.idempotencyKey,
        receipt_schema_version: 'command-receipt-v2',
        receipt_command_fingerprint: f.f.lookup.commandFingerprint,
        outcome: 'COMMITTED',
        reason_code: null,
        transition_id: identity.commandId,
        world_version_before: '2',
        world_version_after: '3',
        sim_time: '10000',
        event_ids: ['TEST_EVENT'],
        recorded_at_real: '2026-10-10T00:00:00.000Z',
        submission_world_id: identity.worldId,
        submission_command_id: identity.commandId,
        submission_idempotency_key: identity.idempotencyKey,
        submission_command_fingerprint: f.f.lookup.commandFingerprint,
        submission_auth_subject: f.f.config.identity.authSubjectId,
        submission_country_id: f.f.config.identity.countryId,
        submission_office_id: f.f.config.identity.officeId,
      };
      // Executes the actual generic authenticated SQL reader/serializer. The row
      // executor is TEST_ONLY, NOT a database/JWT/current-seat/production proof.
      const receipt = await readAuthenticatedPostgresFinalCommandReceipt({
        identity,
        authSubject: parseSupabaseAuthSubject(
          f.f.config.identity.authSubjectId,
        ),
        executor: {
          query: async (request) => {
            expect(request.text).toContain('current_commit_authorization');
            expect(request.values).toEqual([
              ...Object.values(identity),
              f.f.config.identity.authSubjectId,
            ]);
            return { rows: [row] };
          },
        },
      });
      expect(receipt?.schemaVersion).toBe('command-receipt-v2');
      f.reads(async (input, init) => {
        const response = await f.f.fetcher(input, init);
        if (
          new URL(String(input)).pathname !==
          f.f.config.endpoints.finalLookupPath
        )
          return response;
        const envelope = (await response.json()) as {
          result: { receipt: unknown };
        };
        envelope.result.receipt = receipt;
        return Response.json(envelope);
      });
      const c = createOfficeCommandController(f.binding, () => f.binding.view, {
        fetcher: f.fetcher,
        requestId: () => f.request.requestId,
      });
      await c.refresh();
      expect(c.stage(f.request)).toBe(true);
      c.review();
      await c.confirm();
      await c.lookupAndRefresh();
      expect(c.getState()).toMatchObject({
        status: 'FINAL_VERIFIED',
        receipt: { schemaVersion: 'command-receipt-v2', outcome: 'COMMITTED' },
        completion: false,
      });
      c.disconnect();
    },
  );
  it.each(['captain', 'central_bank'] as const)(
    'completion requires actual %s projector causality, not just any visible result',
    async (role) => {
      const published = await publishedDecisionFixture(role),
        data = await published.domainDto();
      const f = officeCommandFixture(role),
        result = published.projected()!;
      if (!result.cause) throw Error('TEST_ONLY expected actual kernel result');
      const identity = published.config.identity;
      const read = {
        ...published.config,
        getAccessToken: f.f.config.getAccessToken,
      };
      const original = f.request;
      const request = {
        ...original,
        request: {
          ...original.request,
          worldId: identity.worldId,
          countryId: identity.countryId,
          commandId: result.cause.commandId,
          idempotencyKey: `IDEM_${result.cause.commandId}`,
          expectedWorldVersion: data.watermark.worldVersion,
        },
      };
      const acknowledgement = {
        status: 'FINALIZED',
        source: 'EXISTING',
        commandType: request.request.commandType,
        commandId: request.request.commandId,
        commandFingerprint: result.cause.commandFingerprint,
        submitted: false,
        queued: true,
      };
      let wrong = false;
      const fetcher: typeof fetch = async (input, init) => {
        const body = JSON.parse(String(init?.body)) as { requestId: string };
        if (new URL(String(input)).pathname === f.endpoint.path)
          return Response.json({
            schemaVersion: request.schemaVersion,
            requestId: request.requestId,
            ok: true,
            state: acknowledgement,
          });
        const wire = structuredClone(data);
        if (wrong)
          (
            wire.payload as { decisionResult: { cause: { commandId: string } } }
          ).decisionResult.cause.commandId = 'OTHER_COMMAND';
        const authority = {
          source: 'SERVER_VERIFIED_READ_BINDING',
          capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
          identity,
          seatRef: read.seatRef,
          seatState: 'ACTIVE',
          seed: {
            worldId: read.world.worldId,
            seedRef: read.world.seedRef,
            contentHash: read.world.contentHash,
            admissionRef: read.world.admissionRef,
          },
          readback: {
            worldId: read.world.worldId,
            seedRef: read.world.seedRef,
            contentHash: read.world.contentHash,
            admissionRef: read.world.admissionRef,
            worldVersion: data.watermark.worldVersion,
            eventSequence: data.watermark.eventSequence,
            readbackRef: 'TEST_READBACK',
          },
        };
        return Response.json({
          schemaVersion: 'world-authorized-read-binding-v1',
          requestId: body.requestId,
          ok: true,
          authority,
          result:
            new URL(String(input)).pathname === read.endpoints.finalLookupPath
              ? {
                  schemaVersion: 'world-final-receipt-read-v1',
                  requestId: body.requestId,
                  ok: true,
                  receipt: {
                    source: 'DURABLE_FINAL_COMMAND_RECEIPT',
                    worldId: identity.worldId,
                    commandId: request.request.commandId,
                    idempotencyKey: request.request.idempotencyKey,
                    commandFingerprint: acknowledgement.commandFingerprint,
                    outcome: 'COMMITTED',
                    reasonCode: null,
                    worldVersionAfter: result.cause!.worldVersionAfter,
                    eventIds: [result.cause!.eventId],
                    recordedAtReal: '2026-10-10T00:00:00.000Z',
                  },
                }
              : {
                  schemaVersion: 'world-read-api-v1',
                  requestId: body.requestId,
                  ok: true,
                  data: wire,
                },
        });
      };
      const c = createOfficeCommandController(
        { read, view: published.binding.view, endpoint: f.endpoint },
        () => published.binding.view,
        { fetcher, requestId: () => request.requestId },
      );
      await c.refresh();
      expect(c.stage(request)).toBe(true);
      c.review();
      await c.confirm();
      expect(c.getState()).toMatchObject({
        status: 'QUEUE_ACK',
        completion: false,
      });
      await c.lookupAndRefresh();
      expect(c.getState()).toMatchObject({
        status: 'FINAL_VERIFIED',
        completion: true,
      });
      wrong = true;
      await c.lookupAndRefresh();
      expect(c.getState().completion).toBe(false);
      c.disconnect();
      published.invalidate();
    },
  );
});
