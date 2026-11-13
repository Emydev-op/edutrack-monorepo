<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useResultSheetQuery, useSheetActionMutation } from '@/api/services/academics';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import { useLayoutStore } from '@/stores/layout';
import type { ScoreValue, SheetRow } from '@/types';

import { sheetStatusLabel } from './sheet-status';

const route = useRoute();
const confirm = useConfirm();
const context = useContextStore();
const layout = useLayoutStore();
const armId = computed(() => String(route.params.armId));
const subject = computed(() => String(route.params.subject));
const { data: sheet, isPending, error } = useResultSheetQuery(armId, subject);
const act = useSheetActionMutation();

watch(sheet, (s) => layout.setRecordLabel(s ? `${s.arm} · ${s.subjectName}` : null), {
  immediate: true,
});

const passMark = computed(() => sheet.value?.passMark ?? 40);
const canDecide = computed(() => !!sheet.value?.canDecide);
const teacher = computed(() => sheet.value?.teacher ?? 'the teacher');

const columns = computed<Column[]>(() => [
  { key: 'name', label: 'Student', width: 'minmax(180px,1.5fr)' },
  ...(sheet.value?.components ?? []).map((c, i) => ({
    key: `c${i}`,
    label: `${c.name} /${c.max}`,
    align: 'right' as const,
    width: 'minmax(84px,0.6fr)',
  })),
  { key: 'total', label: 'Total', align: 'right', width: '80px' },
  { key: 'grade', label: 'Grade', width: '64px' },
  { key: 'flag', label: 'Flag / remark', width: 'minmax(200px,1.8fr)' },
]);
const rows = computed(() =>
  (sheet.value?.rows ?? []).map((r) => ({
    ...r,
    ...Object.fromEntries(r.scores.map((v, i) => [`c${i}`, v])),
  })),
);
type Row = SheetRow & Record<string, unknown>;
const scoreOf = (row: Row, i: number) => row[`c${i}`] as ScoreValue;
const scoreClass = (v: ScoreValue) =>
  v === 'ABS'
    ? 'font-medium text-info-strong'
    : v === 'EXM'
      ? 'font-medium text-neutral-strong'
      : v === null
        ? 'text-error-strong'
        : '';

function approve() {
  const s = sheet.value!;
  void confirm({
    title: `Approve ${s.arm} ${s.subjectName}?`,
    details: [
      ['Students', String(s.stats.count)],
      ['Class average', s.stats.average === null ? '—' : `${s.stats.average}%`],
      [
        'Flags',
        [s.stats.absent && `${s.stats.absent} absent`, s.stats.exempt && `${s.stats.exempt} exempt`]
          .filter(Boolean)
          .join(' · ') || 'None',
      ],
      ['Status', 'Approved. The teacher can no longer edit it.'],
      ['Authorised by', 'You · results.approve'],
    ],
    confirmLabel: 'Approve sheet',
    action: async () => {
      await act.mutateAsync({ armId: s.armId, subject: s.subject, action: 'approve' });
      toast.success(`${s.arm} ${s.subjectName} approved.`);
    },
  });
}

function returnSheet() {
  const s = sheet.value!;
  void confirm({
    title: `Return ${s.arm} ${s.subjectName} to ${teacher.value}?`,
    details: [
      ['Status', 'Back to Draft, editable by the teacher'],
      ['Notifies', teacher.value],
    ],
    input: {
      label: 'Comment sent with the return',
      placeholder: 'e.g. Please confirm CA 2 for two students and add the make-up date.',
      required: true,
    },
    confirmLabel: 'Return sheet',
    tone: 'destructive',
    action: async ({ text }) => {
      await act.mutateAsync({ armId: s.armId, subject: s.subject, action: 'return', note: text });
      toast.success(`Returned to ${teacher.value}.`);
    },
  });
}
</script>

