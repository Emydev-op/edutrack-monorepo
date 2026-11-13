import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type { ReportCatalog, ReportQuery, SchoolReport } from '@/types';

import { cleanParams, getRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const k = queryKeys.reports;

/** Every report the school can run, grouped as the Reports page lists them. */
export const useReportCatalogQuery = () =>
  useQuery({
    queryKey: k.key('catalog'),
    queryFn: () => getRequest<ReportCatalog>('/v1/reports'),
    staleTime: Infinity,
  });

/**
 * One report, computed for the working branch and the chosen filters. It reads data every module
 * changes, so it is always refetched when opened rather than trusted from the cache.
 */
export const useSchoolReportQuery = (
  id: MaybeRefOrGetter<string>,
  params: MaybeRefOrGetter<ReportQuery>,
) =>
  useQuery({
    queryKey: computed(() => k.key('report', toValue(id), cleanParams(toValue(params)))),
    queryFn: () =>
      getRequest<SchoolReport>(`/v1/reports/${encodeURIComponent(toValue(id))}`, {
        params: cleanParams(toValue(params)),
      }),
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
