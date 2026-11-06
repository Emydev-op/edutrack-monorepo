import { describe, expect, it } from 'vitest';

import { ALL_BRANCHES, provisionSchema } from '../school';

const base = {
  name: 'Crestview College',
  ownership: 'Private',
  email: 'info@crestview.ng',
  state: 'FCT',
  lga: 'Bwari',
  brandColor: '#24497A',
  sections: ['Primary'],
  branches: [
    { name: 'Main Campus', address: '' },
    { name: 'Lekki Campus', address: '' },
  ],
  plan: 'Growth',
  startDate: '2027-01-04',
};
const admin = (email: string, scope: string, position = 'Principal', positionOther = '') => ({
  name: 'Osegbo Emeka',
  email,
  phone: '',
  position,
  positionOther,
  scope,
});

async function errorsFor(admins: ReturnType<typeof admin>[], branches = base.branches) {
  // Loosely typed fixtures on purpose: the test checks what the schema rejects.
  const result = await provisionSchema.parse({ ...base, branches, admins } as never);
  return result.errors.map((e) => `${e.path}: ${e.errors[0]}`);
}

describe('provisioning administrators', () => {
  it('accepts one school-wide admin plus branch admins', async () => {
    expect(
      await errorsFor([
        admin('a@x.ng', ALL_BRANCHES),
        admin('b@x.ng', 'Lekki Campus', 'Head Teacher'),
      ]),
    ).toEqual([]);
  });

  it('requires a school-wide administrator', async () => {
    expect((await errorsFor([admin('b@x.ng', 'Lekki Campus')])).join()).toContain(
      'must manage all branches',
    );
  });

  it('rejects duplicate emails, case-insensitively', async () => {
    expect(
      (await errorsFor([admin('a@x.ng', ALL_BRANCHES), admin('A@X.ng', 'Lekki Campus')])).join(),
    ).toContain('different email');
  });

  it('asks for the title when the position is Other', async () => {
    expect((await errorsFor([admin('a@x.ng', ALL_BRANCHES, 'Other')])).join()).toContain(
      'Enter the position',
    );
  });

  it('flags a scope whose branch was removed', async () => {
    const errors = await errorsFor([admin('a@x.ng', ALL_BRANCHES), admin('b@x.ng', 'Ajah Annex')]);
    expect(errors.join()).toContain('no longer exists');
  });
});
