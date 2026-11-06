<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { TONE_CLASSES } from '@edutrack/ui/lib/status';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { LockIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { downloadCsv } from '@edutrack/app-kit/lib/csv';

import { getRequest } from '@/api/helpers';
import {
  getPublishCheck,
  useCorrectionsQuery,
  usePublishResultsMutation,
  useResultsQuery,
} from '@/api/services/academics';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { ClassDetail, ResultsMatrix, SheetStatus } from '@/types';

const WORKFLOW: SheetStatus[] = ['Draft', 'Submitted', 'Under review', 'Approved', 'Published'];
const LEGEND: SheetStatus[] = [...WORKFLOW, 'Returned', 'Not started'];
const SHORT: Record<SheetStatus, string> = {
  'Not started': '—',
  Draft: 'Draft',
  Submitted: 'Sub.',
  'Under review': 'Rev.',
  Returned: 'Ret.',
  Approved: '✓',
  Published: '',
};
const TONES: Record<SheetStatus, keyof typeof TONE_CLASSES> = {
  'Not started': 'neutral',
  Draft: 'neutral',
  Submitted: 'info',
  'Under review': 'warning',
  Returned: 'error',
  Approved: 'success',
  Published: 'brand',
};

const router = useRouter();
const confirm = useConfirm();
const context = useContextStore();
const section = useRouteQuery<string>('section', '');
const { data, isPending } = useResultsQuery(() => ({
  section: section.value,
  term: context.current.term,
  branch: context.current.branch,
}));
const { data: corrections } = useCorrectionsQuery();
const publish = usePublishResultsMutation();
const justPublished = ref('');

const pendingCorrections = computed(
  () => corrections.value?.filter((c) => c.status === 'Under review').length ?? 0,
);
const sectionModel = computed({
  get: () => data.value?.section ?? section.value,
  set: (v: string) => (section.value = v),
});
const grid = computed(
  () =>
    `minmax(96px,110px) repeat(${data.value?.subjects.length ?? 1},minmax(54px,1fr)) minmax(170px,190px)`,
);

type Row = ResultsMatrix['rows'][number];
const offered = (r: Row) => Object.values(r.cells).filter((c) => c !== null) as SheetStatus[];
const approved = (r: Row) => offered(r).filter((c) => c === 'Approved').length;
const sheetTo = (armId: string, subject: string) => ({
  name: routesPath.academics.resultSheet.name,
  params: { armId, subject },
});

/** Opens the first student's report card in an arm. */
async function openReportCard(row?: Row) {
  const target =
    row ??
    data.value?.rows.find((r) => r.published) ??
    data.value?.rows.find((r) => r.arm === 'JSS 2B') ??
    data.value?.rows[0];
  if (!target) return;
  try {
    const detail = await getRequest<ClassDetail>(`/v1/academics/classes/${target.armId}`);
    const first = detail.students[0];
    if (!first) return void toast.info(`${target.arm} has no students with records.`);
    await router.push({
      name: routesPath.academics.reportCard.name,
      params: { studentId: first.id },
    });
  } catch (e) {
    toast.error(getApiErrorMessage(e));
  }
}

function exportCompletion() {
  const m = data.value;
  if (!m) return;
  downloadCsv(
    `result-completion-${m.term.toLowerCase().replace(/\s+/g, '-')}.csv`,
    ['Class', ...m.subjects.map((s) => s.code), 'Published'],
    m.rows.map((r) => [
      r.arm,
      ...m.subjects.map((s) => r.cells[s.code] ?? 'Not offered'),
      r.published ? 'Yes' : 'No',
    ]),
  );
}

async function startPublish(row: Row) {
  try {
    const check = await getPublishCheck(row.armId);
    void confirm({
      title: `Publish ${check.arm} results for ${data.value!.term}?`,
      description: check.notApproved.length
        ? `Not ready: ${check.notApproved.join(', ')}.`
        : 'Report cards become visible in the parent and student portals.',
      details: [
        ['Students', String(check.students)],
        ['Subjects', `${check.subjects} · all approved`],
        ['Flags', check.flags.length ? check.flags.join(' · ') : 'None'],
        ['Notifies', 'Guardians and students in the portals'],
        ['After publishing', 'Scores are locked. Changes need a correction request.'],
      ],
      acknowledgement: check.flags.length
        ? 'I have checked the absent and exempt flags above. Affected subjects show the flag on the report card.'
        : undefined,
      confirmLabel: 'Publish results',
      action: async () => {
        await publish.mutateAsync({ armId: row.armId, acknowledged: check.flags.length > 0 });
        justPublished.value = check.arm;
        toast.success(`${check.arm} results published.`);
      },
    });
  } catch (e) {
    toast.error(getApiErrorMessage(e));
  }
}
</script>

<template>
  <PageHeader
    title="Results"
    :description="`Results · ${data?.term ?? context.current.term} · ${context.current.session} · ${context.current.branch}${data?.section ? ` · ${data.section}` : ''}`"
  >
    <template #actions>
      <Button v-if="data?.rows.length" variant="outline" @click="openReportCard()"
        >Report card template</Button
      >
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.academics.corrections.name }"
          >Corrections{{ pendingCorrections ? ` (${pendingCorrections})` : '' }}</RouterLink
        ></Button
      >
      <Button variant="outline" :disabled="!data?.rows.length" @click="exportCompletion"
        >Export completion</Button
      >
    </template>
  </PageHeader>

  <Skeleton v-if="isPending" class="h-80" />
  <template v-else-if="data">
    <InlineNotice
      v-if="justPublished"
      tone="success"
      :title="`${justPublished} published`"
      description="Report cards are now visible in the parent and student portals."
    />

    <section class="flex flex-col gap-3 rounded-lg border bg-card px-4.5 py-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-[15px] font-semibold">Result workflow</h2>
        <SegmentedControl
          v-if="data.sections.length > 1"
          v-model="sectionModel"
          label="Section"
          :options="data.sections.map((s) => ({ value: s, label: s }))"
        />
      </div>
      <ol class="flex flex-wrap items-center gap-1.5 text-xs">
        <template v-for="(s, i) in WORKFLOW" :key="s">
          <li><StatusBadge :label="s" :tone="TONES[s]" /></li>
          <li v-if="i < WORKFLOW.length - 1" aria-hidden="true" class="text-faint">→</li>
        </template>
      </ol>
      <p class="text-xs text-muted-foreground">
        Teachers enter and submit scores in the Teacher Workspace. You review, approve and publish
        here. A sheet sent back to the teacher shows as Returned.
      </p>
    </section>

    <InlineNotice
      v-if="data.schemeMissing"
      tone="warning"
      :title="`${data.section} has no assessment scheme`"
      description="Scores can't be weighted or graded until the scheme is set."
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: routesPath.academics.assessments.name }"
            >Set up the scheme</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>
    <InlineNotice
      v-else-if="data.descriptive"
      tone="info"
      :title="`${data.section} uses descriptive ratings`"
      description="Nursery reports use developmental descriptors instead of scores, so there is no score matrix. Teachers record a rating per learning area."
    />

    <EmptyState
      v-if="!data.rows.length"
      title="No classes to show"
      :description="
        data.sections.length
          ? `There are no ${data.section} arms at ${context.current.branch}.`
          : 'Add class levels and arms in Classes & Arms first.'
      "
    />
    <section
      v-else-if="!data.schemeMissing && !data.descriptive"
      class="overflow-x-auto rounded-lg border bg-card"
      :aria-label="`${data.section} result status by class and subject`"
    >
      <div
        :style="{ minWidth: `${200 + data.subjects.length * 60 + 190}px` }"
        class="flex flex-col"
      >
        <div
          class="grid items-center gap-1.5 border-b border-divider px-4 py-2.5 text-xs font-medium text-faint"
          :style="{ gridTemplateColumns: grid }"
        >
          <span>Class</span>
          <span v-for="s in data.subjects" :key="s.code" :title="s.name" class="text-center">{{
            s.code
          }}</span>
          <span class="text-right">Status</span>
        </div>
        <div
          v-for="row in data.rows"
          :key="row.armId"
          class="grid items-center gap-1.5 border-b border-divider px-4 py-2 last:border-b-0"
          :style="{ gridTemplateColumns: grid }"
        >
          <RouterLink
            :to="{ name: routesPath.academics.classResults.name, params: { id: row.armId } }"
            class="text-[13px] font-semibold hover:underline"
            >{{ row.arm }}</RouterLink
          >
          <template v-for="s in data.subjects" :key="s.code">
            <span
              v-if="row.cells[s.code] === null"
              class="text-center text-xs text-faint"
              :title="`${s.name} is not offered in ${row.arm}`"
              >·</span
            >
            <RouterLink
              v-else
              :to="sheetTo(row.armId, s.code)"
              :title="`${row.arm} · ${s.name}: ${row.cells[s.code]}`"
              :aria-label="`${row.arm} ${s.name}: ${row.cells[s.code]}`"
              :class="
                cn(
                  'flex h-7 items-center justify-center rounded-sm text-[11px] font-medium hover:ring-1 hover:ring-primary',
                  TONE_CLASSES[TONES[row.cells[s.code]!]].surface,
                  TONE_CLASSES[TONES[row.cells[s.code]!]].text,
                )
              "
            >
              <LockIcon v-if="row.cells[s.code] === 'Published'" class="size-3.5" />
              <template v-else>{{ SHORT[row.cells[s.code]!] }}</template>
            </RouterLink>
          </template>
          <span class="flex items-center justify-end gap-2 text-xs">
            <template v-if="row.published">
              <StatusBadge label="Published" />
              <button
                type="button"
                class="text-primary hover:underline"
                @click="openReportCard(row)"
              >
                Report cards
              </button>
            </template>
            <Button v-else-if="row.ready" size="sm" @click="startPublish(row)">Publish</Button>
            <span v-else class="text-muted-foreground"
              >{{ approved(row) }} of {{ offered(row).length }} approved</span
            >
          </span>
        </div>
      </div>
    </section>

    <ul class="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Legend">
      <li v-for="s in LEGEND" :key="s" class="flex items-center gap-1.5">
        <span
          :class="
            cn(
              'inline-flex h-5 min-w-7 items-center justify-center rounded-sm px-1 text-[10px] font-medium',
              TONE_CLASSES[TONES[s]].surface,
              TONE_CLASSES[TONES[s]].text,
            )
          "
        >
          <LockIcon v-if="s === 'Published'" class="size-3" />
          <template v-else>{{ SHORT[s] }}</template>
        </span>
        {{ s }} · {{ data.counts[s] ?? 0 }}
      </li>
    </ul>
  </template>
</template>
