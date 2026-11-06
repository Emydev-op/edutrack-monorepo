<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useApplyPromotionMutation,
  usePromotionQuery,
  useSaveDecisionsMutation,
  useSessionsQuery,
} from '@/api/services/academics';
import { routesPath } from '@/router/routes-path';
import type { PromotionDecision, PromotionStudent } from '@/types';

const DECISIONS: PromotionDecision[] = ['Promote', 'Repeat', 'Graduate', 'Transfer', 'Withdraw'];

const confirm = useConfirm();
const classId = useRouteQuery<string>('class', '');
const { data: view, isPending } = usePromotionQuery(classId);
const { data: sessions } = useSessionsQuery();
const save = useSaveDecisionsMutation();
const apply = useApplyPromotionMutation();

/** Local edits: studentId → decision and reason. */
const edits = ref<Record<string, { decision: PromotionDecision | null; reason: string }>>({});
const dirty = ref(false);
watch(
  () =>
    view.value?.classId + JSON.stringify(view.value?.students.map((s) => [s.decision, s.reason])),
  () => {
    edits.value = Object.fromEntries(
      (view.value?.students ?? []).map((s) => [s.id, { decision: s.decision, reason: s.reason }]),
    );
    dirty.value = false;
  },
  { immediate: true },
);
useUnsavedChanges(() => dirty.value);

const applied = computed(() => !!view.value?.applied);
const current = computed(() => view.value?.classes.find((c) => c.id === view.value?.classId));
const nextLevel = computed(() => view.value?.nextLevel ?? null);
const arm = computed(() => view.value?.arm ?? '');
/** "JSS 1B" with arm "B" → level "JSS 1". */
const level = computed(() =>
  (view.value?.className ?? '').slice(0, -arm.value.length || undefined).trim(),
);
const fromSessionId = computed(
  () => sessions.value?.sessions.find((s) => s.name === view.value?.from)?.id ?? null,
);

const decisionOf = (s: PromotionStudent) =>
  applied.value ? (s.decision ?? s.suggestion) : (edits.value[s.id]?.decision ?? null);
const isException = (s: PromotionStudent) => {
  const d = decisionOf(s);
  return !!d && ((s.eligible && d === 'Repeat') || (!s.eligible && d === 'Promote'));
};
const nextFor = (s: PromotionStudent) => {
  const d = decisionOf(s);
  if (applied.value) return s.next;
  switch (d) {
    case 'Promote':
      return nextLevel.value ? `${nextLevel.value} · arm ${arm.value}` : 'Graduates';
    case 'Repeat':
      return `${level.value} · arm ${arm.value} (repeat)`;
    case 'Graduate':
      return 'Graduates';
    case 'Transfer':
    case 'Withdraw':
      return 'Leaves school';
    default:
      return '—';
  }
};

const students = computed(() => view.value?.students ?? []);
const decided = computed(() => students.value.filter((s) => decisionOf(s)).length);
const missingReasons = computed(
  () => students.value.filter((s) => isException(s) && !edits.value[s.id]?.reason.trim()).length,
);
const count = (d: PromotionDecision) => students.value.filter((s) => decisionOf(s) === d).length;
const summary = computed(
  () =>
    DECISIONS.filter((d) => count(d))
      .map((d) => `${d}: ${count(d)}`)
      .join(' · ') +
    (missingReasons.value
      ? ` · ${missingReasons.value} exception${missingReasons.value > 1 ? 's need' : ' needs'} a reason`
      : ''),
);
const canApply = computed(
  () => !applied.value && decided.value === students.value.length && !missingReasons.value,
);

function setDecision(id: string, decision: string) {
  edits.value[id] = {
    reason: '',
    ...edits.value[id],
    decision: (decision || null) as PromotionDecision | null,
  };
  dirty.value = true;
}
function setReason(id: string, reason: string) {
  edits.value[id] = { decision: null, ...edits.value[id], reason };
  dirty.value = true;
}
function applySuggestions() {
  for (const s of students.value) if (!edits.value[s.id]?.decision) setDecision(s.id, s.suggestion);
}

