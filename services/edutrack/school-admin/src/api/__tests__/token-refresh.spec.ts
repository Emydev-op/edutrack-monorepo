import { createHttpClient } from '@edutrack/web-core/http';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';

/**
 * The shared client renews an expired access token instead of signing the person out: the
 * School Admin bug where any action 15 minutes after sign-in showed "session expired".
 */
function setup(valid: { token: string }, refreshWorks = true) {
  const signedOut = vi.fn<() => void>();
  const refreshes = vi.fn<() => Promise<string>>(async () => {
    if (!refreshWorks) throw new Error('session ended');
    valid.token = 'fresh';
    return 'fresh';
  });
  let current = 'stale';
  const client = createHttpClient({
    baseURL: '/api',
    getAccessToken: () => current,
    refreshAccessToken: async () => (current = await refreshes()),
    onUnauthorized: signedOut,
  });
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const auth = String(config.headers.get('Authorization') ?? '');
    if (config.url === '/v1/fails') {
      const response = {
        status: 422,
        statusText: '',
        headers: {},
        config,
        data: { message: 'Nope' },
      };
      throw new AxiosError('422', 'ERR_BAD_REQUEST', config, null, response);
    }
    if (auth !== `Bearer ${valid.token}`) {
      const response = { status: 401, statusText: '', headers: {}, config, data: {} };
      throw new AxiosError('401', 'ERR_BAD_REQUEST', config, null, response);
    }
    return { status: 200, statusText: 'OK', headers: {}, config, data: { ok: true } };
  };
  client.defaults.adapter = adapter;
  return { client, signedOut, refreshes };
}

describe('access token refresh', () => {
  it('refreshes once and retries when the access token has expired', async () => {
    const { client, signedOut, refreshes } = setup({ token: 'fresh-not-yet' });
    const res = await client.get('/v1/students');
    expect(res.data).toEqual({ ok: true });
    expect(refreshes).toHaveBeenCalledTimes(1);
    expect(signedOut).not.toHaveBeenCalled();
  });

  it('shares one refresh between parallel requests', async () => {
    const { client, refreshes } = setup({ token: 'x' });
    await Promise.all([client.get('/v1/a'), client.get('/v1/b'), client.get('/v1/c')]);
    expect(refreshes).toHaveBeenCalledTimes(1);
  });

  it('signs out only when the session itself has ended', async () => {
    const { client, signedOut } = setup({ token: 'x' }, false);
    await expect(client.get('/v1/students')).rejects.toMatchObject({ response: { status: 401 } });
    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it('never refreshes for sign-in calls, and leaves other errors to the screen', async () => {
    const { client, signedOut, refreshes } = setup({ token: 'x' });
    await expect(client.post('/v1/auth/login', {})).rejects.toBeTruthy();
    expect(refreshes).not.toHaveBeenCalled();
    expect(signedOut).not.toHaveBeenCalled();
    await expect(client.get('/v1/fails')).rejects.toMatchObject({ response: { status: 422 } });
    expect(signedOut).not.toHaveBeenCalled();
  });
});
