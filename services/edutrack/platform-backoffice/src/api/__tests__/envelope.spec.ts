import {
  getApiErrorCode,
  getApiErrorFields,
  getApiErrorMessage,
  messageOf,
  unwrapEnvelope,
} from '@edutrack/web-core/http';
import axios, { AxiosError, type AxiosAdapter } from 'axios';
import { describe, expect, it } from 'vitest';

/** A client whose "server" answers with the given status and body. */
function clientAnswering(status: number, body: unknown) {
  const adapter: AxiosAdapter = async (config) => {
    const response = { data: body, status, statusText: '', headers: {}, config };
    if (status >= 400) throw new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, response);
    return response;
  };
  const client = axios.create({ adapter });
  unwrapEnvelope(client);
  return client;
}

describe('API envelope', () => {
  it('hands screens the data and keeps the message for the toast', async () => {
    const api = clientAnswering(200, {
      success: true,
      message: 'Assigned to Ibrahim Yusuf.',
      data: { id: 'SUP-1171', assignee: 'Ibrahim Yusuf' },
    });
    const { data } = await api.patch('/v1/platform/support/issues/SUP-1171');
    expect(data).toEqual({ id: 'SUP-1171', assignee: 'Ibrahim Yusuf' });
    expect(messageOf(data, 'Assigned.')).toBe('Assigned to Ibrahim Yusuf.');
  });

  it('keeps paged lists as { data, meta }', async () => {
    const meta = { page: 1, pageSize: 10, total: 1, totalPages: 1 };
    const api = clientAnswering(200, {
      success: true,
      message: 'Tickets loaded.',
      data: [1],
      meta,
    });
    expect((await api.get('/v1/platform/support/issues')).data).toEqual({ data: [1], meta });
  });

  it('falls back to the screen’s wording when there is no message or no data', async () => {
    const api = clientAnswering(200, { success: true, message: '', data: { ok: true } });
    expect(messageOf((await api.post('/x')).data, 'Saved.')).toBe('Saved.');
    expect(messageOf(null, 'Saved.')).toBe('Saved.');
  });

  it('reads the message, code and fields of a failure', async () => {
    const api = clientAnswering(422, {
      success: false,
      message: 'Enter your password.',
      error: { code: 'VALIDATION', fields: { password: 'Enter your password.' } },
      requestId: 'req-1',
    });
    const error = await api.post('/v1/auth/login').catch((e: unknown) => e);
    expect(getApiErrorMessage(error)).toBe('Enter your password.');
    expect(getApiErrorCode(error)).toBe('VALIDATION');
    expect(getApiErrorFields(error)).toEqual({ password: 'Enter your password.' });
  });
});
