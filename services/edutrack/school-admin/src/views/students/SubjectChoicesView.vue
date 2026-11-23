<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorFields, getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import { useClassesQuery, useSessionsQuery } from '@/api/services/academics';
import {
  useClassSubjectChoicesQuery,
  useSaveClassSubjectChoicesMutation,
} from '@/api/services/students';
import GroupPicksPopover from '@/components/students/GroupPicksPopover.vue';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import { choiceProblems, groupKey, picksIn } from '@/lib/subject-choices';
import type { ClassChoiceRow, SubjectChoice, SubjectGroup } from '@/types';

const context = useContextStore();
const confirm = useConfirm();
const armQuery = useRouteQuery<string>('armId', '');
const sessionQuery = useRouteQuery<string>('session', '');
const { data: classes, isPending: classesPending } = useClassesQuery();
const { data: sessions } = useSessionsQuery();
const {
  data: view,
  isPending,
  isFetching,
  error,
} = useClassSubjectChoicesQuery(armQuery, sessionQuery);
const save = useSaveClassSubjectChoicesMutation();

/** The working branch's arms (every arm when the branch has none, e.g. "All branches"). */
const levels = computed(() => {
  const all = classes.value?.levels ?? [];
  const here = all.filter((l) => l.arms.some((a) => a.branch === context.current.branch));
  return (here.length ? here : all).filter((l) => l.arms.length);
});
const manyBranches = computed(() => new Set(levels.value.map((l) => l.branchId)).size > 1);
const sessionOptions = computed(() =>
  (sessions.value?.sessions ?? []).filter((s) => !['Closed', 'Archived'].includes(s.status)),
);

/** Local edits per student, from the last loaded view. */
const edits = ref<Record<string, SubjectChoice>>({});
const original = ref<Record<string, string>>({});
const rowErrors = ref<Record<string, string>>({});
const needsOnly = ref(false);
const serverError = ref('');
const snapshot = (c: SubjectChoice) =>
  JSON.stringify({ religious: c.religious, electives: [...c.electives].sort() });
watch(
  view,
  (v) => {
    edits.value = Object.fromEntries(
      (v?.students ?? []).map((s) => [
        s.studentId,
        { religious: s.religious, electives: [...s.electives] },
      ]),
    );
    original.value = Object.fromEntries((v?.students ?? []).map((s) => [s.studentId, snapshot(s)]));
    rowErrors.value = {};
  },
  { immediate: true },
);
const changedIds = computed(() =>
  Object.keys(edits.value).filter((id) => snapshot(edits.value[id]!) !== original.value[id]),
);
useUnsavedChanges(() => changedIds.value.length > 0);

async function pickArm(id: string) {
  if (id === armQuery.value) return;
  if (changedIds.value.length) {
    const discard = await confirm({
      title: 'You have unsaved choices',
      description: 'Changes to this class’s subject choices will be lost.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Stay',
      tone: 'destructive',
    });
    if (!discard) return;
  }
  armQuery.value = id;
}

const groups = computed<SubjectGroup[]>(() => view.value?.groups ?? []);
const problemsOf = (id: string) =>
  view.value && edits.value[id] ? choiceProblems(view.value, edits.value[id]) : {};
const complete = (id: string) => !Object.keys(problemsOf(id)).length;

const rows = computed<ClassChoiceRow[]>(() =>
  (view.value?.students ?? []).filter((s) => !needsOnly.value || !s.complete),
);
const columns = computed<Column[]>(() => [
  { key: 'name', label: 'Student', width: 'minmax(180px,1.4fr)' },
  ...(view.value?.religious.length
    ? [{ key: 'religious', label: 'Religious', width: 'minmax(150px,1fr)' }]
    : []),
  ...groups.value.map((g) => ({
    key: `g-${groupKey(g)}`,
    label: `${g.name} · ${g.rule}`,
    width: 'minmax(180px,1.2fr)',
  })),
  { key: 'status', label: 'Status', width: '130px' },
]);

