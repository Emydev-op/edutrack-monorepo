<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { Textarea } from '@edutrack/ui/components/textarea';
import { cn } from '@edutrack/ui/lib/utils';
import { ChevronLeftIcon, ChevronRightIcon } from '@lucide/vue';
import { computed, ref, useId, watch } from 'vue';
import { RouterLink, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useReportCardQuery, useSaveReportCardMutation } from '@/api/services/class-teacher';
import { percentLabel } from '@/components/class-teacher/attendance';
import AccessDenied from '@/components/common/AccessDenied.vue';
import SheetStatusBadge from '@/components/results/SheetStatusBadge.vue';
import { useUnsavedWork } from '@/composables/useUnsavedWork';
import { fieldErrorsOf, getApiErrorMessage, isForbidden, isNotFound } from '@/lib/api-errors';
import { formatDateTime } from '@/lib/dates';
import { routesPath as r } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';
import {
  CONDUCT_SCALE,
  CONDUCT_TRAITS,
  REMARK_LIMITS,
  type ConductTrait,
  type ReportCardEntry,
} from '@/types';

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const layout = useLayoutStore();
const studentId = computed(() => String(route.params.studentId ?? ''));
const { data: card, isPending, error } = useReportCardQuery(studentId);
const save = useSaveReportCardMutation();
const remarkId = useId();

type Ratings = Record<ConductTrait, number | null>;
const remark = ref('');
const ratings = ref<Ratings>({} as Ratings);
const saved = ref('');
const errors = ref<Record<string, string>>({});
const serverError = ref('');

const current = () => JSON.stringify({ remark: remark.value.trim(), ratings: ratings.value });
function load(c: ReportCardEntry) {
  remark.value = c.remark;
  ratings.value = { ...c.ratings };
  saved.value = current();
  errors.value = {};
  serverError.value = '';
}
const loadedFor = ref('');
const dirty = computed(() => Boolean(card.value) && current() !== saved.value);
watch(
  card,
  (c) => {
    if (c && (c.student.id !== loadedFor.value || !dirty.value)) {
      loadedFor.value = c.student.id;
      load(c);
    }
  },
  { immediate: true },
);
watch(
  () => card.value?.student.name,
  (n) => layout.setRecordLabel(n ?? null),
  { immediate: true },
);
useUnsavedWork(dirty, () => `Report card · ${card.value?.student.name ?? ''}`);

const discard = () =>
  confirm({
    title: 'You have unsaved changes',
    description: 'Your remark and ratings for this student will be lost.',
    confirmLabel: 'Discard changes',
    cancelLabel: 'Stay',
    tone: 'destructive',
  });
onBeforeRouteUpdate(async (to, from) => {
  if (to.params.studentId === from.params.studentId || !dirty.value) return true;
  return discard();
});

const length = computed(() => remark.value.trim().length);
const counterTone = computed(() =>
  length.value > REMARK_LIMITS.max || (length.value > 0 && length.value < REMARK_LIMITS.min)
    ? 'text-warning-strong'
    : 'text-faint',
);

function validate() {
  const e: Record<string, string> = {};
  if (!length.value) e.remark = 'Write a remark for this student.';
  else if (length.value < REMARK_LIMITS.min)
    e.remark = `Write at least ${REMARK_LIMITS.min} characters (${length.value} so far).`;
  else if (length.value > REMARK_LIMITS.max)
    e.remark = `Keep the remark to ${REMARK_LIMITS.max} characters (${length.value} now).`;
  for (const t of CONDUCT_TRAITS)
    if (!ratings.value[t]) e[`ratings.${t}`] = `Rate ${t.toLowerCase()}.`;
  errors.value = e;
  return !Object.keys(e).length;
}

async function submit(thenNext = false) {
  const c = card.value;
  if (!c || !c.editable) return;
  serverError.value = '';
  if (!validate()) return;
  try {
    await save.mutateAsync({
      studentId: c.student.id,
      payload: { remark: remark.value.trim(), ratings: ratings.value },
    });
    saved.value = current();
    toast.success(`Saved ${c.student.name}’s remark and ratings.`);
    if (thenNext && c.nextId)
      await router.push({ name: r.classTeacher.reportCard.name, params: { studentId: c.nextId } });
  } catch (e) {
    const fields = fieldErrorsOf(e);
    errors.value = fields;
    if (!Object.keys(fields).length)
      serverError.value = getApiErrorMessage(e, 'The remark wasn’t saved. Try again.');
  }
}

