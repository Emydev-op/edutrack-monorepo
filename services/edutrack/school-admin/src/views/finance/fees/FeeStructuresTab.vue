<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import { useCopyStructureMutation } from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import type { FeesOverview } from '@/types';

import { financeTone, fmtDay } from '../finance-tones';

const props = defineProps<{ overview: FeesOverview }>();
const confirm = useConfirm();
const copy = useCopyStructureMutation();

type Row = FeesOverview['structures'][number];
const columns: Column[] = [
  { key: 'term', label: 'Term', width: 'minmax(170px,1.2fr)' },
  { key: 'branch', label: 'Branch', width: 'minmax(130px,1fr)' },
  { key: 'status', label: 'Status', width: '120px' },
  { key: 'levels', label: 'Classes', align: 'right', width: '80px' },
  { key: 'range', label: 'Compulsory per student', width: 'minmax(180px,1.2fr)' },
  { key: 'invoices', label: 'Invoices', align: 'right', width: '90px' },
  { key: 'publishedOn', label: 'Published', width: '110px' },
];
const rows = computed(() => props.overview.structures);
const open = (r: Row) => ({
  name: routesPath.finance.feeStructure.name,
  query: { term: r.termId, branch: r.branchId },
});

/** Terms in order; offer a copy into the first term that has no structures yet. */
const terms = computed(() => {
  const seen = new Map<string, Row[]>();
  for (const r of rows.value) seen.set(r.termId, [...(seen.get(r.termId) ?? []), r]);
  return [...seen.values()];
});
const copyTarget = computed(() => {
  const list = terms.value;
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1]!;
    const cur = list[i]!;
    if (
      cur.every((r) => r.status === 'Not created') &&
      prev.some((r) => r.status !== 'Not created')
    )
      return { from: prev[0]!, to: cur[0]! };
  }
  return null;
});

function copyNext() {
  const t = copyTarget.value!;
  void confirm({
    title: `Copy ${t.from.term} fees to ${t.to.term}?`,
    description: `Every branch gets a ${t.to.term} draft with ${t.from.term}’s amounts. Review them, then publish before generating invoices.`,
    details: [
      ['From', `${t.from.term} · ${t.from.session}`],
      ['To', `${t.to.term} · ${t.to.session}`],
      ['Status after copying', 'Draft'],
    ],
    confirmLabel: 'Copy as draft',
    action: async () => {
      await copy.mutateAsync({
        fromTermId: t.from.termId,
        toTermId: t.to.termId,
        allBranches: true,
      });
      toast.success(`${t.from.term} fees copied to ${t.to.term} as Draft.`);
    },
  });
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <InlineNotice
      v-for="n in overview.notices"
      :key="n.title"
      :tone="n.tone"
      :title="n.title"
      :description="n.description"
    >
      <template v-if="n.action" #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="n.action.to">{{ n.action.label }}</RouterLink></Button
        >
      </template>
    </InlineNotice>

    <DataTable
      title="Fee structures"
      description="What each class pays per term, at each branch. Only published structures can be invoiced."
      :columns="columns"
      :rows="rows"
      :row-key="(r) => `${r.termId}|${r.branchId}`"
      :row-label="(r) => `${r.term} · ${r.branch}`"
      min-width="900px"
      empty-text="No terms to plan for. Create an academic session first."
      :actions="(r) => [{ label: r.status === 'Not created' ? 'Create' : 'Open', to: open(r) }]"
    >
      <template #toolbar>
        <Button
          v-if="copyTarget"
          variant="outline"
          size="sm"
          :disabled="copy.isPending.value"
          @click="copyNext"
          >Copy {{ copyTarget.from.term }} to {{ copyTarget.to.term }}</Button
        >
      </template>
      <template #cell-term="{ row }">
        <RouterLink :to="open(row)" class="flex flex-col hover:underline">
          <span class="font-medium">{{ row.term }}</span>
          <span class="text-xs text-muted-foreground"
            >{{ row.session }} · {{ row.termStatus }}</span
          >
        </RouterLink>
      </template>
      <template #cell-status="{ row }">
        <StatusBadge :label="row.status" :tone="financeTone(row.status)" />
      </template>
      <template #cell-levels="{ row }">{{ row.levels || '—' }}</template>
      <template #cell-range="{ row }">
        <span class="tabular-nums">{{
          row.compulsoryRange
            ? row.compulsoryRange[0] === row.compulsoryRange[1]
              ? formatNaira(row.compulsoryRange[0])
              : `${formatNaira(row.compulsoryRange[0])} – ${formatNaira(row.compulsoryRange[1])}`
            : '—'
        }}</span>
      </template>
      <template #cell-invoices="{ row }">
        <span class="tabular-nums">{{ row.invoices.toLocaleString('en-NG') || '—' }}</span>
      </template>
      <template #cell-publishedOn="{ row }">{{ fmtDay(row.publishedOn) }}</template>
    </DataTable>
  </div>
</template>
