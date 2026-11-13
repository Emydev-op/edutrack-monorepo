import {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import { MockHttpError, resolve } from './router';

const latency = () => new Promise((done) => setTimeout(done, 250 + Math.random() * 300));

function pathOf(config: InternalAxiosRequestConfig) {
  const url = new URL(config.url ?? '', 'http://mock.local/');
  // Strip the API base path (e.g. /api) so handlers only see /v1/…
  return url.pathname.replace(/^.*?(?=\/v1\/)/, '');
}

function queryOf(config: InternalAxiosRequestConfig) {
  const url = new URL(config.url ?? '', 'http://mock.local/');
  const query: Record<string, string> = Object.fromEntries(url.searchParams);
  for (const [key, value] of Object.entries((config.params ?? {}) as Record<string, unknown>)) {
    if (value !== undefined && value !== null && value !== '') query[key] = String(value);
  }
  return query;
}

function headersOf(config: InternalAxiosRequestConfig) {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.headers?.toJSON?.() ?? config.headers ?? {}))
    if (typeof value === 'string') headers[key.toLowerCase()] = value;
  return headers;
}

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse {
  return { data, status, statusText: String(status), headers: {}, config };
}

/** Answers requests in the browser, exactly where the real API will. */
export const mockAdapter: AxiosAdapter = async (config) => {
  await latency();
  const method = (config.method ?? 'get').toLowerCase();
  const path = pathOf(config);
  const route = resolve(method, path);

  if (!route) {
    const response = respond(config, 404, {
      statusCode: 404,
      message: `No mock for ${method.toUpperCase()} ${path}`,
    });
    throw new AxiosError(response.data.message, 'ERR_BAD_REQUEST', config, null, response);
  }

  try {
    const body =
      typeof config.data === 'string' && config.data ? JSON.parse(config.data) : config.data;
    const data = await route.handler({
      params: route.params,
      query: queryOf(config),
      body,
      headers: headersOf(config),
    });
    return respond(config, method === 'post' ? 201 : 200, structuredClone(data ?? null));
  } catch (error) {
    if (!(error instanceof MockHttpError)) throw error;
    const response = respond(config, error.status, {
      statusCode: error.status,
      message: error.message,
      error: error.code,
      ...(error.fields && { fields: error.fields }),
    });
    throw new AxiosError(
      error.message,
      error.status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
      config,
      null,
      response,
    );
  }
};
