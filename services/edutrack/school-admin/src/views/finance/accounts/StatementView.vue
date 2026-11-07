<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useSelection } from '@edutrack/app-kit/composables/useSelection';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useConfirmStatementMutation,
  useStatementQuery,
  useUpdateStatementLineMutation,
} from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import type { StatementLine } from '@/types';

import { financeTone, fmtDay } from '../finance-tones';

const r = routesPath.finance;
const route = useRoute();
const confirm = useConfirm();
const statementId = computed(() => String(route.params.statementId));
const accountId = computed(() => String(route.params.id));
const { data, isPending, isError } = useStatementQuery(statementId);
const updateLine = useUpdateStatementLineMutation();
const confirmLines = useConfirmStatementMutation();

const rows = computed(() => data.value?.rows ?? []);
const confirmable = (l: StatementLine) =>
  (l.match === 'Matched' || l.match === 'Possible match') && !!l.paymentId;
const open = (l: StatementLine) => l.match === 'No match' || l.match === 'Possible match';
const selection = useSelection(rows, (l) => l.id);

/** Matched lines are ticked for confirmation; possible matches wait for a decision. */
const toConfirm = computed(() => {
  const picked = selection.selectedRows().filter(confirmable);
  return picked.length ? picked : rows.value.filter((l) => l.match === 'Matched');
});
const total = computed(() => toConfirm.value.reduce((n, l) => n + l.credit, 0));

/** Pending payments of the same amount, not already linked to another line. */
function candidates(l: StatementLine) {
  const linked = new Set(
    rows.value.filter((x) => x.id !== l.id && x.paymentId).map((x) => x.paymentId),
  );
  return (data.value?.pendingInAccount ?? []).filter(
    (p) => p.amount === l.credit && !linked.has(p.id),
  );
}

async function relink(l: StatementLine, value: string) {
  try {
    await updateLine.mutateAsync({
      id: statementId.value,
      lineId: l.id,
      ...(value === '__ignore' ? { ignore: true } : { paymentId: value || null }),
    });
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'That didn’t save. Try again.'));
  }
}

function confirmAll() {
  const lines = toConfirm.value;
  if (!lines.length) return;
  void confirm({
    title: `Confirm ${lines.length} payment${lines.length === 1 ? '' : 's'}?`,
    description:
      'Each one becomes Confirmed, the student’s balance drops and a receipt is sent to the fee payer.',
    details: [
      ['Payments', String(lines.length)],
      ['Total', formatNaira(total.value)],
      ['Account', data.value?.account ?? ''],
      ['Possible matches', String(lines.filter((l) => l.match === 'Possible match').length)],
    ],
    acknowledgement: lines.some((l) => l.match === 'Possible match')
      ? 'I’ve checked the possible matches: the payer and amount are right.'
      : undefined,
    confirmLabel: 'Confirm payments',
    action: async () => {
      try {
        await confirmLines.mutateAsync({ id: statementId.value, lineIds: lines.map((l) => l.id) });
        selection.clear();
        toast.success(`${lines.length} payment${lines.length === 1 ? '' : 's'} confirmed.`);
      } catch (e) {
        throw new Error(getApiErrorMessage(e, 'That didn’t work. Try again.'));
      }
    },
  });
}

const columns: Column[] = [
  { key: 'date', label: 'Date', width: '96px' },
  { key: 'description', label: 'Statement line', width: 'minmax(220px,2fr)' },
  { key: 'amount', label: 'Amount', align: 'right', width: 'minmax(110px,1fr)' },
  { key: 'match', label: 'Match', width: 'minmax(130px,1fr)' },
  { key: 'payment', label: 'EduTrack payment', width: 'minmax(220px,1.8fr)' },
];
</script>

