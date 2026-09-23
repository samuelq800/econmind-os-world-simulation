import { describe, expect, it } from 'vitest';

import { DOMAIN_ERROR_CODES, officeId } from '@econmind/core';

import {
  V101_AUTHORIZATION_PROJECTION_FIXTURE_STATUS,
  createV101AuthorizationProjectionFixture,
} from './v101-authorization-projection-fixture.js';

describe('V10.1 test-only authorization projections', () => {
  it('derives Country, Office, and Negotiation views at the authoritative watermark', async () => {
    const fixture = createV101AuthorizationProjectionFixture();
    const projection = fixture.rebuild();

    expect(fixture.status).toBe(V101_AUTHORIZATION_PROJECTION_FIXTURE_STATUS);
    expect(fixture.authoritative.fixtureStatus).toBe(
      'TEST_ONLY_NON_AUTHORITATIVE',
    );
    expect(projection.watermark).toEqual({
      worldId: 'WORLD_TRANSFER_TEST',
      worldVersion: '0',
      eventSequence: '0',
    });
    const country = await fixture.query({
      principal: fixture.principals.sellerTrade,
      scope: {
        classification: 'COUNTRY',
        worldId: fixture.authoritative.watermark.worldId,
        countryId: fixture.authoritative.countries[0]!.countryId,
      },
    });
    const office = await fixture.query({
      principal: fixture.principals.buyerTrade,
      scope: {
        classification: 'OFFICE_PRIVATE',
        worldId: fixture.authoritative.watermark.worldId,
        countryId: fixture.authoritative.countries[1]!.countryId,
        officeId: officeId('FINANCE'),
      },
    });
    const negotiation = await fixture.query({
      principal: fixture.principals.sellerTrade,
      scope: {
        classification: 'NEGOTIATION_PARTY',
        worldId: fixture.authoritative.watermark.worldId,
        partyId: 'PARTY_V101_BILATERAL_TEST',
      },
    });

    expect(country).toMatchObject({
      kind: 'COUNTRY',
      countryId: 'COUNTRY_SELLER_TEST',
      watermark: projection.watermark,
    });
    expect(office).toMatchObject({
      kind: 'OFFICE_PRIVATE',
      countryId: 'COUNTRY_BUYER_TEST',
      officeId: 'FINANCE',
      watermark: projection.watermark,
    });
    expect(negotiation).toMatchObject({
      kind: 'NEGOTIATION_PARTY',
      partyId: 'PARTY_V101_BILATERAL_TEST',
      participantCountryIds: ['COUNTRY_SELLER_TEST', 'COUNTRY_BUYER_TEST'],
      watermark: projection.watermark,
    });
  });

  it('fails closed for forged Country, Office, and Negotiation scopes', async () => {
    const fixture = createV101AuthorizationProjectionFixture();
    fixture.rebuild();
    for (const scope of [
      {
        classification: 'COUNTRY' as const,
        worldId: fixture.authoritative.watermark.worldId,
        countryId: fixture.authoritative.countries[1]!.countryId,
      },
      {
        classification: 'OFFICE_PRIVATE' as const,
        worldId: fixture.authoritative.watermark.worldId,
        countryId: fixture.authoritative.countries[0]!.countryId,
        officeId: officeId('FINANCE'),
      },
      {
        classification: 'NEGOTIATION_PARTY' as const,
        worldId: fixture.authoritative.watermark.worldId,
        partyId: 'PARTY_V101_FORGED_TEST',
      },
    ]) {
      await expect(
        fixture.query({ principal: fixture.principals.sellerTrade, scope }),
      ).rejects.toMatchObject({
        code: DOMAIN_ERROR_CODES.PROJECTION_ACCESS_DENIED,
      });
    }
  });

  it('rebuilds a deleted projection from the same authoritative watermark', async () => {
    const fixture = createV101AuthorizationProjectionFixture();
    const first = fixture.rebuild();
    fixture.deleteProjection();

    expect(fixture.hasProjection()).toBe(false);
    await expect(
      fixture.query({
        principal: fixture.principals.sellerTrade,
        scope: {
          classification: 'COUNTRY',
          worldId: fixture.authoritative.watermark.worldId,
          countryId: fixture.authoritative.countries[0]!.countryId,
        },
      }),
    ).rejects.toThrow('V101_AUTHORIZATION_PROJECTION_NOT_MATERIALIZED');

    const rebuilt = fixture.rebuild();
    expect(rebuilt).toEqual(first);
    expect(rebuilt).not.toBe(first);
    expect(rebuilt.watermark).toEqual(fixture.authoritative.watermark);
  });

  it('keeps projection lifecycle independent from authoritative state', () => {
    const fixture = createV101AuthorizationProjectionFixture();
    const authoritative = fixture.authoritative;
    const first = fixture.rebuild();
    fixture.deleteProjection();

    expect(fixture.authoritative).toBe(authoritative);
    expect(fixture.authoritative).toEqual(authoritative);
    expect(fixture.readProjection()).toBeNull();

    const rebuilt = fixture.rebuild();
    expect(rebuilt).toEqual(first);
    expect(rebuilt.countries).not.toBe(first.countries);
    expect(rebuilt.offices).not.toBe(first.offices);
    expect(rebuilt.negotiationParties).not.toBe(first.negotiationParties);
  });
});
