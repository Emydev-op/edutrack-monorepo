export type { TimelineEntry } from '@edutrack/app-kit/types';

export interface PageQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

/** Error codes the API answers with, beyond the HTTP status. */
export type ApiErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'TERM_LOCKED' | 'VALIDATION';
