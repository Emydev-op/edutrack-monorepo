import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { paginated } from '../pagination/pagination.js';
import { RAW_RESPONSE, RESPONSE_MESSAGE } from './api-response.js';
import { envelope } from './response-envelope.interceptor.js';

const SRC = join(import.meta.dirname, '..', '..');

function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : controllerFiles(path);
    return entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

describe('response envelope', () => {
  it('wraps a result as { success, message, data }', () => {
    expect(envelope({ id: 'SUP-1' }, 'Ticket loaded.')).toEqual({
      success: true,
      message: 'Ticket loaded.',
      data: { id: 'SUP-1' },
    });
  });

  it('sends a page as data plus meta side by side', () => {
    expect(envelope(paginated(['a'], 41, { page: 3, pageSize: 20 }), 'Loaded.')).toEqual({
      success: true,
      message: 'Loaded.',
      data: ['a'],
      meta: { page: 3, pageSize: 20, total: 41, totalPages: 3 },
    });
  });

  it('answers data: null when an action returns nothing', () => {
    expect(envelope(undefined, 'Signed out.')).toEqual({
      success: true,
      message: 'Signed out.',
      data: null,
    });
  });

  it('builds messages from the result and the request', () => {
    const message = (r: { name: string }, req: { body: { kind: string } }) =>
      `${r.name} ${req.body.kind}`;
    expect(
      envelope({ name: 'Plan' }, message, { body: { kind: 'saved' }, params: {} }),
    ).toMatchObject({
      message: 'Plan saved',
    });
  });

  it('every route says what happened (or opts out with @RawResponse)', async () => {
    const missing: string[] = [];
    let routes = 0;
    for (const file of controllerFiles(SRC)) {
      const exports = (await import(file)) as Record<string, unknown>;
      for (const value of Object.values(exports)) {
        if (typeof value !== 'function' || Reflect.getMetadata(PATH_METADATA, value) === undefined)
          continue;
        if (Reflect.getMetadata(RAW_RESPONSE, value)) continue;
        const proto = (value as { prototype: Record<string, unknown> }).prototype;
        for (const name of Object.getOwnPropertyNames(proto)) {
          const handler = proto[name];
          if (typeof handler !== 'function' || name === 'constructor') continue;
          if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
          routes++;
          if (
            Reflect.getMetadata(RESPONSE_MESSAGE, handler) === undefined &&
            !Reflect.getMetadata(RAW_RESPONSE, handler)
          )
            missing.push(`${relative(SRC, file)} → ${value.name}.${name}`);
        }
      }
    }
    expect(routes).toBeGreaterThan(80);
    expect(missing).toEqual([]);
  });
});
