/** Browser DATA/transport tests only; no source adoption or economic acceptance. */
import { describe, expect, it, vi } from 'vitest';
import { parseSocialLabourProgrammeCreateIntent } from '@econmind/core';
import {
  SOCIAL_PROGRAMMES_DATASET,
  SOCIAL_PROGRAMMES_NATURE,
  parseSocialProgrammeTermsDto,
  parseSocialProgrammeRowDto,
} from '@econmind/core/social-labour-programme-public-contract';
import {
  renderSocialProgrammeForm,
  buildSocialProgrammeRequest,
  buildSocialProgrammeApplicationRequest,
} from '../../apps/world-web/src/social-employment/programme-form.js';
import {
  createPostwarRuntimeClient,
  type RuntimePage,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
import { officeCommandFixture } from './office-command-fixture.js';
import { HostDocument, HostElement } from './trusted-host-dom.js';
const fp = 'sha256:' + 'a'.repeat(64);
const terms = {
  schemaVersion: 'social-labour-programme-create-v1',
  programmeId: 'PROGRAMME_TEST_ONLY',
  kind: 'RELOCATION_SUPPORT',
  locationId: 'REGION_TEST_ONLY',
  participants: '2',
  benefit: { amount: '0.125', currency: 'XAA' },
} as const;
function fixture(mode = 'OK') {
  const f = officeCommandFixture('social');
  const read = {
    ...f.binding.read,
    endpoints: {
      ...f.binding.read.endpoints,
      projectionPath: '/v1/postwar-office-runtime',
    },
    identity: {
      ...f.binding.read.identity,
      projectionVersion: 'postwar-office-runtime-read-v1',
    },
  };
  read.currentIdentity = () => read.identity;
  const seed = {
    worldId: read.identity.worldId,
    seedRef: read.world.seedRef,
    contentHash: read.world.contentHash,
    admissionRef: read.world.admissionRef,
  };
  const record = {
    countryId: mode === 'FOREIGN' ? 'COUNTRY_FOREIGN' : read.identity.countryId,
    programmeId: terms.programmeId,
    terms,
    status: 'PENDING_REVIEW',
    commandId: 'COMMAND_TEST_ONLY',
    commandFingerprint: fp,
    sourceRef: 'SOURCE_TEST_ONLY',
    sourceFingerprint: fp,
    classification: 'TERMS_ONLY_NOT_ELIGIBILITY_APPROVAL_FUNDING_OR_SERVICE',
  };
  const page: RuntimePage = {
    status: mode === 'EMPTY' ? 'EMPTY' : 'PAGE',
    dataset: SOCIAL_PROGRAMMES_DATASET,
    authority: {
      source: 'SERVER_VERIFIED_READ_BINDING',
      capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
      identity: read.identity,
      seatRef: read.seatRef,
      seatState: 'ACTIVE',
      seed,
      readback: {
        ...seed,
        worldVersion: '2',
        eventSequence: '2',
        readbackRef: 'READBACK_TEST_ONLY',
      },
    },
    source: {
      ...read.identity,
      ...seed,
      sourceVersion: fp,
      bindingVersion: fp,
      sourceRevision: 'SOCIAL_PROGRAMME_TERMS_READ_V1',
      dataNature: SOCIAL_PROGRAMMES_NATURE,
      worldVersion: mode === 'STALE' ? '1' : '2',
      eventSequence: '2',
      pageHash: 'a'.repeat(64),
      returnedRowsHash: 'a'.repeat(64),
      hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
      sourcePointer: {
        rowOrigin: 'fixed-social-programme-runtime',
        rowBinding:
          'programmeId+commandFingerprint+sourceRef+sourceFingerprint',
      },
      currentSocialProgrammeContext: {
        localCurrency: 'XAA',
        locationIds: ['REGION_TEST_ONLY'],
      },
    },
    rows: mode === 'EMPTY' ? [] : [record],
    page: {
      offset: 0,
      limit: 25,
      returned: mode === 'EMPTY' ? 0 : 1,
      total: mode === 'EMPTY' ? 0 : 1,
      nextOffset: null,
    },
  };
  const fetcher: typeof fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    return mode === 'MISSING'
      ? Response.json(
          {
            schemaVersion: 'postwar-office-runtime-read-v1',
            requestId: request.requestId,
            ok: false,
            error: {
              code: 'SOCIAL_PROGRAMMES_NOT_INSTALLED',
              retryable: false,
            },
          },
          { status: 503 },
        )
      : Response.json({
          ...page,
          status: page.status === 'PAGE' ? 'AVAILABLE' : 'EMPTY',
          schemaVersion: 'postwar-office-runtime-read-v1',
          requestId: request.requestId,
          ok: true,
        });
  };
  return { read, page, fetcher };
}
describe('pending Social programme browser connection', () => {
  it('builds explicit local-currency terms accepted by the authoritative parser without invoking it in the browser', () => {
    const f = fixture();
    const request = buildSocialProgrammeRequest({
      page: f.page,
      draft: {
        kind: 'RELOCATION_SUPPORT',
        locationId: 'REGION_TEST_ONLY',
        participants: '2',
        benefit: '0.125',
      },
      programmeId: terms.programmeId,
      commandId: 'COMMAND_TEST_ONLY',
      idempotencyKey: 'KEY_TEST_ONLY',
      requestId: '11111111-1111-4111-8111-111111111111',
    });
    expect(
      parseSocialLabourProgrammeCreateIntent(request.request.payload),
    ).toEqual(terms);
    expect(request.request.commandType).toBe(
      'CORE_SOCIAL_LABOUR_PROGRAMME_CREATE_V1',
    );
    expect(() =>
      buildSocialProgrammeRequest({
        ...{
          page: f.page,
          draft: {
            kind: 'RELOCATION_SUPPORT' as const,
            locationId: 'FOREIGN',
            participants: '2',
            benefit: '0.125',
          },
          programmeId: 'P',
          commandId: 'C',
          idempotencyKey: 'K',
          requestId: '11111111-1111-4111-8111-111111111111',
        },
      }),
    ).toThrow('ACTUAL_DOMESTIC_PROGRAMME_LOCATION_REQUIRED');
  });
  it('rejects approval/funding flags and does not invent eligibility or duration defaults', () => {
    expect(() =>
      parseSocialProgrammeTermsDto({ ...terms, approved: true }),
    ).toThrow();
    const proposed = {
      schemaVersion: 'social-labour-programme-create-v1',
      programmeId: 'RETURN_TEST_ONLY',
      kind: 'RETURN_TO_WORK',
      eligible: 'Explicit proposed condition',
      capacity: '3',
      duration: { amount: '7', unit: 'SIM_DAY' },
    };
    expect(
      parseSocialLabourProgrammeCreateIntent(
        parseSocialProgrammeTermsDto(proposed),
      ),
    ).toEqual(proposed);
    expect(() =>
      parseSocialProgrammeTermsDto({
        ...proposed,
        duration: { amount: '0', unit: 'SIM_DAY' },
      }),
    ).toThrow();
    expect(() =>
      parseSocialProgrammeRowDto({
        ...fixture().page.rows[0],
        status: 'APPROVED',
      }),
    ).toThrow();
  });
  it('reads pending terms and distinguishes a real empty page from unavailable source', async () => {
    for (const [mode, status] of [
      ['OK', 'PAGE'],
      ['EMPTY', 'EMPTY'],
      ['MISSING', 'UNAVAILABLE'],
    ]) {
      const f = fixture(mode);
      const c = createPostwarRuntimeClient(f.read, { fetcher: f.fetcher });
      expect(
        (
          await c.readPage(
            SOCIAL_PROGRAMMES_DATASET,
            '11111111-1111-4111-8111-111111111111',
          )
        ).status,
      ).toBe(status);
      c.disconnect();
    }
  });
  it('refuses foreign rows and a stale head', async () => {
    for (const mode of ['FOREIGN', 'STALE']) {
      const f = fixture(mode),
        c = createPostwarRuntimeClient(f.read, { fetcher: f.fetcher });
      expect(
        (
          await c.readPage(
            SOCIAL_PROGRAMMES_DATASET,
            '11111111-1111-4111-8111-111111111111',
          )
        ).status,
      ).not.toBe('PAGE');
      c.disconnect();
    }
  });
});