const setRating = (t: ConductTrait, v: number) => {
  ratings.value = { ...ratings.value, [t]: v };
  errors.value = Object.fromEntries(
    Object.entries(errors.value).filter(([k]) => k !== `ratings.${t}`),
  );
};
const toStudent = (id: string | null) =>
  id ? { name: r.classTeacher.reportCard.name, params: { studentId: id } } : undefined;
</script>

<template>
  <div v-if="isPending" class="flex flex-col gap-4">
    <Skeleton class="h-14 w-2/3" />
    <Skeleton class="h-64 w-full" />
  </div>
  <AccessDenied
    v-else-if="isForbidden(error)"
    what="this report card"
    :reason="getApiErrorMessage(error)"
  />
  <InlineNotice
    v-else-if="error"
    tone="error"
    :title="isNotFound(error) ? 'This student wasn’t found' : 'The report card couldn’t load'"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: r.classTeacher.reportCards.name }"
          >Back to report cards</RouterLink
        ></Button
      >
    </template>
  </InlineNotice>
  <template v-else-if="card">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex min-w-0 flex-[1_1_280px] flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2.5">
          <h1 class="text-2xl leading-tight font-semibold">{{ card.student.name }}</h1>
          <StatusBadge
            :label="card.done ? 'Remark done' : 'Remark missing'"
            :tone="card.done ? 'success' : 'warning'"
          />
        </div>
        <p class="text-[13px] text-muted-foreground">
          {{ card.student.admissionNo }} · {{ card.arm }} · {{ card.term }} · student
          {{ card.index }} of {{ card.total }}
        </p>
      </div>
      <nav class="flex gap-2" aria-label="Other students">
        <Button as-child variant="outline" size="sm" :disabled="!card.prevId">
          <RouterLink v-if="card.prevId" :to="toStudent(card.prevId)!"
            ><ChevronLeftIcon class="size-4" /> Previous</RouterLink
          >
          <span v-else class="pointer-events-none opacity-50"
            ><ChevronLeftIcon class="size-4" /> Previous</span
          >
        </Button>
        <Button as-child variant="outline" size="sm">
          <RouterLink v-if="card.nextId" :to="toStudent(card.nextId)!"
            >Next <ChevronRightIcon class="size-4"
          /></RouterLink>
          <span v-else class="pointer-events-none opacity-50"
            >Next <ChevronRightIcon class="size-4"
          /></span>
        </Button>
      </nav>
    </header>

    <InlineNotice
      v-if="card.lockReason"
      tone="neutral"
      title="Read-only"
      :description="card.lockReason"
    />

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <form class="flex min-w-0 flex-col gap-4" novalidate @submit.prevent="submit(false)">
        <fieldset :disabled="!card.editable || save.isPending.value" class="contents">
          <SectionCard title="Class teacher’s remark">
            <FieldShell :id="remarkId" label="Remark" required :error="errors.remark">
              <template #label-aside>
                <span :class="['text-xs font-normal tabular-nums', counterTone]"
                  >{{ length }} / {{ REMARK_LIMITS.max }}</span
                >
              </template>
              <Textarea
                :id="remarkId"
                v-model="remark"
                :rows="5"
                :aria-invalid="Boolean(errors.remark)"
                placeholder="e.g. Favour is attentive and hardworking. She should read more widely to build her vocabulary."
                class="min-h-28 resize-y bg-card font-normal"
              />
            </FieldShell>
            <p class="mt-1.5 text-xs text-faint">
              {{ REMARK_LIMITS.min }}–{{ REMARK_LIMITS.max }} characters. Printed on the report
              card.
            </p>
          </SectionCard>

          <SectionCard
            title="Conduct"
            description="Rate each from 1 (needs improvement) to 5 (excellent)."
          >
            <div class="flex flex-col gap-3.5">
              <div v-for="t in CONDUCT_TRAITS" :key="t" class="flex flex-col gap-1.5">
                <div class="flex items-baseline justify-between gap-2 text-[13px]">
                  <span :id="`${remarkId}-${t}`" class="font-medium"
                    >{{ t }}<span class="text-destructive"> *</span></span
                  >
                  <span class="text-xs text-muted-foreground">{{
                    ratings[t] ? CONDUCT_SCALE[ratings[t]!] : 'Not rated'
                  }}</span>
                </div>
                <div
                  role="radiogroup"
                  :aria-labelledby="`${remarkId}-${t}`"
                  class="grid grid-cols-5 gap-1.5"
                >
                  <button
                    v-for="v in [1, 2, 3, 4, 5]"
                    :key="v"
                    type="button"
                    role="radio"
                    :aria-checked="ratings[t] === v"
                    :aria-label="`${v} · ${CONDUCT_SCALE[v]}`"
                    :class="
                      cn(
                        'h-10 rounded-md border text-sm font-medium tabular-nums transition-colors disabled:cursor-not-allowed',
                        ratings[t] === v
                          ? 'border-primary bg-brand-subtle text-brand-strong'
                          : 'bg-card text-muted-foreground hover:bg-muted',
                        errors[`ratings.${t}`] && ratings[t] !== v && 'border-error',
                      )
                    "
                    @click="setRating(t, v)"
                  >
                    {{ v }}
                  </button>
                </div>
                <p v-if="errors[`ratings.${t}`]" role="alert" class="text-xs text-destructive">
                  {{ errors[`ratings.${t}`] }}
                </p>
              </div>
            </div>
          </SectionCard>
        </fieldset>

        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Not saved"
          :description="serverError"
        />
        <div v-if="card.editable" class="flex flex-wrap items-center gap-2">
          <Button type="submit" :disabled="save.isPending.value || (!dirty && card.done)">
            <Spinner v-if="save.isPending.value" /> Save
          </Button>
          <Button
            v-if="card.nextId"
            type="button"
            variant="outline"
            :disabled="save.isPending.value || (!dirty && card.done)"
            @click="submit(true)"
            >Save and next</Button
          >
          <span v-if="card.updatedAt" class="text-xs text-faint"
            >Last saved {{ formatDateTime(card.updatedAt, false) }} by {{ card.updatedBy }}</span
          >
        </div>
      </form>

      <div class="flex min-w-0 flex-col gap-4">
        <SectionCard
          title="Attendance"
          :description="`From the register · ${card.attendance.schoolDays} school days`"
        >
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <dt class="text-muted-foreground">Attendance</dt>
            <dd class="text-right font-semibold tabular-nums">
              {{ percentLabel(card.attendance.percent) }}
            </dd>
            <dt class="text-muted-foreground">Present</dt>
            <dd class="text-right tabular-nums">{{ card.attendance.present }}</dd>
            <dt class="text-muted-foreground">Late</dt>
            <dd class="text-right tabular-nums">{{ card.attendance.late }}</dd>
            <dt class="text-muted-foreground">Absent</dt>
            <dd class="text-right tabular-nums">{{ card.attendance.absent }}</dd>
            <dt class="text-muted-foreground">Excused</dt>
            <dd class="text-right tabular-nums">{{ card.attendance.excused }}</dd>
          </dl>
        </SectionCard>
        <SectionCard
          title="Subject totals so far"
          description="Final once a sheet is approved."
          flush
        >
          <ul class="flex flex-col divide-y divide-divider">
            <li
              v-for="s in card.results"
              :key="s.subject"
              class="flex items-center justify-between gap-3 px-4 py-2 text-[13px]"
            >
              <span class="min-w-0 truncate">{{ s.subjectName }}</span>
              <span v-if="s.total !== null" class="font-semibold tabular-nums"
                >{{ s.total }} · {{ s.grade }}</span
              >
              <span v-else class="flex items-center gap-2"
                ><span class="text-xs text-faint">Pending</span>
                <SheetStatusBadge :status="s.status"
              /></span>
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
    <ActivityTimeline v-if="card.history.length" title="History" :items="card.history" />
  </template>
</template>
