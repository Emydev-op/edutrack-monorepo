/**
 * Accounts the mock API knows about, surfaced on the sign-in screen while mocks are on so anyone
 * can try the blocked-account states. Not used when talking to the real backend.
 */
export const DEMO_CREDENTIALS = {
  email: 'tolu@edutrack.ng',
  password: 'Edutrack2026!',
  suspended: 'kemi@edutrack.ng',
  deactivated: 'bayo@edutrack.ng',
} as const;
