import axios, { isAxiosError, type AxiosInstance } from 'axios';

import type { LoginResponse } from '@/types';

import { installMockApi } from '..';

export const PASSWORD = 'Edutrack2026!';

export function client(): AxiosInstance {
  const api = axios.create({ baseURL: '/api' });
  installMockApi(api);
  return api;
}

export async function signIn(email: string, password = PASSWORD): Promise<AxiosInstance> {
  const api = client();
  const { data } = await api.post<LoginResponse>('/v1/auth/login', { email, password });
  api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
  return api;
}

export async function failure(request: Promise<unknown>) {
  try {
    await request;
  } catch (e) {
    if (isAxiosError(e))
      return {
        status: e.response?.status,
        message: e.response?.data?.message as string,
        code: e.response?.data?.error as string | undefined,
      };
  }
  throw new Error('Expected the request to fail');
}
