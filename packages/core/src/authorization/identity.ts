import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import type { UserId } from '../ids.js';
import { userId } from '../ids.js';

export const SHARED_IDENTITY_FIELDS = Object.freeze([
  'user_id',
  'display_name',
  'school_id',
] as const);

export interface SharedIdentityFacts {
  readonly user_id: string;
  readonly display_name: string | null;
  readonly school_id: string | null;
}

export interface VerifiedTokenEnvelope {
  readonly subject: string;
  readonly issuer: string;
  readonly audience: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface IdentityVerifier<Token> {
  verify(token: Token): Promise<VerifiedTokenEnvelope>;
}

export interface AuthenticatedPrincipal {
  readonly userId: UserId;
  readonly facts: SharedIdentityFacts;
  readonly token: VerifiedTokenEnvelope;
}

function invalidIdentity(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS, message);
}

export function validateSharedIdentityFacts(
  input: unknown,
): SharedIdentityFacts {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    invalidIdentity('Identity facts must be an object');
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [...SHARED_IDENTITY_FIELDS].sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  )
    invalidIdentity('Identity facts must contain exactly the shared whitelist');
  if (typeof record.user_id !== 'string' || record.user_id.length === 0)
    invalidIdentity('user_id must be a non-empty string');
  for (const optional of ['display_name', 'school_id'] as const) {
    if (record[optional] !== null && typeof record[optional] !== 'string')
      invalidIdentity(`${optional} must be a string or null`);
  }
  return Object.freeze({
    user_id: record.user_id,
    display_name: record.display_name as string | null,
    school_id: record.school_id as string | null,
  });
}

export async function authenticateIdentity<Token>(input: {
  readonly token: Token;
  readonly profile: unknown;
  readonly verifier: IdentityVerifier<Token>;
}): Promise<AuthenticatedPrincipal> {
  const verified = await input.verifier.verify(input.token);
  const facts = validateSharedIdentityFacts(input.profile);
  if (verified.subject !== facts.user_id)
    invalidIdentity('Verified token subject does not match user_id');
  return Object.freeze({
    userId: userId(facts.user_id),
    facts,
    token: verified,
  });
}
