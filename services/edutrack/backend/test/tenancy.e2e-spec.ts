import { Controller, Get } from '@nestjs/common';
import {
  Portals,
  PlatformOnly,
  RequirePermission,
} from '../src/auth/decorators/auth.decorators.js';
import { RequestContext } from '../src/common/context/request-context.js';
import { CurrentTenant } from '../src/common/decorators/request.decorators.js';
import { TenantPrismaService } from '../src/tenancy/tenant-prisma.service.js';
import { TenantContextError, TenantMismatchError } from '../src/tenancy/tenant.errors.js';
import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

/** Routes that exist only in this test, to exercise the guards and the tenant client end to end. */
@Controller('test-tenancy')
class TenancyProbeController {
  constructor(private readonly tenant: TenantPrismaService) {}

  @Get('branches')
  @RequirePermission('students.view')
  async branches(@CurrentTenant() schoolId: string) {
    const branches = await this.tenant.db.branch.findMany({ orderBy: { code: 'asc' } });
    return { schoolId, codes: branches.map((b) => b.code) };
  }

  @Get('users-admin')
  @RequirePermission('settings.users')
  usersAdmin() {
    return { ok: true };
  }

  @Get('school-admin-only')
  @Portals('SCHOOL_ADMIN')
  schoolAdminOnly() {
    return { ok: true };
  }

  @Get('platform')
  @PlatformOnly('Schools.View')
  platform() {
    return { ok: true, schoolId: RequestContext.schoolId() ?? null };
  }

  @Get('platform-settings')
  @PlatformOnly('Settings.Manage')
  platformSettings() {
    return { ok: true };
  }
}

