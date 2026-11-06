/**
 * Accounts the mock API knows about, surfaced on the sign-in screen while mocks are on so anyone
 * can try each state. Every account's password is the same. Not used with the real backend.
 */
export const DEMO_CREDENTIALS = {
  email: 'adaeze.okonkwo@greenfield.edu.ng',
  password: 'Edutrack2026!',
  /** A school that was just provisioned: no students, staff or classes yet. */
  newSchool: 'e.udo@crestviewcollege.ng',
  suspended: 'chidi.okoro@greenfield.edu.ng',
  deactivated: 'tunde.ojo@greenfield.edu.ng',
  pending: 'kemi.lawal@greenfield.edu.ng',
  passwordExpired: 'kunle.bakare@greenfield.edu.ng',
} as const;
