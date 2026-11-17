import { describe, expect, it } from 'vitest';

import { mockTokenForEmail, tokenFor } from '../handlers/shared';

describe('mock token for a real sign-in', () => {
  it('uses the mock account with the same email', () => {
    expect(mockTokenForEmail('Adaeze.Okonkwo@greenfield.edu.ng', 'greenfield')).toBe(
      tokenFor('okonkwo'),
    );
  });

  it("stands in the school's seeded admin for someone the mock doesn't know", () => {
    // A newly invited admin: without this the mock answers 401 and the app signs them out.
    expect(mockTokenForEmail('new.admin@greenfield.edu.ng', 'greenfield')).toBe(
      tokenFor('okonkwo'),
    );
    expect(mockTokenForEmail('new.admin@example.ng', 'unknown-school')).not.toBeNull();
  });
});
