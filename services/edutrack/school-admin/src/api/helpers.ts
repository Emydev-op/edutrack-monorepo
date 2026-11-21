import { isAxiosError, type AxiosRequestConfig } from 'axios';

import { apiClient } from './client';

export async function getRequest<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await apiClient.get<T>(url, config);
  return data;
}

/** A raw file (not the JSON envelope), e.g. an Excel template. Sent with the user's token. */
export async function getBlob(url: string, config?: AxiosRequestConfig): Promise<Blob> {
  try {
    const { data } = await apiClient.get<Blob>(url, { ...config, responseType: 'blob' });
    return data;
  } catch (error) {
    // Errors come back as a Blob too; parse it so getApiErrorMessage() can read the message.
    if (isAxiosError(error) && error.response?.data instanceof Blob) {
      try {
        error.response.data = JSON.parse(await error.response.data.text());
      } catch {
        // Not JSON: keep the generic message.
      }
    }
    throw error;
  }
}

/**
 * Saves a file from the API (a PDF, a template) to the browser's downloads, named as the server
 * says (Content-Disposition) or `fallbackName`.
 */
export async function downloadFile(url: string, fallbackName: string) {
  let res;
  try {
    res = await apiClient.get<Blob>(url, { responseType: 'blob' });
  } catch (error) {
    // Errors come back as a Blob too; parse it so getApiErrorMessage() can read the message.
    if (isAxiosError(error) && error.response?.data instanceof Blob) {
      try {
        error.response.data = JSON.parse(await error.response.data.text());
      } catch {
        // Not JSON: keep the generic message.
      }
    }
    throw error;
  }
  const disposition = String(res.headers['content-disposition'] ?? '');
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const href = URL.createObjectURL(res.data);
  Object.assign(document.createElement('a'), { href, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export async function postRequest<T, B = unknown>(
  url: string,
  body?: B,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.post<T>(url, body, config);
  return data;
}

export async function patchRequest<T, B = unknown>(
  url: string,
  body?: B,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.patch<T>(url, body, config);
  return data;
}

export async function putRequest<T, B = unknown>(
  url: string,
  body?: B,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.put<T>(url, body, config);
  return data;
}

export async function deleteRequest<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await apiClient.delete<T>(url, config);
  return data;
}

/** Drops empty filter values so query keys and URLs only carry what the user chose. */
export function cleanParams<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  ) as Partial<T>;
}
