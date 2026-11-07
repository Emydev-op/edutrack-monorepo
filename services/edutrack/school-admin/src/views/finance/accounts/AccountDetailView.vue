<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { ArrowLeftRightIcon, DownloadIcon, FileUpIcon, PencilIcon } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import ColumnChart from '@edutrack/app-kit/components/common/ColumnChart.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import DateRangeFilter, {
  type DateRangeValue,
} from '@edutrack/app-kit/components/common/DateRangeFilter.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useAccountsQuery,
  useBankAccountQuery,
  useFinanceOptionsQuery,
  useSampleStatementMutation,
  useUploadStatementMutation,
} from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import type { LedgerRow } from '@/types';

import { compactNaira, fmtDay } from '../finance-tones';

import AccountDrawer from './AccountDrawer.vue';
import TransferDrawer from './TransferDrawer.vue';

const r = routesPath.finance;
const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));

const search = ref('');
const debounced = refDebounced(search, 300);
const kind = ref('');
const range = ref<DateRangeValue>({});
const page = ref(1);
const pageSize = ref(20);
watch([debounced, kind, range], () => (page.value = 1));

const { data, isPending, isError } = useBankAccountQuery(id, () => ({
  search: debounced.value || undefined,
  kind: kind.value || undefined,
  from: range.value.from,
  to: range.value.to,
  page: page.value,
  pageSize: pageSize.value,
}));
const { data: list } = useAccountsQuery();
const { data: options } = useFinanceOptionsQuery();
const sample = useSampleStatementMutation();
const upload = useUploadStatementMutation();

const isBank = computed(() => data.value?.kind === 'Bank');
const uploadOpen = ref(route.query.upload === '1');
const fileInput = ref<HTMLInputElement | null>(null);
const uploadError = ref('');

const drawer = ref(false);
const moving = ref(false);

const monthly = computed(() =>
  (data.value?.monthly ?? []).flatMap((m) => [
    { label: `${m.label} in`, value: m.moneyIn, display: compactNaira(m.moneyIn) },
    {
      label: `${m.label} out`,
      value: m.moneyOut,
      display: compactNaira(m.moneyOut),
      color: '#E8CFC3',
    },
  ]),
);

const columns: Column[] = [
  { key: 'date', label: 'Date', width: '100px' },
  { key: 'description', label: 'Details', width: 'minmax(260px,2.2fr)' },
  { key: 'moneyIn', label: 'Money in', align: 'right', width: 'minmax(110px,1fr)' },
  { key: 'moneyOut', label: 'Money out', align: 'right', width: 'minmax(110px,1fr)' },
  { key: 'balance', label: 'Balance', align: 'right', width: 'minmax(120px,1fr)' },
];

async function sendStatement(fileName: string, text: string) {
  uploadError.value = '';
  try {
    const st = await upload.mutateAsync({ accountId: id.value, fileName, text });
    toast.success(`${st.lines} lines read · ${st.matched} matched.`);
    await router.push({ name: r.statement.name, params: { id: id.value, statementId: st.id } });
  } catch (e) {
    uploadError.value = getApiErrorMessage(e, 'That file couldn’t be read. Try again.');
  }
}

function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (!/\.csv$/i.test(file.name)) {
    uploadError.value =
      'Choose a CSV file. Most banks offer “Export to CSV” on the statement page.';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => void sendStatement(file.name, String(reader.result ?? ''));
  reader.onerror = () => (uploadError.value = 'That file couldn’t be opened.');
  reader.readAsText(file);
  (event.target as HTMLInputElement).value = '';
}

