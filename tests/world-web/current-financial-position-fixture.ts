import { createProductionReadClient } from '../../apps/world-web/src/production-read/client.js';
import type { OfficeRole } from '../../apps/world-web/src/office-projection/model.js';
import { officeProjectionFixture } from './office-projection-fixture.js';

/** OFFLINE TEST_ONLY public-wire fixture. No ledger replay, server code, balance
 * calculation, real token, admission or actual monetary account is involved. */
export function currentFinancialPositionFixture(role: OfficeRole) {
  const f = officeProjectionFixture(role);
  const supported = role === 'finance' || role === 'central_bank';
  const accountId =
    role === 'central_bank' ? 'TEST_CB_ACCOUNT' : 'TEST_TREASURY';
  if (supported)
    Object.assign(f.payload.ledger.financialPositions[0]!, {
      accountClass: 'CASH',
      netDebitBalance: role === 'finance' ? '3' : '-3',
    });
  let carrier: unknown = supported
    ? {
        schemaVersion: 'authoritative-financial-position-v1',
        status: 'AUTHORIZED_FILTERED',
        semantics: 'OPENING_PLUS_POSTING_LINEAGE',
        positionCoverage: 'NONZERO_LEDGER_POSITIONS',
        sourceHead: { worldVersion: '2', eventSequence: '2' },
        opening: {
          seedId: f.config.world.seedRef,
          seedFingerprint: f.config.world.contentHash,
          openingWorldVersion: '0',
        },
        sourceUnits:
          role === 'finance'
            ? ['CONSTITUTION-U0381', 'CONSTITUTION-U0382', 'FINANCE-U0831']
            : [
                'CONSTITUTION-U0381',
                'CONSTITUTION-U0382',
                'CENTRAL_BANK-U0585',
                'CENTRAL_BANK-U0586',
              ],
        positions: [
          {
            accountId,
            accountClass: 'CASH',
            currency: 'GCU',
            netDebitBalance: role === 'finance' ? '13' : '7',
          },
        ],
      }
    : {
        schemaVersion: 'authoritative-financial-position-v1',
        status: 'NOT_AUTHORIZED',
        reason: 'SCOPE_NOT_AUTHORIZED',
      };
  let followHead = true;
  const fetcher: typeof fetch = async (input, init) => {
    const response = await f.fetcher(input, init);
    const body = await response.json();
    const ledger = body.result?.data?.payload?.ledger;
    if (ledger && carrier !== undefined) {
      const value = structuredClone(carrier) as Record<string, unknown>;
      if (followHead && value.status === 'AUTHORIZED_FILTERED')
        value.sourceHead = {
          worldVersion: body.authority.readback.worldVersion,
          eventSequence: body.authority.readback.eventSequence,
        };
      ledger.authoritativeFinancialPosition = value;
    }
    return Response.json(body, { status: response.status });
  };
  return {
    ...f,
    fetcher,
    client: () => createProductionReadClient(f.config, { fetcher }),
    getCarrier: () => structuredClone(carrier) as Record<string, unknown>,
    setCarrier: (next: unknown) => {
      carrier = structuredClone(next);
      followHead = false;
    },
  };
}
