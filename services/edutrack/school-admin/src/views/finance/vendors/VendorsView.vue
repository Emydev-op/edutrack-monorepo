<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import { useVendorsQuery } from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import type { VendorRow } from '@/types';

import { compactNaira, financeTone, fmtDay } from '../finance-tones';
import VendorDrawer from './VendorDrawer.vue';

const route = useRoute();
const router = useRouter();
const status = useRouteQuery<string>('status', '');
const category = useRouteQuery<string>('category', '');
const search = ref('');
const debounced = refDebounced(search, 300);

const { data, isPending } = useVendorsQuery(() => ({
  status: status.value || undefined,
  category: category.value || undefined,
  search: debounced.value || undefined,
}));

const drawerOpen = ref(route.query.new === '1');
watch(drawerOpen, (o) => {
  if (!o && route.query.new) void router.replace({ query: { ...route.query, new: undefined } });
});

const columns: Column[] = [
  { key: 'name', label: 'Vendor', width: 'minmax(200px,1.6fr)' },
  { key: 'contact', label: 'Contact', width: 'minmax(170px,1.3fr)' },
  { key: 'bank', label: 'Bank', width: 'minmax(130px,1fr)' },
  { key: 'paid', label: 'Paid this session', align: 'right', width: '140px' },
  { key: 'outstanding', label: 'Outstanding', align: 'right', width: '120px' },
  { key: 'expenses', label: 'Expenses', align: 'right', width: '90px' },
  { key: 'lastExpense', label: 'Last expense', width: '115px' },
  { key: 'status', label: 'Status', width: '100px' },
];

const bankLabel = (v: VendorRow) =>
  !v.bank
    ? '—'
    : v.bank === 'Direct debit'
      ? 'Direct debit'
      : `${v.bank} ****${v.accountNumber.slice(-4)}`;
const filtered = computed(() => !!status.value || !!category.value || !!debounced.value);
</script>

<template>
  <PageHeader title="Vendors" description="Suppliers and service providers">
    <template #actions>
      <Button @click="drawerOpen = true">Add vendor</Button>
    </template>
  </PageHeader>

  <MetricGrid>
    <MetricCard
      label="Paid this session"
      :value="data ? compactNaira(data.paid) : undefined"
      :loading="!data"
    />
    <MetricCard
      label="Outstanding"
      :value="data ? compactNaira(data.outstanding) : undefined"
      :loading="!data"
      hint="Submitted or approved, not yet paid"
      :hint-tone="data?.outstanding ? 'warning' : 'neutral'"
    />
    <MetricCard label="Active vendors" :value="data?.active" :loading="!data" />
  </MetricGrid>

  <DataTable
    :columns="columns"
    :rows="data?.rows ?? []"
    :row-key="(v) => v.id"
    :row-label="(v) => v.name"
    :loading="isPending"
    min-width="1040px"
    :empty-text="
      filtered ? 'No vendors match. Clear the search or filters.' : 'No vendors yet. Add one.'
    "
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Name, category, contact or phone"
    /></template>
    <template #filters>
      <FilterMenu v-model="category" label="Category" :options="data?.categories ?? []" />
      <FilterMenu v-model="status" label="Status" :options="['Active', 'Inactive']" />
    </template>
    <template #cell-name="{ row }">
      <CellLink
        :to="{ name: routesPath.finance.vendorDetail.name, params: { id: row.id } }"
        :label="row.name"
        :detail="row.category"
      />
    </template>
    <template #cell-contact="{ row }">
      <span class="flex flex-col">
        <span>{{ row.contactName || '—' }}</span>
        <span v-if="row.phone" class="text-xs text-faint tabular-nums">{{ row.phone }}</span>
      </span>
    </template>
    <template #cell-bank="{ row }">{{ bankLabel(row) }}</template>
    <template #cell-paid="{ row }"
      ><span class="tabular-nums">{{ formatNaira(row.paid) }}</span></template
    >
    <template #cell-outstanding="{ row }">
      <span
        :class="
          cn('tabular-nums', row.outstanding ? 'font-medium text-error-strong' : 'text-faint')
        "
        >{{ formatNaira(row.outstanding) }}</span
      >
    </template>
    <template #cell-expenses="{ row }"
      ><span class="tabular-nums">{{ row.expenses }}</span></template
    >
    <template #cell-lastExpense="{ row }">{{ fmtDay(row.lastExpense) }}</template>
    <template #cell-status="{ row }"
      ><StatusBadge :label="row.status" :tone="financeTone(row.status)"
    /></template>
  </DataTable>

  <VendorDrawer v-model:open="drawerOpen" :categories="data?.categories" />
</template>