async function saveDecisions(quiet = false) {
  try {
    await save.mutateAsync({
      classId: view.value!.classId,
      decisions: Object.entries(edits.value).map(([studentId, e]) => ({ studentId, ...e })),
    });
    dirty.value = false;
    if (!quiet) toast.success('Decisions saved.');
    return true;
  } catch (e) {
    toast.error(getApiErrorMessage(e));
    return false;
  }
}

async function confirmApply() {
  if (!(await saveDecisions(true))) return;
  const v = view.value!;
  const exceptions = students.value.filter(isException);
  void confirm({
    title: `Apply decisions for ${students.value.length} student${students.value.length === 1 ? '' : 's'}?`,
    details: [
      [
        'Promote',
        `${count('Promote')} · new ${v.to} enrollment in ${nextLevel.value ?? 'the next class'}`,
      ],
      ['Repeat', `${count('Repeat')} · new ${v.to} enrollment in ${v.className}`],
      ...(count('Graduate')
        ? ([['Graduate', `${count('Graduate')} · leave as alumni`]] as [string, string][])
        : []),
      [
        'Transfer / withdraw',
        `${count('Transfer') + count('Withdraw')} · enrollment ends, record kept`,
      ],
      [
        'Exceptions',
        exceptions.length
          ? exceptions.map((s) => `${s.name}: ${edits.value[s.id]?.reason}`).join(' · ')
          : 'None',
      ],
    ],
    confirmLabel: 'Apply decisions',
    action: async () => {
      const res = await apply.mutateAsync(v.classId);
      toast.success(
        `${v.className} decisions applied. ${res.created} ${v.to} enrollment${res.created === 1 ? '' : 's'} created.`,
      );
    },
  });
}
</script>