it('stages an actual whole group without client count, approval or qualification authority', () => {
  const f = fixture();
  const applicant = {
    locationId: 'REGION_TEST_ONLY',
    skill: 'LOW' as const,
    status: 'NOT_IN_LABOUR_FORCE' as const,
  };
  const page = {
    ...f.page,
    source: {
      ...f.page.source,
      currentSocialProgrammeContext: {
        localCurrency: 'XAA',
        locationIds: ['REGION_TEST_ONLY'],
        applicantGroups: [{ ...applicant, personCount: '5' }],
      },
    },
  };
  const input = {
    page,
    draft: { programmeId: terms.programmeId, applicant },
    applicationId: 'APPLICATION_TEST_ONLY',
    commandId: 'APPLY_TEST_ONLY',
    idempotencyKey: 'APPLY_KEY_TEST_ONLY',
    requestId: '11111111-1111-4111-8111-111111111111',
  };
  const request = buildSocialProgrammeApplicationRequest(input);
  expect(request.request.commandType).toBe(
    'CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1',
  );
  expect(request.request.payload).toEqual({
    schemaVersion: 'social-labour-programme-apply-v1',
    programmeId: terms.programmeId,
    programmeCommandFingerprint: fp,
    applicationId: 'APPLICATION_TEST_ONLY',
    applicant,
  });
  expect(() =>
    buildSocialProgrammeApplicationRequest({
      ...input,
      draft: {
        ...input.draft,
        applicant: { ...applicant, locationId: 'REGION_FOREIGN' },
      },
    }),
  ).toThrow('CURRENT_SOCIAL_PROGRAMME_AND_GROUP');
  expect(() =>
    buildSocialProgrammeApplicationRequest({ ...input, page: f.page }),
  ).toThrow('CURRENT_SOCIAL_APPLICANT_GROUPS');
});

