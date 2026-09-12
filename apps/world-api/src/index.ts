export interface ApiFoundationStatus {
  readonly role: 'command-query-boundary';
  readonly authoritativeMutationEnabled: false;
}

export function getApiFoundationStatus(): ApiFoundationStatus {
  return {
    role: 'command-query-boundary',
    authoritativeMutationEnabled: false,
  };
}

export * from './integration/contracts.js';
export * from './integration/identity.js';
export * from './integration/postgres-read-adapter.js';
export * from './integration/transport.js';