async function downloadSample() {
  try {
    const s = await sample.mutateAsync(id.value);
    const url = URL.createObjectURL(new Blob([s.text], { type: 'text/csv;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: s.fileName });
    link.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Couldn’t build the sample.'));
  }
}

async function useSample() {
  try {
    const s = await sample.mutateAsync(id.value);
    await sendStatement(s.fileName, s.text);
  } catch (e) {
    uploadError.value = getApiErrorMessage(e, 'Couldn’t build the sample.');
  }
}

const accountRow = computed(() => list.value?.rows.find((a) => a.id === id.value) ?? null);
const bankRows = computed(() =>
  data.value
    ? [
        ...(isBank.value
          ? [
              { label: 'Bank', value: data.value.bank },
              { label: 'Account number', value: data.value.accountNumber },
              { label: 'Account name', value: data.value.accountName },
            ]
          : [{ label: 'Type', value: 'Cash' }]),
        { label: 'Branch', value: data.value.branch },
        {
          label: 'Opening balance',
          value: `${formatNaira(data.value.openingBalance)} · ${fmtDay(data.value.openingDate)}`,
        },
        {
          label: 'Pending verification',
          value: data.value.pending ? formatNaira(data.value.pending) : 'Nothing waiting',
        },
      ]
    : [],
);
const rowKey = (row: LedgerRow) => row.id;
</script>

<template>
  <p v-if="isError" class="text-[13px] text-error-strong">This account couldn’t load.</p>
  <Skeleton v-else-if="isPending" class="h-64 rounded-lg" />
  <template v-else-if="data">
    <PageHeader
      :title="data.name"
      :status="data.status === 'Inactive' ? 'Inactive' : undefined"
      :description="`Balance ${formatNaira(data.balance)}${data.pending ? ` · ${formatNaira(data.pending)} waiting for verification` : ''}`"
      :meta="
        data.showToParents
          ? [{ label: 'Shown to parents', value: 'on invoices and reminders' }]
          : undefined
      "
    >
      <template #actions>
        <Button variant="outline" @click="drawer = true"><PencilIcon class="size-4" /> Edit</Button>
        <Button v-if="data.status === 'Active'" variant="outline" @click="moving = true"
          ><ArrowLeftRightIcon class="size-4" /> Move money</Button
        >
        <Button v-if="isBank && data.status === 'Active'" @click="uploadOpen = !uploadOpen"
          ><FileUpIcon class="size-4" /> Upload statement</Button
        >
      </template>
    </PageHeader>

    <SectionCard
      v-if="uploadOpen && isBank"
      title="Upload a bank statement"
      description="Export the statement as CSV from internet banking. EduTrack matches each credit to a transfer waiting for verification, by amount and the reference or admission number in the narration."
    >
      <div class="flex flex-col gap-3">
        <InlineNotice
          v-if="uploadError"
          tone="error"
          title="Couldn’t upload"
          :description="uploadError"
          role="alert"
        />
        <input
          ref="fileInput"
          type="file"
          accept=".csv,text/csv"
          class="sr-only"
          aria-label="Choose a CSV bank statement"
          @change="onFile"
        />
        <div class="flex flex-wrap gap-2">
          <Button :disabled="upload.isPending.value" @click="fileInput?.click()"
            ><FileUpIcon class="size-4" /> Choose CSV file</Button
          >
          <Button
            variant="outline"
            :disabled="sample.isPending.value || upload.isPending.value"
            @click="useSample"
            >Try it with a sample statement</Button
          >
          <Button variant="ghost" :disabled="sample.isPending.value" @click="downloadSample"
            ><DownloadIcon class="size-4" /> Download sample</Button
          >
        </div>
        <p class="text-xs text-muted-foreground">
          Columns needed: Date, Description (or Narration), Reference, Credit and Debit. The sample
          is built from this account’s recent and pending transfers, so you can see matching work.
        </p>
      </div>
    </SectionCard>

    <div class="grid gap-4 lg:grid-cols-[1fr_1.3fr] [&>*]:min-w-0">
      <KeyValueCard title="Account details" :rows="bankRows" />
      <SectionCard title="Money in and out" description="Last four months">
        <ColumnChart :bars="monthly" :height="110" label="Money in and out per month" />
      </SectionCard>
    </div>

    <DataTable
      title="Transactions"
      description="Payments, expenses, refunds and transfers recorded against this account, newest first."
      :columns="columns"
      :rows="data.ledger.data"
      :row-key="rowKey"
      :meta="data.ledger.meta"
      min-width="760px"
      empty-text="No transactions match."
      @update:page="page = $event"
      @update:page-size="
        (s) => {
          pageSize = s;
          page = 1;
        }
      "
    >
      <template #search
        ><SearchInput v-model="search" placeholder="Reference or details"
      /></template>
      <template #filters>
        <FilterMenu
          v-model="kind"
          label="Type"
          :options="['Payment', 'Expense', 'Refund', 'Transfer']"
        />
        <DateRangeFilter v-model="range" />
      </template>
      <template #cell-date="{ row }">{{ fmtDay(row.date) }}</template>
      <template #cell-description="{ row }">
        <RouterLink
          v-if="row.to"
          :to="row.to"
          class="font-medium hover:text-primary hover:underline"
          >{{ row.ref }}</RouterLink
        >
        <span v-else class="font-medium">{{ row.ref }}</span>
        <span class="text-xs text-muted-foreground">{{ row.kind }} · {{ row.description }}</span>
      </template>
      <template #cell-moneyIn="{ row }"
        ><span :class="row.moneyIn ? 'text-success-strong' : 'text-faint'">{{
          row.moneyIn ? formatNaira(row.moneyIn) : '—'
        }}</span></template
      >
      <template #cell-moneyOut="{ row }"
        ><span :class="!row.moneyOut && 'text-faint'">{{
          row.moneyOut ? formatNaira(row.moneyOut) : '—'
        }}</span></template
      >
      <template #cell-balance="{ row }"
        ><span class="font-medium">{{ formatNaira(row.balance) }}</span></template
      >
    </DataTable>

    <SectionCard v-if="isBank" title="Bank statements" flush>
      <ul class="flex flex-col divide-y divide-divider">
        <li v-for="s in data.statements" :key="s.id">
          <RouterLink
            :to="{ name: r.statement.name, params: { id: data.id, statementId: s.id } }"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px] hover:bg-muted"
          >
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate font-medium">{{ s.fileName }}</span>
              <span class="text-xs text-faint"
                >Uploaded {{ fmtDay(s.uploadedOn) }} by {{ s.uploadedBy }} ·
                {{ s.lines }} lines</span
              >
            </span>
            <StatusBadge v-if="s.matched" :label="`${s.matched} to confirm`" tone="warning" />
            <StatusBadge v-if="s.unmatched" :label="`${s.unmatched} unmatched`" tone="error" />
            <StatusBadge :label="`${s.confirmed} recorded`" tone="success" />
          </RouterLink>
        </li>
      </ul>
      <p v-if="!data.statements.length" class="px-4 py-6 text-[13px] text-muted-foreground">
        No statements uploaded yet.
      </p>
    </SectionCard>

    <AccountDrawer
      v-model:open="drawer"
      :account="accountRow"
      :banks="list?.banks ?? []"
      :branches="options?.branches ?? []"
    />
    <TransferDrawer v-model:open="moving" :accounts="list?.rows ?? []" :from-id="data.id" />
  </template>
</template>
