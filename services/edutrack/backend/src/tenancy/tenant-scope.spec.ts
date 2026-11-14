import { TenantContextError, TenantMismatchError } from './tenant.errors.js';
import { scopeArgs, TENANT_MODELS } from './tenant-scope.js';

const A = '00000000-0000-7000-8000-00000000000a';
const B = '00000000-0000-7000-8000-00000000000b';

describe('TENANT_MODELS', () => {
  it('includes every school-owned model and none of the global ones', () => {
    for (const model of [
      'Branch',
      'Staff',
      'SchoolMembership',
      'SchoolRole',
      'Invoice',
      'AuthSession',
    ])
      expect(TENANT_MODELS.has(model)).toBe(true);
    for (const model of [
      'User',
      'School',
      'PlatformStaff',
      'PlatformRole',
      'Plan',
      'PublicHoliday',
    ])
      expect(TENANT_MODELS.has(model)).toBe(false);
  });
});

describe('scopeArgs', () => {
  it('adds the tenant to reads, keeping existing filters', () => {
    expect(scopeArgs('Branch', 'findMany', { where: { status: 'ACTIVE' } }, A)).toEqual({
      where: { status: 'ACTIVE', AND: [{ schoolId: A }] },
    });
    expect(scopeArgs('Branch', 'count', undefined, A)).toEqual({
      where: { AND: [{ schoolId: A }] },
    });
  });

  it('keeps an existing AND (object or array)', () => {
    expect(scopeArgs('Branch', 'findFirst', { where: { AND: { code: 'X' } } }, A)).toEqual({
      where: { AND: [{ code: 'X' }, { schoolId: A }] },
    });
    expect(scopeArgs('Branch', 'findFirst', { where: { AND: [{ code: 'X' }] } }, A)).toEqual({
      where: { AND: [{ code: 'X' }, { schoolId: A }] },
    });
  });

  it('scopes findUnique, update and delete next to the unique key', () => {
    for (const op of ['findUnique', 'findUniqueOrThrow', 'update', 'delete'])
      expect(scopeArgs('Branch', op, { where: { id: 'x' } }, A).where).toEqual({
        id: 'x',
        AND: [{ schoolId: A }],
      });
  });

  it('sets the tenant on creates and refuses another school', () => {
    expect(scopeArgs('Branch', 'create', { data: { name: 'Main' } }, A)).toEqual({
      data: { name: 'Main', schoolId: A },
    });
    expect(
      scopeArgs('Branch', 'createMany', { data: [{ name: 'A' }, { name: 'B', schoolId: A }] }, A),
    ).toEqual({
      data: [
        { name: 'A', schoolId: A },
        { name: 'B', schoolId: A },
      ],
    });
    expect(() => scopeArgs('Branch', 'create', { data: { schoolId: B } }, A)).toThrow(
      TenantMismatchError,
    );
    expect(() =>
      scopeArgs('Branch', 'create', { data: { school: { connect: { id: B } } } }, A),
    ).toThrow(TenantMismatchError);
    expect(scopeArgs('Branch', 'create', { data: { school: { connect: { id: A } } } }, A)).toEqual({
      data: { school: { connect: { id: A } } },
    });
  });

  it('refuses where clauses that name another school', () => {
    expect(() => scopeArgs('Branch', 'findMany', { where: { schoolId: B } }, A)).toThrow(
      TenantMismatchError,
    );
    expect(() =>
      scopeArgs('Branch', 'findUnique', { where: { schoolId_id: { schoolId: B, id: 'x' } } }, A),
    ).toThrow(TenantMismatchError);
    expect(
      scopeArgs('Branch', 'findUnique', { where: { schoolId_id: { schoolId: A, id: 'x' } } }, A),
    ).toEqual({ where: { schoolId_id: { schoolId: A, id: 'x' }, AND: [{ schoolId: A }] } });
  });

  it('never lets an update move a row to another school', () => {
    expect(() =>
      scopeArgs('Branch', 'updateMany', { where: {}, data: { schoolId: B } }, A),
    ).toThrow(TenantMismatchError);
    expect(() =>
      scopeArgs(
        'Branch',
        'update',
        { where: { id: 'x' }, data: { school: { connect: { id: A } } } },
        A,
      ),
    ).toThrow(TenantMismatchError);
    expect(
      scopeArgs('Branch', 'update', { where: { id: 'x' }, data: { schoolId: A, name: 'N' } }, A),
    ).toEqual({ where: { id: 'x', AND: [{ schoolId: A }] }, data: { schoolId: A, name: 'N' } });
  });

  it('scopes both halves of an upsert', () => {
    expect(
      scopeArgs(
        'Branch',
        'upsert',
        { where: { id: 'x' }, create: { name: 'N' }, update: { name: 'M' } },
        A,
      ),
    ).toEqual({
      where: { id: 'x', AND: [{ schoolId: A }] },
      create: { name: 'N', schoolId: A },
      update: { name: 'M' },
    });
    expect(() =>
      scopeArgs('Branch', 'upsert', { where: { id: 'x' }, create: { schoolId: B }, update: {} }, A),
    ).toThrow(TenantMismatchError);
  });

  it('rejects operations it does not know how to scope', () => {
    expect(() => scopeArgs('Branch', 'findRaw', {}, A)).toThrow(TenantContextError);
  });
});
