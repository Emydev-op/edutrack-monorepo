import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { seedDemoData } from '../../prisma/seed/demo-data.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { Clock, FixedClock } from '../../src/common/clock/clock.js';
import type { TemplateDataMap, TemplateName } from '../../src/notifications/templates/templates.js';
import { NotificationsService } from '../../src/notifications/notifications.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../src/redis/redis.constants.js';

export const PASSWORD = 'Edutrack2026!';

export interface SentMessage {
  channel: 'email' | 'sms';
  to: string;
  template: TemplateName;
  data: TemplateDataMap[TemplateName];
}

/** Captures what would be queued, so tests can follow reset and invitation links. */
export class FakeNotifications {
  readonly sent: SentMessage[] = [];

  email<T extends TemplateName>(to: string, template: T, data: TemplateDataMap[T]) {
    this.sent.push({ channel: 'email', to, template, data });
    return Promise.resolve();
  }

  sms<T extends TemplateName>(to: string, template: T, data: TemplateDataMap[T]) {
    this.sent.push({ channel: 'sms', to, template, data });
    return Promise.resolve();
  }

  find(to: string, template: TemplateName) {
    return [...this.sent].reverse().find((m) => m.to === to && m.template === template);
  }

  /** Waits for a message queued after the response (forgot-password works in the background). */
  async waitFor(to: string, template: TemplateName, timeoutMs = 5_000): Promise<SentMessage> {
    const started = Date.now();
    for (;;) {
      const found = this.find(to, template);
      if (found) return found;
      if (Date.now() - started > timeoutMs) throw new Error(`No ${template} message for ${to}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  clear() {
    this.sent.length = 0;
  }
}

export interface TestApp {
  app: INestApplication<App>;
  clock: FixedClock;
  notifications: FakeNotifications;
  prisma: PrismaService;
  redis: Redis;
  http: () => ReturnType<typeof request>;
  /** Brings the demo data back to its seeded state and clears Redis (sessions cache, counters). */
  reseed: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createTestApp(controllers: Type[] = []): Promise<TestApp> {
  const clock = new FixedClock();
  const notifications = new FakeNotifications();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(NotificationsService)
    .useValue(notifications)
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  const redis = app.get<Redis>(REDIS_CLIENT);
  return {
    app,
    clock,
    notifications,
    prisma,
    redis,
    http: () => request(app.getHttpServer()),
    reseed: async () => {
      clock.set(Date.now());
      await seedDemoData(prisma, clock.now());
      await redis.flushdb();
      notifications.clear();
    },
    close: () => app.close(),
  };
}

let ipCounter = 0;
/** A fresh client IP per call (via X-Forwarded-For from loopback), so rate limits don't collide. */
export const nextIp = () => {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
};

/** The value of a Set-Cookie for `name`, or undefined. */
export function cookieFrom(res: request.Response, name: string): string | undefined {
  const header = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  const list = Array.isArray(header) ? header : header ? [header] : [];
  const line = list.find((c) => c.startsWith(`${name}=`));
  return line?.slice(name.length + 1).split(';')[0];
}

export function setCookieLine(res: request.Response, name: string): string | undefined {
  const header = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  const list = Array.isArray(header) ? header : header ? [header] : [];
  return list.find((c) => c.startsWith(`${name}=`));
}

export interface LoginOptions {
  portal?: string;
  host?: string;
  tenant?: string;
  remember?: boolean;
  ip?: string;
  schoolId?: string;
  userAgent?: string;
}

/** POST /api/v1/auth/login. */
export function login(t: TestApp, email: string, password = PASSWORD, o: LoginOptions = {}) {
  let req = t
    .http()
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', o.ip ?? nextIp())
    .set('User-Agent', o.userAgent ?? 'Mozilla/5.0 (Macintosh) Chrome/130.0 Safari/537.36');
  if (o.host) req = req.set('Host', o.host);
  if (o.tenant) req = req.set('x-tenant-id', o.tenant);
  return req.send({
    email,
    password,
    remember: o.remember ?? false,
    ...(o.portal && { portal: o.portal }),
    ...(o.schoolId && { schoolId: o.schoolId }),
  });
}

/** Signs in and returns the access token and refresh cookie (fails the test on any error). */
export async function signIn(t: TestApp, email: string, o: LoginOptions = {}) {
  const res = await login(t, email, PASSWORD, o);
  if (res.status !== 200)
    throw new Error(`Sign-in failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const portal = o.portal ?? (o.host || o.tenant ? 'teacher' : 'school_admin');
  return {
    res,
    token: res.body.accessToken as string,
    cookie: cookieFrom(res, `et_rt_${portal}`)!,
    cookieName: `et_rt_${portal}`,
    body: res.body,
  };
}

/** An authenticated request helper. */
export function authed(t: TestApp, token: string, o: { host?: string; tenant?: string } = {}) {
  const wrap = (req: request.Test) => {
    let r = req.set('Authorization', `Bearer ${token}`).set('X-Forwarded-For', nextIp());
    if (o.host) r = r.set('Host', o.host);
    if (o.tenant) r = r.set('x-tenant-id', o.tenant);
    return r;
  };
  return {
    get: (path: string) => wrap(t.http().get(path)),
    post: (path: string) => wrap(t.http().post(path)),
    patch: (path: string) => wrap(t.http().patch(path)),
    put: (path: string) => wrap(t.http().put(path)),
    delete: (path: string) => wrap(t.http().delete(path)),
  };
}
