<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { computed, watch } from 'vue';
import { RouterLink } from 'vue-router';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';

import { useMaterialsQuery } from '@/api/services/materials';
import AccessDenied from '@/components/common/AccessDenied.vue';
import { getApiErrorMessage, isForbidden } from '@/lib/api-errors';
import { formatDay } from '@/lib/dates';
import { routesPath as r } from '@/router/routes-path';
import type { MaterialList } from '@/types';

import { MATERIAL_ICON, materialSource } from './material-format';

/**
 * My materials for the selected term: title, class · subject, type, views, shared, status. Used by
 * the Materials page and the class page's Materials tab
 * (`<MaterialsTable arm-id="mc-jss2b" subject="MTH" />`, which hides the class column).
 */
const props = defineProps<{
  armId?: string;
  subject?: string;
  type?: string;
  /** Published or Archived. */
  status?: string;
  search?: string;
  title?: string;
  description?: string;
  emptyText?: string;
}>();
const page = defineModel<number>('page', { default: 1 });
const pageSize = defineModel<number>('pageSize', { default: 10 });
const emit = defineEmits<{ loaded: [list: MaterialList] }>();

const { data, isPending, error, refetch } = useMaterialsQuery(() => ({
  class: props.armId,
  subject: props.subject,
  type: props.type,
  status: props.status,
  search: props.search,
  page: page.value,
  pageSize: pageSize.value,
}));
watch(data, (d) => d && emit('loaded', d), { immediate: true });
watch(pageSize, () => page.value !== 1 && (page.value = 1));

const oneClass = computed(() => Boolean(props.armId && props.subject));
const columns = computed<Column[]>(() => [
  { key: 'title', label: 'Material', width: 'minmax(240px,2fr)' },
  ...(oneClass.value
    ? []
    : [{ key: 'classLabel', label: 'Class · subject', width: 'minmax(170px,1.2fr)' }]),
  { key: 'type', label: 'Type', width: '110px' },
  { key: 'views', label: 'Views', width: '70px', align: 'right' as const },
  { key: 'shared', label: 'Shared', width: '100px' },
  { key: 'status', label: 'Status', width: '100px' },
]);
const empty = computed(() => {
  if (props.emptyText) return props.emptyText;
  if (props.search) return 'No materials match your search.';
  if (props.type || props.status) return 'No materials match these filters.';
  return 'No materials yet. Upload notes, slides or a video link for your class.';
});
</script>

<template>
  <AccessDenied
    v-if="isForbidden(error)"
    what="these materials"
    :reason="getApiErrorMessage(error)"
  />
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="Materials couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <template #action>
      <button type="button" class="text-[13px] font-medium underline" @click="refetch()">
        Try again
      </button>
    </template>
  </InlineNotice>
  <DataTable
    v-else
    :title="title"
    :description="description"
    :columns="columns"
    :rows="data?.data ?? []"
    :row-key="(m) => m.id"
    :row-label="(m) => m.title"
    :loading="isPending"
    :meta="data?.meta"
    :empty-text="empty"
    min-width="700px"
    @update:page="page = $event"
    @update:page-size="pageSize = $event"
  >
    <template v-if="$slots.search" #search><slot name="search" /></template>
    <template v-if="$slots.filters" #filters><slot name="filters" /></template>
    <template #cell-title="{ row }">
      <RouterLink
        :to="{ name: r.materials.detail.name, params: { materialId: row.id } }"
        class="flex w-full min-w-0 items-start gap-2.5 hover:underline"
      >
        <component
          :is="MATERIAL_ICON[row.type]"
          class="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span class="flex min-w-0 flex-col">
          <span class="font-medium text-foreground">{{ row.title }}</span>
          <span class="truncate text-xs text-faint">{{ materialSource(row) }}</span>
        </span>
      </RouterLink>
    </template>
    <template #cell-views="{ row }">{{ row.views }}</template>
    <template #cell-shared="{ row }">{{ formatDay(row.publishedAt.slice(0, 10), false) }}</template>
    <template #cell-status="{ row }"><StatusBadge :label="row.status" /></template>
  </DataTable>
</template>
