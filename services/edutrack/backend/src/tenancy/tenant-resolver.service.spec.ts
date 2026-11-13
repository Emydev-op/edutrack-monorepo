import type { ConfigService } from '@nestjs/config';
import { FixedClock } from '../common/clock/clock.js';
import type { Env } from '../config/env.validation.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TenantResolverService } from './tenant-resolver.service.js';

const GREENFIELD = {
  id: '01a1d53d-9982-7490-8ad4-d1e1f0c6961b',
  slug: 'greenfield',
  name: 'Greenfield Academy',
};

function resolver(nodeEnv: string, baseDomain = 'edutrack.ng') {
  const values: Record<string, string> = { NODE_ENV: nodeEnv, APP_BASE_DOMAIN: baseDomain };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
  const findFirst = vi.fn(({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(
      where.slug === 'greenfield' ||
        where.id === GREENFIELD.id ||
        where.customDomain === 'portal.greenfield.sch.ng'
        ? GREENFIELD
        : null,
    ),
  );
  const prisma = { school: { findFirst } } as unknown as PrismaService;
  return { service: new TenantResolverService(config, prisma, new FixedClock()), findFirst };
}

describe('TenantResolverService', () => {
  it('reads the school slug from the Host subdomain', () => {
    const { service } = resolver('production');
    expect(service.hintFromHost('greenfield.edutrack.ng')).toEqual({
      kind: 'slug',
      value: 'greenfield',
    });
    expect(service.hintFromHost('Greenfield.EduTrack.ng:443')).toEqual({
      kind: 'slug',
      value: 'greenfield',
    });
    expect(service.hintFromHost('edutrack.ng')).toBeNull();
    expect(service.hintFromHost('admin.edutrack.ng')).toBeNull();
    expect(service.hintFromHost('www.edutrack.ng')).toBeNull();
    expect(service.hintFromHost('a.b.edutrack.ng')).toBeNull();
    expect(service.hintFromHost('10.0.0.4:3000')).toBeNull();
    expect(service.hintFromHost('portal.greenfield.sch.ng')).toEqual({
      kind: 'domain',
      value: 'portal.greenfield.sch.ng',
    });
  });

  it('works with greenfield.localhost in development', () => {
    const { service } = resolver('development', 'localhost');
    expect(service.hintFromHost('greenfield.localhost:5172')).toEqual({
      kind: 'slug',
      value: 'greenfield',
    });
    expect(service.hintFromHost('localhost:3000')).toBeNull();
  });

  it('resolves a slug, a verified custom domain, and reports unknown slugs', async () => {
    const { service } = resolver('production');
    expect(await service.resolve('greenfield.edutrack.ng', {})).toEqual({ school: GREENFIELD });
    expect(await service.resolve('portal.greenfield.sch.ng', {})).toEqual({ school: GREENFIELD });
    expect(await service.resolve('nowhere.edutrack.ng', {})).toEqual({ unknownSlug: 'nowhere' });
    expect(await service.resolve('edutrack.ng', {})).toEqual({});
  });

  it('accepts the dev header (slug or id) outside production only', async () => {
    const dev = resolver('development').service;
    expect(await dev.resolve('localhost:3000', { 'x-tenant-id': 'greenfield' })).toEqual({
      school: GREENFIELD,
    });
    expect(await dev.resolve('localhost:3000', { 'x-school-slug': GREENFIELD.id })).toEqual({
      school: GREENFIELD,
    });

    const prod = resolver('production').service;
    expect(prod.hintFromHeaders({ 'x-tenant-id': 'greenfield' })).toBeNull();
    expect(
      await prod.resolve('api.edutrack.ng', {
        'x-tenant-id': 'greenfield',
        'x-school-slug': 'greenfield',
      }),
    ).toEqual({});
  });

  it('caches lookups briefly', async () => {
    const { service, findFirst } = resolver('production');
    await service.resolve('greenfield.edutrack.ng', {});
    await service.resolve('greenfield.edutrack.ng', {});
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
