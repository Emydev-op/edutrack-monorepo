import { Controller, Get, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContext, type RequestContextState } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { PlatformOnly, RequirePermission } from '../decorators/auth.decorators.js';
import { PermissionGuard } from './permission.guard.js';

@Controller()
class Routes {
  @Get() open() {}
  @RequirePermission('students.view') students() {}
  @RequirePermission('students.view', 'settings.users') studentsAndUsers() {}
  @PlatformOnly('Schools.View') schools() {}
  @PlatformOnly() anyStaff() {}
}

const contextFor = (handler: keyof Routes) =>
  ({
    getType: () => 'http',
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
  }) as unknown as ExecutionContext;

function guardWith(data: { roles?: unknown[]; staff?: unknown }) {
  const prisma = {
    schoolMembership: {
      findFirst: vi.fn(() =>
        Promise.resolve(
          data.roles
            ? {
                roles: data.roles.map((permissions) => ({
                  role: { permissions, archivedAt: null },
                })),
              }
            : null,
        ),
      ),
    },
    platformStaff: { findUnique: vi.fn(() => Promise.resolve(data.staff ?? null)) },
  } as unknown as PrismaService;
  return new PermissionGuard(new Reflector(), prisma);
}

const school: RequestContextState = {
  requestId: 'r',
  userId: 'u',
  portal: 'SCHOOL_ADMIN',
  schoolId: 's',
  membershipId: 'm',
};
const platform: RequestContextState = { requestId: 'r', userId: 'u', portal: 'PLATFORM' };

const check = (guard: PermissionGuard, state: RequestContextState, handler: keyof Routes) =>
  RequestContext.run(state, () => guard.canActivate(contextFor(handler)));

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
    return 'allowed';
  } catch (error) {
    return error instanceof AppException ? error.code : String(error);
  }
}

describe('PermissionGuard', () => {
  it('lets undecorated routes through without a lookup', async () => {
    const guard = guardWith({});
    expect(await check(guard, { requestId: 'r' }, 'open')).toBe(true);
  });

  it('allows when the roles together hold every permission', async () => {
    const guard = guardWith({ roles: [{ students: ['view'] }, { settings: ['users'] }] });
    expect(await codeOf(check(guard, school, 'students'))).toBe('allowed');
    expect(await codeOf(check(guard, school, 'studentsAndUsers'))).toBe('allowed');
  });

  it('refuses a missing permission, a missing membership, and platform sessions', async () => {
    expect(
      await codeOf(
        check(guardWith({ roles: [{ students: ['view'] }] }), school, 'studentsAndUsers'),
      ),
    ).toBe('FORBIDDEN');
    expect(await codeOf(check(guardWith({}), school, 'students'))).toBe('FORBIDDEN');
    expect(
      await codeOf(check(guardWith({ roles: [{ students: ['view'] }] }), platform, 'students')),
    ).toBe('FORBIDDEN');
  });

  it('checks platform staff status and role permissions', async () => {
    const active = { status: 'ACTIVE', role: { permissions: { Schools: ['View'] } } };
    expect(await codeOf(check(guardWith({ staff: active }), platform, 'schools'))).toBe('allowed');
    expect(await codeOf(check(guardWith({ staff: active }), platform, 'anyStaff'))).toBe('allowed');
    expect(
      await codeOf(
        check(
          guardWith({ staff: { ...active, role: { permissions: { Schools: [] } } } }),
          platform,
          'schools',
        ),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await codeOf(
        check(guardWith({ staff: { ...active, status: 'SUSPENDED' } }), platform, 'schools'),
      ),
    ).toBe('PLATFORM_ONLY');
    expect(await codeOf(check(guardWith({ staff: active }), school, 'schools'))).toBe(
      'PLATFORM_ONLY',
    );
  });
});