<template>
  <Skeleton v-if="isPending" class="h-96" />
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="This result sheet can't be opened"
    :description="getApiErrorMessage(error)"
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: routesPath.academics.results.name }"
          >Back to results</RouterLink
        ></Button
      >
    </template>
  </InlineNotice>
  <template v-else-if="sheet">
    <PageHeader
      :title="`${sheet.arm} · ${sheet.subjectName}`"
      :status="sheetStatusLabel(sheet.status)"
      :description="`Results · ${sheet.term} · ${context.current.session} · ${sheet.teacher ?? 'No teacher assigned'}${sheet.department ? ` · ${sheet.department}` : ''}${sheet.submittedAt ? ` · submitted ${sheet.submittedAt}` : ''}`"
    >
      <template v-if="canDecide" #actions>
        <Button variant="outline" @click="returnSheet">Return to teacher</Button>
        <Button
          :disabled="sheet.stats.missing > 0"
          :title="sheet.stats.missing ? 'Missing scores block approval. Return the sheet.' : ''"
          @click="approve"
          >Approve</Button
        >
      </template>
    </PageHeader>

    <InlineNotice
      v-if="sheet.withHod"
      tone="info"
      :title="`With ${sheet.hod} for review`"
      :description="`${teacher} submitted this sheet to their HOD. You can view it here; approve or return it once the HOD forwards it to the academic office as Under review.`"
    />
    <InlineNotice
      v-if="
        sheet.status === 'Draft' || sheet.status === 'Not started' || sheet.status === 'Returned'
      "
      tone="neutral"
      :title="
        sheet.status === 'Returned'
          ? `Returned to the teacher by ${sheet.returnedBy ?? 'a reviewer'}`
          : 'Not submitted yet'
      "
      :description="`${sheet.status === 'Returned' && sheet.returnNote ? `${sheet.returnedBy === 'the academic office' ? 'Your comment' : 'Comment'}: “${sheet.returnNote}”. ` : ''}You can view the draft, but it can only be approved after ${teacher} ${sheet.status === 'Returned' ? 'resubmits' : 'submits'} it in the Teacher Workspace${sheet.hod && sheet.returnedBy !== 'the academic office' ? ` and ${sheet.hod} forwards it` : ''}.`"
    />
    <InlineNotice
      v-if="sheet.status === 'Published'"
      tone="brand"
      title="Published and locked"
      description="Scores can't be edited. Use a correction request to change a published score."
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: routesPath.academics.corrections.name }"
            >Correction requests</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>
    <InlineNotice
      v-if="canDecide && sheet.stats.missing"
      tone="error"
      :title="`${sheet.stats.missing} student${sheet.stats.missing > 1 ? 's have' : ' has'} missing scores`"
      description="Missing scores block approval. Return the sheet so the teacher can complete it."
    />

    <div class="grid gap-3 md:grid-cols-3">
      <KeyValueCard
        title="Summary"
        :rows="[
          {
            label: 'Class average',
            value: sheet.stats.average === null ? null : `${sheet.stats.average}%`,
          },
          {
            label: 'Highest',
            value: sheet.stats.highest === null ? null : `${sheet.stats.highest}%`,
          },
          {
            label: 'Lowest',
            value: sheet.stats.lowest === null ? null : `${sheet.stats.lowest}%`,
          },
          { label: `Pass (≥ ${passMark})`, value: `${sheet.stats.passed} of ${sheet.stats.count}` },
        ]"
      />
      <KeyValueCard
        title="Flags"
        :rows="[
          {
            label: 'Absent',
            value: String(sheet.stats.absent),
            emphasis: sheet.stats.absent ? 'strong' : undefined,
          },
          { label: 'Exempt', value: String(sheet.stats.exempt) },
          {
            label: 'Missing',
            value: sheet.stats.missing ? `${sheet.stats.missing} · blocks approval` : 'None',
            emphasis: sheet.stats.missing ? 'error' : 'success',
          },
        ]"
      />
      <KeyValueCard
        title="Scheme"
        :rows="
          sheet.components.map((c) => ({
            label: c.name,
            value: `max ${c.max} · ${c.weight}%`,
          }))
        "
      />
    </div>

    <DataTable
      title="Scores"
      description="Raw scores as entered · totals calculated by the system"
      :columns="columns"
      :rows="rows"
      :row-key="(r) => r.studentId"
      empty-text="No students are placed in this arm."
      min-width="760px"
    >
      <template #cell-name="{ row }">
        <RouterLink
          :to="{ name: routesPath.students.detail.name, params: { id: row.studentId } }"
          class="flex flex-col hover:underline"
        >
          <span class="font-medium">{{ row.name }}</span>
          <span class="text-xs text-faint">{{ row.admissionNo }}</span>
        </RouterLink>
      </template>
      <template v-for="(c, i) in sheet.components" :key="c.name" #[`cell-c${i}`]="{ row }">
        <span :class="scoreClass(scoreOf(row as Row, i))">{{ scoreOf(row as Row, i) ?? '—' }}</span>
      </template>
      <template #cell-total="{ row }">
        <span class="font-medium tabular-nums">{{ row.total ?? '—' }}</span>
      </template>
      <template #cell-grade="{ row }">
        <span class="font-semibold">{{ row.grade ?? '—' }}</span>
      </template>
      <template #cell-flag="{ row }">
        <span
          v-if="row.flag"
          :class="row.flag === 'Missing score' ? 'text-error-strong' : 'text-info-strong'"
          >{{ row.flag }}</span
        >
        <span v-else class="text-muted-foreground">{{ row.remark || '—' }}</span>
      </template>
    </DataTable>

    <ActivityTimeline title="Workflow history" :items="sheet.history" />
  </template>
</template>