describe('Tenant isolation, resolution and permissions (e2e)', () => {
  let t: TestApp;
  let db: TenantPrismaService['db'];
  let greenfield: string;
  let crestview: string;

  beforeAll(async () => {
    t = await createTestApp([TenancyProbeController]);
    await t.reseed();
    db = t.app.get(TenantPrismaService).db;
    greenfield = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    crestview = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'crestview' } })).id;
  });

  afterAll(async () => {
    await t.close();
  });

  const inSchool = <T>(schoolId: string, fn: () => Promise<T>) =>
    RequestContext.forSchool(schoolId, fn);

  describe('tenant client', () => {
    it('reads only the current school’s rows', async () => {
      const codes = await inSchool(greenfield, async () =>
        (await db.branch.findMany()).map((b) => b.code).sort(),
      );
      expect(codes).toEqual(['GFA-LK', 'GFA-MC']);
      expect(await inSchool(crestview, () => db.branch.count())).toBe(1);
      expect(await inSchool(crestview, () => db.schoolRole.count())).toBe(10);
    });

    it('cannot read another school’s row, even by id', async () => {
      const lekki = await t.prisma.branch.findFirstOrThrow({ where: { code: 'GFA-LK' } });
      expect(
        await inSchool(crestview, () => db.branch.findUnique({ where: { id: lekki.id } })),
      ).toBeNull();
      expect(
        await inSchool(crestview, () => db.branch.findFirst({ where: { code: 'GFA-LK' } })),
      ).toBeNull();
      await expect(
        inSchool(crestview, () => db.branch.findUniqueOrThrow({ where: { id: lekki.id } })),
      ).rejects.toThrow();
      await expect(
        inSchool(crestview, () => db.branch.findMany({ where: { schoolId: greenfield } })),
      ).rejects.toThrow(TenantMismatchError);
      await expect(
        inSchool(crestview, () =>
          db.branch.findUnique({ where: { schoolId_id: { schoolId: greenfield, id: lekki.id } } }),
        ),
      ).rejects.toThrow(TenantMismatchError);
    });

    it('cannot update or delete another school’s rows', async () => {
      const lekki = await t.prisma.branch.findFirstOrThrow({ where: { code: 'GFA-LK' } });
      await expect(
        inSchool(crestview, () =>
          db.branch.update({ where: { id: lekki.id }, data: { name: 'Hijacked' } }),
        ),
      ).rejects.toMatchObject({ code: 'P2025' });
      const many = await inSchool(crestview, () =>
        db.branch.updateMany({ where: { id: lekki.id }, data: { name: 'Hijacked' } }),
      );
      expect(many.count).toBe(0);
      const deleted = await inSchool(crestview, () =>
        db.branch.deleteMany({ where: { id: lekki.id } }),
      );
      expect(deleted.count).toBe(0);
      // An upsert aimed at Lekki can't see it, so it creates a Crestview row instead.
      const upserted = await inSchool(crestview, () =>
        db.branch.upsert({
          where: { id: lekki.id },
          create: { schoolId: crestview, code: 'CCV-X', name: 'Upserted' },
          update: { name: 'Hijacked' },
        }),
      );
      expect(upserted.schoolId).toBe(crestview);
      await t.prisma.branch.delete({ where: { id: upserted.id } });
      const after = await t.prisma.branch.findUniqueOrThrow({ where: { id: lekki.id } });
      expect(after.name).toBe('Lekki Campus');
      expect(after.schoolId).toBe(greenfield);
    });

    it('creates in the tenant and refuses another school’s id', async () => {
      const created = await inSchool(crestview, () =>
        db.department.create({ data: { schoolId: crestview, name: 'Isolation Test Dept' } }),
      );
      expect(created.schoolId).toBe(crestview);
      await expect(
        inSchool(crestview, () =>
          db.department.create({ data: { name: 'Sneaky', schoolId: greenfield } }),
        ),
      ).rejects.toThrow(TenantMismatchError);
      await expect(
        inSchool(crestview, () =>
          db.department.update({ where: { id: created.id }, data: { schoolId: greenfield } }),
        ),
      ).rejects.toThrow(TenantMismatchError);
      await inSchool(crestview, () => db.department.delete({ where: { id: created.id } }));
    });

    it('throws without a tenant, but leaves global models alone', async () => {
      await expect(db.branch.findMany()).rejects.toThrow(TenantContextError);
      await expect(RequestContext.run({ requestId: 'x' }, () => db.staff.count())).rejects.toThrow(
        TenantContextError,
      );
      expect(await db.school.count()).toBeGreaterThanOrEqual(2);
    });

    it('refuses writes during a read-only support session', async () => {
      await expect(
        RequestContext.run(
          { requestId: 'x', schoolId: crestview, supportSessionId: 'support-1' },
          () => db.department.create({ data: { schoolId: crestview, name: 'Support Edit' } }),
        ),
      ).rejects.toThrow(/read-only/);
      expect(
        await RequestContext.run(
          { requestId: 'x', schoolId: crestview, supportSessionId: 'support-1' },
          () => db.branch.count(),
        ),
      ).toBe(1);
    });
  });

  describe('over HTTP', () => {
    it('sets the tenant from the session: each school sees its own data', async () => {
      const gf = await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng');
      const cv = await signIn(t, 'e.udo@crestviewcollege.ng');
      const gfRes = await authed(t, gf.token).get('/api/v1/test-tenancy/branches');
      expect(gfRes.body).toEqual({ schoolId: greenfield, codes: ['GFA-LK', 'GFA-MC'] });
      const cvRes = await authed(t, cv.token).get('/api/v1/test-tenancy/branches');
      expect(cvRes.body).toEqual({ schoolId: crestview, codes: ['CCV-MC'] });
    });

    it('a dev tenant header cannot move a School Admin session to another school', async () => {
      const cv = await signIn(t, 'e.udo@crestviewcollege.ng');
      const res = await authed(t, cv.token, { tenant: 'greenfield' }).get(
        '/api/v1/test-tenancy/branches',
      );
      expect(res.body.codes).toEqual(['CCV-MC']);
    });

    it('teacher sessions resolve the school from the Host', async () => {
      const ade = await signIn(t, 's.ade@greenfield.edu.ng', { host: 'greenfield.localhost' });
      const ok = await authed(t, ade.token, { host: 'greenfield.localhost' }).get(
        '/api/v1/test-tenancy/branches',
      );
      expect(ok.body.schoolId).toBe(greenfield);
      const viaHeader = await authed(t, ade.token, { tenant: 'greenfield' }).get(
        '/api/v1/test-tenancy/branches',
      );
      expect(viaHeader.status).toBe(200);
      const wrongHost = await authed(t, ade.token, { host: 'crestview.localhost' }).get(
        '/api/v1/test-tenancy/branches',
      );
      expect(wrongHost.status).toBe(403);
      expect(wrongHost.body.code).toBe('TENANT_MISMATCH');
      const noHost = await authed(t, ade.token).get('/api/v1/test-tenancy/branches');
      expect(noHost.status).toBe(403);
    });
  });

  describe('permission guard', () => {
    it('allows a role that holds the permission and refuses one that doesn’t', async () => {
      const ade = await signIn(t, 's.ade@greenfield.edu.ng', { host: 'greenfield.localhost' });
      const api = authed(t, ade.token, { host: 'greenfield.localhost' });
      expect((await api.get('/api/v1/test-tenancy/branches')).status).toBe(200);
      const denied = await api.get('/api/v1/test-tenancy/users-admin');
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('FORBIDDEN');
      const adaeze = await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng');
      expect((await authed(t, adaeze.token).get('/api/v1/test-tenancy/users-admin')).status).toBe(
        200,
      );
    });

    it('applies role changes immediately', async () => {
      const adaeze = await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng');
      const role = await t.prisma.schoolRole.findFirstOrThrow({
        where: { schoolId: greenfield, key: 'school_admin' },
      });
      await t.prisma.schoolRole.update({
        where: { id: role.id },
        data: { archivedAt: new Date() },
      });
      try {
        expect((await authed(t, adaeze.token).get('/api/v1/test-tenancy/users-admin')).status).toBe(
          403,
        );
      } finally {
        await t.prisma.schoolRole.update({ where: { id: role.id }, data: { archivedAt: null } });
      }
    });

    it('restricts routes to portals', async () => {
      const ade = await signIn(t, 's.ade@greenfield.edu.ng', { host: 'greenfield.localhost' });
      const res = await authed(t, ade.token, { host: 'greenfield.localhost' }).get(
        '/api/v1/test-tenancy/school-admin-only',
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('WRONG_PORTAL');
    });

    it('keeps back-office routes for platform staff with the right role', async () => {
      const tolu = await signIn(t, 'tolu@edutrack.ng', { portal: 'platform' });
      const res = await authed(t, tolu.token).get('/api/v1/test-tenancy/platform');
      expect(res.body).toEqual({ ok: true, schoolId: null });
      expect(
        (await authed(t, tolu.token).get('/api/v1/test-tenancy/platform-settings')).status,
      ).toBe(200);
      const ngozi = await signIn(t, 'ngozi@edutrack.ng', { portal: 'platform' });
      expect((await authed(t, ngozi.token).get('/api/v1/test-tenancy/platform')).status).toBe(200);
      expect(
        (await authed(t, ngozi.token).get('/api/v1/test-tenancy/platform-settings')).status,
      ).toBe(403);
      // A school session never reaches back-office routes, and a platform session has no tenant.
      const adaeze = await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng');
      expect((await authed(t, adaeze.token).get('/api/v1/test-tenancy/platform')).body.code).toBe(
        'PLATFORM_ONLY',
      );
      expect((await authed(t, tolu.token).get('/api/v1/test-tenancy/branches')).body.code).toBe(
        'NO_TENANT',
      );
    });
  });
});