it('reads a bounded application page while distinguishing APPLIED from eligibility and rejects foreign rows', async () => {
  for (const mode of ['OK', 'FOREIGN', 'FALSE_PAID_REVIEW']) {
    const f = fixture();
    const applicant = {
      locationId: 'REGION_TEST_ONLY',
      skill: 'LOW',
      status: 'NOT_IN_LABOUR_FORCE',
    };
    const value = {
      countryId:
        mode === 'FOREIGN' ? 'COUNTRY_FOREIGN' : f.read.identity.countryId,
      programmeId: terms.programmeId,
      programmeCommandFingerprint: fp,
      applicationId: 'APPLICATION_TEST_ONLY',
      applicant,
      personCount: '5',
      reviewFacts: {
        schemaVersion: 'social-programme-application-review-v1',
        classification: 'CURRENT_FACTS_NOT_ELIGIBILITY_ADMISSION_OR_PAYMENT',
        terms,
        currentGroupPersonCount: '5',
        membership: 'UNCHANGED_LABOUR_SNAPSHOT',
        proposedCapacity: '2',
        capacityComparison: 'EXCEEDS_PROPOSED_CAPACITY',
        locationRelation: 'SAME_REGION',
        eligibility: 'NOT_VERIFIED',
        budgetBinding: 'NO_APPROVED_PROGRAMME_BUDGET_LINK',
        payment: mode === 'FALSE_PAID_REVIEW' ? 'PAID' : 'NOT_SCHEDULED',
      },
      submittedAtSimTime: '1000',
      commandId: 'APPLY_TEST_ONLY',
      commandFingerprint: fp,
      sourceRef: 'SOURCE_TEST_ONLY',
      sourceFingerprint: fp,
      status: 'APPLIED',
      classification:
        'APPLICATION_ONLY_NOT_ELIGIBILITY_APPROVAL_FUNDING_OR_SERVICE',
    };
    const dataset = 'social-labour-programme-applications';
    const page = {
      ...f.page,
      dataset,
      rows: [value],
      source: {
        ...f.page.source,
        dataNature: 'ADMITTED_CURRENT_SOCIAL_LABOUR_PROGRAMME_APPLICATIONS',
        sourceRevision: 'SOCIAL_PROGRAMME_APPLICATIONS_READ_V1',
        sourcePointer: {
          rowOrigin: 'fixed-social-programme-runtime',
          rowBinding:
            'applicationId+programmeCommandFingerprint+commandFingerprint+sourceRef+sourceFingerprint',
        },
      },
    };
    const client = createPostwarRuntimeClient(f.read, {
      fetcher: async (_url, init) =>
        Response.json({
          ...page,
          status: 'AVAILABLE',
          schemaVersion: 'postwar-office-runtime-read-v1',
          requestId: JSON.parse(String(init?.body)).requestId,
          ok: true,
        }),
    });
    const result = await client.readPage(
      dataset,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result.status).toBe(mode === 'OK' ? 'PAGE' : 'UNAVAILABLE');
    client.disconnect();
  }
});

it('renders actual group count and only stages the selected group for review', () => {
  const f = fixture();
  const applicant = {
    locationId: 'REGION_TEST_ONLY',
    skill: 'LOW' as const,
    status: 'NOT_IN_LABOUR_FORCE' as const,
  };
  const page = {
    ...f.page,
    source: {
      ...f.page.source,
      currentSocialProgrammeContext: {
        localCurrency: 'XAA',
        locationIds: ['REGION_TEST_ONLY'],
        applicantGroups: [{ ...applicant, personCount: '5' }],
      },
    },
  };
  const document = new HostDocument('social');
  const stage = vi.fn(() => true);
  const stageApplication = vi.fn(() => true);
  const section = renderSocialProgrammeForm(document as unknown as Document, {
    page,
    code: null,
    enabled: true,
    stage,
    stageApplication,
  }) as unknown as HostElement;
  const form = section.querySelector(
    '[data-social-programme-application="PROGRAMME_TEST_ONLY"]',
  )!;
  const select = form.all().find((el) => el.tag === 'select')!;
  expect(form.textContent).toContain('5 人');
  expect(form.textContent).toContain('未占用项目容量或付款');
  expect(stageApplication).not.toHaveBeenCalled();
  Object.assign(select, { value: '0' });
  (
    form.listeners.get('submit') as unknown as (event: {
      preventDefault: () => void;
    }) => void
  )({ preventDefault() {} });
  expect(stageApplication).toHaveBeenCalledExactlyOnceWith({
    programmeId: terms.programmeId,
    applicant,
  });
  expect(stage).not.toHaveBeenCalled();
  expect(form.textContent).toContain('尚未提交、核验资格或获得批准');
});