/* Apply to all: the same picks in one group (or religious subject) for every student. */
const bulk = ref<Record<string, string[]>>({});
watch(
  groups,
  (gs) => (bulk.value = Object.fromEntries(gs.map((g) => [groupKey(g), [] as string[]]))),
  { immediate: true },
);
function applyGroup(g: SubjectGroup) {
  const picks = picksIn(g, bulk.value[groupKey(g)] ?? []);
  const inGroup = new Set(g.subjects.map((s) => s.subjectId));
  for (const c of Object.values(edits.value))
    c.electives = [...c.electives.filter((id) => !inGroup.has(id)), ...picks];
  toast.success(`${g.name} set for ${Object.keys(edits.value).length} students. Save to keep it.`);
}
function applyReligious(subjectId: string) {
  if (!subjectId) return;
  for (const c of Object.values(edits.value)) c.religious = subjectId;
}

async function saveAll() {
  if (!view.value) return;
  const sent = changedIds.value.map((studentId) => ({ studentId, ...edits.value[studentId]! }));
  serverError.value = '';
  rowErrors.value = {};
  try {
    const res = await save.mutateAsync({
      armId: armQuery.value,
      sessionId: sessionQuery.value || undefined,
      students: sent,
    });
    toast.success(messageOf(res, `Subject choices saved for ${sent.length} students.`));
  } catch (e) {
    const fields = getApiErrorFields(e);
    const errs: Record<string, string> = {};
    for (const [key, message] of Object.entries(fields)) {
      const i = /^students\.(\d+)/.exec(key)?.[1];
      const id = i === undefined ? undefined : sent[Number(i)]?.studentId;
      if (id) errs[id] = message;
    }
    rowErrors.value = errs;
    serverError.value = Object.keys(errs).length
      ? `Nothing was saved. Fix the ${Object.keys(errs).length === 1 ? 'student' : 'students'} marked below.`
      : getApiErrorMessage(e, 'The subject choices couldn’t be saved. Try again.');
  }
}
</script>