<template>
  <Skeleton v-if="isPending" class="h-96" />
  <template v-else-if="view?.empty">
    <PageHeader
      title="Promotion"
      description="Move students to their next class at the end of a session."
    />
    <EmptyState
      title="Promotion happens at the end of a session"
      description="Once a session's final term is closed, the system suggests promote, repeat or graduate for each student and you confirm the decisions here."
    />
    <div class="flex justify-center">
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.academics.sessions.name }"
          >Go to Sessions & Terms</RouterLink
        ></Button
      >
    </div>
  </template>
  <template v-else-if="view">
    <PageHeader
      title="Promotion"
      :status="applied ? 'Complete' : 'In progress'"
      :description="`${view.from} → ${view.to} · ${view.className} · Main Campus. The system suggests; authorised staff decide.`"
    >
      <template #actions>
        <Button v-if="applied && fromSessionId" as-child
          ><RouterLink
            :to="{ name: routesPath.academics.sessionClose.name, params: { id: fromSessionId } }"
            >Continue to close {{ view.from }}</RouterLink
          ></Button
        >
        <template v-else-if="!applied">
          <Button variant="outline" @click="applySuggestions">Apply suggestions to pending</Button>
          <Button
            variant="outline"
            :disabled="!dirty || save.isPending.value"
            @click="saveDecisions()"
            >Save decisions</Button
          >
        </template>
      </template>
    </PageHeader>

    <nav aria-label="Classes" class="flex flex-wrap gap-2">
      <button
        v-for="c in view.classes"
        :key="c.id"
        type="button"
        :aria-current="c.id === view.classId ? 'true' : undefined"
        :class="
          cn(
            'flex flex-col rounded-md border bg-card px-3.5 py-2 text-left text-[13px] hover:border-primary',
            c.id === view.classId && 'border-primary bg-brand-tint',
          )
        "
        @click="classId = c.id"
      >
        <span class="font-semibold">{{ c.name }}</span>
        <span class="text-xs text-muted-foreground">{{
          c.status === 'Pending' ? `${c.pending} pending` : c.status
        }}</span>
      </button>
    </nav>

    <InlineNotice
      v-if="applied"
      tone="success"
      :title="`${view.className} decisions applied`"
      :description="`${view.to} enrollments were created for promoted and repeating students. Students who left keep their records.`"
    />

    <section class="flex flex-col gap-1 rounded-lg border bg-card px-4.5 py-3.5">
      <span class="text-xs font-medium tracking-[0.04em] text-faint uppercase">Promotion rule</span>
      <span class="text-[13px]">{{ view.rule }}</span>
      <span class="text-xs text-muted-foreground"
        >Fees don’t block promotion at your school. A decision that goes against the rule is an
        exception and needs a reason.</span
      >
    </section>

    <section
      class="overflow-x-auto rounded-lg border bg-card"
      aria-label="Students needing a decision"
    >
      <div class="min-w-[1080px]">
        <div
          class="grid grid-cols-[minmax(160px,1.3fr)_80px_70px_70px_110px_minmax(180px,1.6fr)_150px_minmax(150px,1.2fr)] gap-3 border-b border-divider px-4 py-2.5 text-xs font-medium text-faint"
        >
          <span>Student</span>
          <span class="text-right">Average</span>
          <span class="text-right">Maths</span>
          <span class="text-right">English</span>
          <span>Eligibility</span>
          <span>Note</span>
          <span>Decision</span>
          <span>Next</span>
        </div>
        <p v-if="!students.length" class="px-4 py-6 text-[13px] text-muted-foreground">
          All decisions for {{ view.className }} were confirmed.
          {{ current?.total ?? '' }} students.
        </p>
        <div
          v-for="s in students"
          :key="s.id"
          class="grid grid-cols-[minmax(160px,1.3fr)_80px_70px_70px_110px_minmax(180px,1.6fr)_150px_minmax(150px,1.2fr)] items-start gap-3 border-b border-divider px-4 py-3 text-[13px] last:border-b-0"
        >
          <span class="flex flex-col">
            <span class="font-medium">{{ s.name }}</span>
            <span v-if="s.balance" class="text-xs text-warning-strong"
              >{{ formatNaira(s.balance) }} outstanding</span
            >
          </span>
          <span class="text-right tabular-nums">{{ s.average.toFixed(1) }}%</span>
          <span
            :class="cn('text-right tabular-nums', s.maths < 40 && 'font-medium text-error-strong')"
            >{{ s.maths }}</span
          >
          <span
            :class="
              cn('text-right tabular-nums', s.english < 40 && 'font-medium text-error-strong')
            "
            >{{ s.english }}</span
          >
          <StatusBadge
            :label="s.eligible ? 'Eligible' : 'Not eligible'"
            :tone="s.eligible ? 'success' : 'error'"
          />
          <span class="flex flex-col gap-0.5">
            <span class="text-body">{{ s.note || '—' }}</span>
            <span class="text-xs text-faint">Suggested: {{ s.suggestion }}</span>
          </span>
          <span class="flex flex-col gap-1.5">
            <span v-if="applied" class="font-medium">{{ decisionOf(s) }}</span>
            <select
              v-else
              :value="edits[s.id]?.decision ?? ''"
              :aria-label="`Decision for ${s.name}`"
              class="h-9 rounded-md border bg-card px-2.5 text-sm"
              @change="setDecision(s.id, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">Choose…</option>
              <option v-for="d in DECISIONS" :key="d" :value="d">
                {{ d }}{{ d === s.suggestion ? ' (suggested)' : '' }}
              </option>
            </select>
            <template v-if="isException(s)">
              <StatusBadge label="Exception" tone="warning" />
              <Input
                v-if="!applied"
                :model-value="edits[s.id]?.reason ?? ''"
                :aria-label="`Reason for ${s.name}`"
                :aria-invalid="!edits[s.id]?.reason.trim()"
                placeholder="Reason (required)"
                class="h-8"
                @update:model-value="setReason(s.id, String($event))"
              />
              <span v-else class="text-xs text-muted-foreground">{{ s.reason }}</span>
            </template>
          </span>
          <span class="text-body">{{ nextFor(s) }}</span>
        </div>
      </div>
    </section>

    <div
      v-if="!applied && students.length"
      class="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted px-4 py-3"
    >
      <span class="text-[13px]"
        ><span class="font-semibold">{{ decided }} of {{ students.length }} decided</span>
        <span v-if="summary" class="text-muted-foreground"> · {{ summary }}</span></span
      >
      <Button
        :disabled="!canApply || apply.isPending.value"
        :title="canApply ? '' : 'Decide for every student and give a reason for each exception'"
        @click="confirmApply"
        >Apply decisions</Button
      >
    </div>
  </template>
</template>