<template>
  <p v-if="isError" class="text-[13px] text-error-strong">This statement couldn’t load.</p>
  <Skeleton v-else-if="isPending" class="h-64 rounded-lg" />
  <template v-else-if="data">
    <PageHeader
      :title="data.fileName"
      :description="`${data.account} · uploaded ${fmtDay(data.uploadedOn)} by ${data.uploadedBy}`"
    >
      <template #actions>
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: r.accountDetail.name, params: { id: accountId } }"
            >Back to account</RouterLink
          ></Button
        >
        <Button :disabled="!toConfirm.length || confirmLines.isPending.value" @click="confirmAll">
          Confirm {{ toConfirm.length || '' }} payment{{ toConfirm.length === 1 ? '' : 's' }}
        </Button>
      </template>
    </PageHeader>

    <InlineNotice
      tone="info"
      title="How matching works"
      description="Each credit is compared with transfers waiting for verification: same amount and the payment’s reference or the student’s admission number in the narration is a match; same amount within 5 days is a possible match. Nothing changes until you confirm."
    />

    <MetricGrid>
      <MetricCard label="Lines read" :value="data.lines" />
      <MetricCard
        label="To confirm"
        :value="data.matched"
        :hint-tone="data.matched ? 'warning' : 'neutral'"
        :hint="data.matched ? 'Matched to pending transfers' : 'Nothing waiting'"
      />
      <MetricCard label="Already recorded" :value="data.confirmed" hint="Or confirmed now" />
      <MetricCard
        label="Unmatched"
        :value="data.unmatched"
        :hint="data.unmatched ? 'Record or ignore them' : 'All accounted for'"
        :hint-tone="data.unmatched ? 'error' : 'success'"
      />
    </MetricGrid>

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(l) => l.id"
      :selection="selection"
      min-width="900px"
      empty-text="No transactions in this file."
    >
      <template #bulk>
        <Button size="sm" :disabled="!toConfirm.length" @click="confirmAll"
          >Confirm selected</Button
        >
      </template>
      <template #cell-date="{ row }">{{ fmtDay(row.date, false) }}</template>
      <template #cell-description="{ row }">
        <span class="font-medium">{{ row.description || '—' }}</span>
        <span v-if="row.reference" class="text-xs text-faint">{{ row.reference }}</span>
      </template>
      <template #cell-amount="{ row }">
        <span v-if="row.credit" class="text-success-strong">+{{ formatNaira(row.credit) }}</span>
        <span v-else>−{{ formatNaira(row.debit) }}</span>
      </template>
      <template #cell-match="{ row }">
        <StatusBadge :label="row.match" :tone="financeTone(row.match)" />
        <span class="text-xs text-faint">{{ row.note }}</span>
      </template>
      <template #cell-payment="{ row }">
        <template v-if="row.paymentId">
          <RouterLink
            :to="{ name: r.paymentDetail.name, params: { id: row.paymentId } }"
            class="font-medium hover:text-primary hover:underline"
            >{{ row.paymentNo }}</RouterLink
          >
          <span class="text-xs text-muted-foreground">{{ row.student }}</span>
        </template>
        <select
          v-if="row.credit && open(row)"
          class="mt-1 h-8 w-full max-w-64 rounded-md border bg-card px-2 text-xs"
          :aria-label="`Link ${row.description} to a payment`"
          :value="row.paymentId ?? ''"
          :disabled="updateLine.isPending.value"
          @change="relink(row, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">
            {{
              row.paymentId
                ? 'Unlink'
                : candidates(row).length
                  ? 'Link to a pending payment…'
                  : 'No pending payment of this amount'
            }}
          </option>
          <option v-for="p in candidates(row)" :key="p.id" :value="p.id">
            {{ p.no }} · {{ p.student }} · {{ fmtDay(p.date, false) }}
          </option>
          <option value="__ignore">Ignore this line</option>
        </select>
        <RouterLink
          v-if="row.credit && row.match === 'No match' && !candidates(row).length"
          :to="{ name: r.paymentNew.name }"
          class="mt-1 text-xs font-medium text-primary hover:underline"
          >Record as a new payment</RouterLink
        >
        <span v-if="!row.paymentId && !(row.credit && open(row))" class="text-faint">—</span>
      </template>
    </DataTable>
  </template>
</template>