<template>
  <PageHeader
    title="Subject choices"
    description="Each student’s religious subject and electives for the session, a whole class at a time."
  >
    <template v-if="view" #actions>
      <Button :disabled="!changedIds.length || save.isPending.value" @click="saveAll">
        <Spinner v-if="save.isPending.value" />
        {{
          changedIds.length
            ? `Save ${changedIds.length} change${changedIds.length === 1 ? '' : 's'}`
            : 'No changes'
        }}
      </Button>
    </template>
  </PageHeader>

  <Skeleton v-if="classesPending" class="h-96" />
  <template v-else>
    <section class="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
      <FieldShell id="sc-arm" label="Class arm">
        <select
          id="sc-arm"
          :value="armQuery"
          class="h-9 min-w-52 rounded-md border bg-card px-2.5 text-sm"
          @change="pickArm(($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>Choose a class arm…</option>
          <optgroup v-for="l in levels" :key="l.id" :label="l.name">
            <option v-for="a in l.arms" :key="a.id" :value="a.id">
              {{ a.name }}{{ manyBranches ? ` · ${a.branch}` : '' }}
            </option>
          </optgroup>
        </select>
      </FieldShell>
      <FieldShell v-if="sessionOptions.length > 1" id="sc-session" label="Session">
        <select
          id="sc-session"
          v-model="sessionQuery"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
        >
          <option value="">Current session</option>
          <option v-for="s in sessionOptions" :key="s.id" :value="s.id">
            {{ s.name }} · {{ s.status }}
          </option>
        </select>
      </FieldShell>
      <label v-if="view" class="flex h-9 items-center gap-2 text-[13px]"
        ><Checkbox v-model="needsOnly" />Needs choosing only</label
      >
    </section>

    <EmptyState
      v-if="!armQuery"
      title="Choose a class arm"
      description="Pick a class arm to see each student’s religious subject and electives."
    >
      <p v-if="!levels.length" class="text-[13px] text-muted-foreground">
        No class arms yet. Add them in
        <RouterLink
          :to="{ name: routesPath.academics.classes.name }"
          class="font-medium text-primary hover:underline"
          >Classes &amp; Arms</RouterLink
        >.
      </p>
    </EmptyState>
    <Skeleton v-else-if="isPending" class="h-96" />
    <InlineNotice
      v-else-if="error || !view"
      tone="error"
      title="We couldn’t load this class"
      :description="getApiErrorMessage(error, 'Refresh the page to try again.')"
    />
    <template v-else>
      <InlineNotice
        v-if="serverError"
        tone="error"
        title="Subject choices weren’t saved"
        :description="serverError"
        role="alert"
      />
      <InlineNotice
        v-if="view.needChoosing"
        tone="warning"
        :title="`${view.needChoosing} student${view.needChoosing === 1 ? '' : 's'} in ${view.className} need${view.needChoosing === 1 ? 's' : ''} subjects chosen`"
        description="Their religious subject or electives don’t meet the rules for this class, e.g. after promotion."
      />

      <SectionCard
        :title="`${view.className} · ${view.session}`"
        description="Compulsory subjects are taken by everyone in the class."
      >
        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="c in view.compulsory"
              :key="c.subjectId"
              class="rounded-md border bg-muted px-2.5 py-1 text-[13px]"
              >{{ c.name }}</span
            >
            <span v-if="!view.compulsory.length" class="text-[13px] text-faint"
              >No compulsory subjects in the curriculum yet</span
            >
          </div>
          <div
            v-if="view.students.length && (view.religious.length || groups.length)"
            class="flex flex-wrap items-end gap-3 border-t border-divider pt-3"
          >
            <span class="w-full text-xs font-medium tracking-[0.04em] text-faint uppercase"
              >Apply to all</span
            >
            <FieldShell v-if="view.religious.length" id="sc-bulk-rel" label="Religious">
              <select
                id="sc-bulk-rel"
                class="h-8 rounded-md border bg-card px-2.5 text-[13px]"
                @change="
                  applyReligious(($event.target as HTMLSelectElement).value);
                  ($event.target as HTMLSelectElement).value = '';
                "
              >
                <option value="">Set for everyone…</option>
                <option v-for="r in view.religious" :key="r.subjectId" :value="r.subjectId">
                  {{ r.name }}
                </option>
              </select>
            </FieldShell>
            <div v-for="g in groups" :key="groupKey(g)" class="flex w-52 flex-col gap-1.5">
              <span class="text-[13px] font-medium">{{ g.name }}</span>
              <GroupPicksPopover
                v-model="bulk[groupKey(g)]!"
                :group="g"
                :aria-label="`Apply ${g.name} to all`"
              >
                <Button size="sm" @click="applyGroup(g)"
                  >Apply to {{ view.students.length }} students</Button
                >
              </GroupPicksPopover>
            </div>
          </div>
        </div>
      </SectionCard>

      <EmptyState
        v-if="!view.students.length"
        title="No students in this class"
        :description="`Nobody is enrolled in ${view.className} for ${view.session} yet.`"
      />
      <DataTable
        v-else
        :columns="columns"
        :rows="rows"
        :row-key="(r) => r.studentId"
        :loading="isFetching && !rows.length"
        empty-text="Everyone in this class has their subjects chosen."
      >
        <template #cell-name="{ row }">
          <RouterLink
            :to="{ name: routesPath.students.subjects.name, params: { id: row.studentId } }"
            class="font-medium hover:underline"
            >{{ row.name }}</RouterLink
          >
          <span class="text-xs text-faint">{{ row.admissionNo }}</span>
          <span v-if="rowErrors[row.studentId]" role="alert" class="text-xs text-destructive">{{
            rowErrors[row.studentId]
          }}</span>
        </template>
        <template #cell-religious="{ row }">
          <select
            v-if="edits[row.studentId]"
            v-model="edits[row.studentId]!.religious"
            :aria-label="`Religious subject for ${row.name}`"
            class="h-8 w-full rounded-md border bg-card px-2 text-[13px]"
          >
            <option :value="null">Choose…</option>
            <option v-for="r in view.religious" :key="r.subjectId" :value="r.subjectId">
              {{ r.name }}
            </option>
          </select>
        </template>
        <template v-for="g in groups" :key="groupKey(g)" #[`cell-g-${groupKey(g)}`]="{ row }">
          <GroupPicksPopover
            v-if="edits[row.studentId]"
            v-model="edits[row.studentId]!.electives"
            :group="g"
            :invalid="!!problemsOf(row.studentId)[groupKey(g)]"
            :aria-label="`${g.name} for ${row.name}`"
          />
        </template>
        <template #cell-status="{ row }">
          <StatusBadge
            :label="complete(row.studentId) ? 'Complete' : 'Needs choosing'"
            :tone="complete(row.studentId) ? 'success' : 'warning'"
          />
          <span v-if="changedIds.includes(row.studentId)" class="text-xs text-faint"
            >Not saved</span
          >
        </template>
      </DataTable>
    </template>
  </template>
</template>
