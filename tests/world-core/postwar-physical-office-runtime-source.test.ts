/** Small closed-boundary unit vectors only. Actual c427 source/quantity/country
 * regression runs via tools/office-connection/postwar-physical-office-reference.mjs;
 * ordinary unit tests create no full-seed DB and no signing key. */
import { describe, expect, it } from 'vitest';
import type { AuthorizedOfficeContext } from '@econmind/core';
import {
  createPostwarPhysicalOfficeRuntimeSource,
  readPostwarPhysicalOfficeApiFrom,
  consumePostwarPhysicalOfficeRuntimeSourceFrom,
  type PostwarPhysicalOffice,
  type PostwarPhysicalOfficeRuntimeSource,
} from '../../apps/world-worker/src/persistence/postwar-physical-office-runtime-source.js';
import type { PostwarPhysicalSourceContext } from '../../apps/world-worker/src/preparation/postwar-physical-service-receipt.js';

const fakeContext = { source: {} } as unknown as PostwarPhysicalSourceContext;
const scope = {
  worldId: 'WORLD_PHYSICAL_SOURCE_UNIT',
  countryId: 'COUNTRY_01',
  officeId: 'INDUSTRY' as const,
};
describe('physical office source closed boundary unit vectors', () => {
  it('rejects fabricated source contexts and never broadens this adapter to Finance/CB', () => {
    expect(() =>
      createPostwarPhysicalOfficeRuntimeSource({
        scope,
        sourceContext: fakeContext,
        authorizationPublisherRole: 'unit_publisher',
        runtimeReaderRole: 'unit_offline_reader',
      }),
    ).toThrow('actual server source');
    for (const officeId of ['FINANCE', 'CENTRAL_BANK', 'SOCIAL'])
      expect(() =>
        createPostwarPhysicalOfficeRuntimeSource({
          scope: { ...scope, officeId: officeId as PostwarPhysicalOffice },
          sourceContext: fakeContext,
          authorizationPublisherRole: 'unit_publisher',
          runtimeReaderRole: 'unit_offline_reader',
        }),
      ).toThrow('unsupported office');
  });
  it('rejects caller-created ports before querying SQL or consuming a caller DTO', async () => {
    let touched = false;
    const query = async () => {
      touched = true;
      throw Error('MUST_NOT_QUERY');
    };
    await expect(
      readPostwarPhysicalOfficeApiFrom({
        executor: { query },
        authorization: {} as AuthorizedOfficeContext,
        source: {
          withSourceFrom: async () => {
            touched = true;
            throw Error('MUST_NOT_CONSUME');
          },
        },
      }),
    ).rejects.toThrow('fixed server source port');
    expect(touched).toBe(false);
  });
  it('does not treat saved JSON metadata as a held source capability', () => {
    const source = {
      schemaVersion: 'postwar-physical-office-runtime-source-v1',
      status: 'ADMITTED_OPENING_AT_H0',
    } as PostwarPhysicalOfficeRuntimeSource;
    expect(() =>
      consumePostwarPhysicalOfficeRuntimeSourceFrom(
        {
          query: async () => {
            throw Error('MUST_NOT_QUERY');
          },
        },
        source,
      ),
    ).toThrow('scope expired');
  });
});
