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
    expect(res.body).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      error: 'NOT_FOUND',
      requestId: 'test-request-0001',
    });
  });

  it('requires a token everywhere else', async () => {
    const res = await t.http().get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED', message: 'Sign in to continue.' });
  });
});
