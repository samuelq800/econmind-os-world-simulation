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
