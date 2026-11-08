/** Lightweight query-contract/identity protocol only. No PostgreSQL, JWT
 * authentication, browser or Native lifecycle is executed by these tests. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  REGISTERED_CURRENT_BROWSER_SUBJECT_QUERY as query,
  registeredCurrentC2BrowserSubject as select,
} from '../support/registered-current-browser-subject.js';
const subject = '11111111-1111-4111-8111-111111111111';
const inspection = '22222222-2222-4222-8222-222222222222';
const token = (sub: string) =>
  `TEST_ONLY.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.NOT_SIGNED`;
const rows = [
  {
    country_id: 'COUNTRY_01',
    auth_subject: '33333333-3333-4333-8333-333333333333',
    actor_id: 'ACTOR_C1_TEST_ONLY',
  },
  {
    country_id: 'COUNTRY_02',
    auth_subject: subject,
    actor_id: 'ACTOR_HTTP_C2_TEST_ONLY',
  },
];
describe('current-rebuild browser registered HTTP subject', () => {
  it('uses the exact existing restore join and revocation exclusion instead of the authorization-only scan', () => {
    const restore = readFileSync(
      new URL(
        '../support/registered-utility-checkpoint-restore.ts',
        import.meta.url,
      ),
      'utf8',
    );
    expect(restore).toContain(JSON.stringify(query));
  });
  it('uses the sole bound C2 HTTP subject and the same setup signer identity', () => {
    expect(select(rows, token(subject))).toBe(subject);
    // Inspection actors may have current_commit_authorization but are absent
    // from this actor-binding join. Their token must never stand in for HTTP.
    expect(() => select(rows, token(inspection))).toThrow(
      'SETUP_JWT_MUST_MATCH_REGISTERED_C2_HTTP_SUBJECT',
    );
  });
  it('does not select an arbitrary row if another bound C2 subject appears', () => {
    expect(() =>
      select(
        [
          ...rows,
          {
            country_id: 'COUNTRY_02',
            auth_subject: inspection,
            actor_id: 'ACTOR_OTHER_TEST_ONLY',
          },
        ],
        token(subject),
      ),
    ).toThrow('SAME_EXISTING_C2_AUTH_SUBJECT_REQUIRED');
  });
  it('refuses no actual binding or an absent actor even when setup can issue a token', () => {
    expect(() =>
      select(
        rows.filter((r) => r.country_id !== 'COUNTRY_02'),
        token(subject),
      ),
    ).toThrow('SAME_EXISTING_C2_AUTH_SUBJECT_REQUIRED');
    expect(() =>
      select([{ ...rows[1]!, actor_id: '' }], token(subject)),
    ).toThrow('ACTUAL_REGISTERED_HTTP_ACTOR_REQUIRED');
  });
});
