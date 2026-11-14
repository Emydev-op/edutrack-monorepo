import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TENANT_HEADER } from '@edutrack/shared';
import { NodeEnv, type Env } from '../config/env.validation.js';
import type { HostSchool } from '../common/context/request-context.js';
import { Clock } from '../common/clock/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Subdomains that are never schools (also blocked as slugs when a school is provisioned). */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  'www',
  'api',
  'app',
  'apps',
  'admin',
  'backoffice',
  'platform',
  'portal',
  'auth',
  'login',
  'account',
  'accounts',
  'mail',
  'smtp',
  'static',
  'assets',
  'cdn',
  'docs',
  'status',
  'help',
  'support',
  'edutrack',
  'school',
  'schools',
  'teacher',
  'parent',
  'student',
  'dev',
  'staging',
  'test',
  'demo',
]);

/** Accepted only outside production: lets local portals on localhost:517x name their school. */
export const DEV_SLUG_HEADER = 'x-school-slug';

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_MS = 60_000;
const CACHE_MAX = 1_000;

export interface HostResolution {
  school?: HostSchool;
  /** A school-looking subdomain/header that matched no school. */
  unknownSlug?: string;
}

/** What a request says about its school, before any lookup. */
export type HostHint = { kind: 'slug'; value: string } | { kind: 'domain'; value: string };

/**
 * Works out which school a request is for, from (in order):
 * 1. the Host subdomain under APP_BASE_DOMAIN (`greenfield.edutrack.ng` → slug `greenfield`);
 * 2. a verified custom domain;
 * 3. outside production only, the `x-tenant-id` / `x-school-slug` header (slug or school id).
 */
@Injectable()
export class TenantResolverService {
  private readonly baseDomain: string;
  private readonly production: boolean;
  private readonly cache = new Map<string, { at: number; school: HostSchool | null }>();

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    this.baseDomain = config.get('APP_BASE_DOMAIN', { infer: true }).toLowerCase();
    this.production = config.get('NODE_ENV', { infer: true }) === NodeEnv.Production;
  }

  /** Reads the Host header. Pure: no database. */
  hintFromHost(rawHost: string | undefined): HostHint | null {
    const host = (rawHost ?? '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
    if (!host || host === this.baseDomain || /^[\d.]+$/.test(host) || host.startsWith('['))
      return null;
    const suffix = `.${this.baseDomain}`;
    if (host.endsWith(suffix)) {
      const sub = host.slice(0, -suffix.length);
      if (!SLUG.test(sub) || RESERVED_SUBDOMAINS.has(sub)) return null;
      return { kind: 'slug', value: sub };
    }
    if (host === 'localhost' || host.endsWith('.localhost')) return null;
    return { kind: 'domain', value: host };
  }

  /** Reads the dev header; always null in production. */
  hintFromHeaders(headers: Record<string, string | string[] | undefined>): string | null {
    if (this.production) return null;
    for (const name of [TENANT_HEADER, DEV_SLUG_HEADER]) {
      const value = headers[name];
      const text = (Array.isArray(value) ? value[0] : value)?.trim().toLowerCase();
      if (text) return text;
    }
    return null;
  }

  async resolve(
    host: string | undefined,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<HostResolution> {
    const hint = this.hintFromHost(host);
    if (hint?.kind === 'slug') return this.bySlugOrId(hint.value);
    if (hint?.kind === 'domain') {
      const school = await this.cached(`domain:${hint.value}`, () =>
        this.prisma.school.findFirst({
          where: { customDomain: hint.value, customDomainVerifiedAt: { not: null } },
          select: { id: true, slug: true, name: true },
        }),
      );
      if (school) return { school };
    }
    const header = this.hintFromHeaders(headers);
    return header ? this.bySlugOrId(header) : {};
  }

  private async bySlugOrId(value: string): Promise<HostResolution> {
    const isId = UUID.test(value);
    if (!isId && !SLUG.test(value)) return { unknownSlug: value };
    const school = await this.cached(`school:${value}`, () =>
      this.prisma.school.findFirst({
        where: isId ? { id: value } : { slug: value },
        select: { id: true, slug: true, name: true },
      }),
    );
    return school ? { school } : { unknownSlug: value };
  }

  private async cached(key: string, load: () => Promise<HostSchool | null>) {
    const now = this.clock.nowMs();
    const hit = this.cache.get(key);
    if (hit && now - hit.at < CACHE_MS) return hit.school;
    const school = await load();
    if (this.cache.size >= CACHE_MAX) this.cache.clear();
    this.cache.set(key, { at: now, school });
    return school;
  }
}
