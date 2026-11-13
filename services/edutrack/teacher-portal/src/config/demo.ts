/**
 * Accounts the mock API knows about, offered on the sign-in screen while mocks are on so anyone
 * can try each state. Every password is the same. Not used with the real backend.
 */
export const DEMO_CREDENTIALS = {
  email: 's.ade@greenfield.edu.ng',
  password: 'Edutrack2026!',
  /** The valid invitation link's token (`/accept-invitation/:token`). */
  invitation: 'GFA-INV-7Q2K',
} as const;

export const DEMO_ACCOUNTS: { email: string; label: string }[] = [
  { email: 's.ade@greenfield.edu.ng', label: 'Mr. Ade · Maths, two campuses' },
  { email: 'g.okafor@greenfield.edu.ng', label: 'Mrs. Okafor · class teacher' },
  { email: 'i.bello@greenfield.edu.ng', label: 'Mr. Bello · HOD Sciences' },
  { email: 'c.eze@greenfield.edu.ng', label: 'Mrs. Eze · Academic Head' },
  { email: 't.salami@greenfield.edu.ng', label: 'Mr. Salami · no classes yet' },
  { email: 'y.oladipo@greenfield.edu.ng', label: 'Suspended' },
  { email: 'f.adebayo@greenfield.edu.ng', label: 'Deactivated' },
  { email: 'r.adeleke@greenfield.edu.ng', label: 'Password expired' },
];
