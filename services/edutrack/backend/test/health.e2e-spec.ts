import { buildOpenApi } from '../src/common/http/openapi.js';
import { createTestApp, type TestApp } from './support/test-app.js';

// Requires the local stack: `npm run infra:up` from the repo root.
describe('Health and error shape (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('GET /api/health/live is public', () => {
    return t.http().get('/api/health/live').expect(200, { status: 'ok' });
  });

  it('answers unknown routes with the standard error body and a request id', async () => {
    const res = await t.http().get('/api/v1/nowhere').set('X-Request-Id', 'test-request-0001');
    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toBe('test-request-0001');
    expect(res.body).toEqual({
      success: false,
      message: expect.any(String),
      error: { code: 'NOT_FOUND' },
      requestId: 'test-request-0001',
    });
  });

  it('requires a token everywhere else', async () => {
    const res = await t.http().get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      success: false,
      message: 'Sign in to continue.',
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('builds the Swagger document for every route, in the envelope', () => {
    // A response class Swagger can't describe crashes /docs at request time; catch it here.
    const doc = buildOpenApi(t.app);
    const paths = Object.keys(doc.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/v1/public/school',
        '/api/v1/branches',
        '/api/v1/staff',
        '/api/v1/academics/classes/{id}',
        '/api/v1/setup',
      ]),
    );
    const ok = doc.paths['/api/v1/branches']!.get!.responses['200'] as {
      content: Record<string, { schema: { properties: Record<string, unknown> } }>;
    };
    expect(Object.keys(ok.content['application/json']!.schema.properties)).toEqual([
      'success',
      'message',
      'data',
    ]);
  });
});
