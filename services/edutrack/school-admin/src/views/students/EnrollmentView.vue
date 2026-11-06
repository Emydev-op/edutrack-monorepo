<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';

import { useEnrollmentOptionsQuery, useEnrollMutation } from '@/api/services/students';
import { routesPath } from '@/router/routes-path';

const { data, isPending } = useEnrollmentOptionsQuery();
const enroll = useEnrollMutation();

const section = ref('');
const level = ref('');
const arm = ref('');
const picked = ref<Set<string>>(new Set());
const reviewing = ref(false);
const serverError = ref('');

watch(
  data,
  (d) => {
    if (!d || section.value) return;
    const first = d.awaiting[0]?.level;
    const sec = d.sections.find((s) => s.levels.some((l) => l.level === first)) ?? d.sections[0];
    section.value = sec?.name ?? '';
    level.value = first ?? sec?.levels[0]?.level ?? '';
  },
  { immediate: true },
);
const levels = computed(
  () => data.value?.sections.find((s) => s.name === section.value)?.levels ?? [],
);
const arms = computed(() => levels.value.find((l) => l.level === level.value)?.arms ?? []);
watch(section, () => {
  if (!levels.value.some((l) => l.level === level.value))
    level.value = levels.value[0]?.level ?? '';
});
watch(level, () => {
  arm.value = arms.value.find((a) => a.used < a.capacity)?.arm ?? arms.value[0]?.arm ?? '';
  picked.value = new Set(candidates.value.map((s) => s.id));
  reviewing.value = false;
});
const candidates = computed(() =>
  (data.value?.awaiting ?? []).filter((s) => s.level === level.value),
);
watch(candidates, (c) => picked.value.size || (picked.value = new Set(c.map((s) => s.id))), {
  immediate: true,
});

const target = computed(() => arms.value.find((a) => a.arm === arm.value));
const after = computed(() => (target.value?.used ?? 0) + picked.value.size);
const over = computed(() => !!target.value && after.value > target.value.capacity);

function toggle(id: string) {
  const next = new Set(picked.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  picked.value = next;
}

async function confirm() {
  serverError.value = '';
  try {
    const r = await enroll.mutateAsync({
      level: level.value,
      arm: arm.value,
      studentIds: [...picked.value],
    });
    toast.success(
      `${r.enrolled} student${r.enrolled === 1 ? '' : 's'} enrolled in ${r.className} for ${data.value?.session}. Their teachers can see them now.`,
    );
    reviewing.value = false;
    picked.value = new Set();
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'Enrollment didn’t save. Try again.');
  }
}
const select = 'h-9 rounded-md border bg-card px-2.5 text-sm';
</script>

<template>
  <PageHeader
    title="Enroll students"
    description="Places admitted students into a class arm for one session. Earlier sessions’ enrollments are kept."
  />
  <Skeleton v-if="isPending" class="h-96" />

  <EmptyState
    v-else-if="data && !data.awaiting.length"
    illustrated
    title="Everyone admitted is enrolled"
    :description="`No admitted students are waiting for a class arm in ${data.session}. New admissions appear here until they’re placed.`"
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.students.admit.name }"
        >Admit a student</RouterLink
      ></Button
    >
  </EmptyState>

  <div v-else-if="data" class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <SectionCard title="Placement">
      <div class="grid gap-4 sm:grid-cols-2">
        <FieldShell id="en-session" label="Session" required>
          <select id="en-session" :class="select" disabled>
            <option>{{ data.session }}</option>
          </select>
        </FieldShell>
        <FieldShell id="en-section" label="Section" required>
          <select id="en-section" v-model="section" :class="select">
            <option v-for="s in data.sections" :key="s.name">{{ s.name }}</option>
          </select>
        </FieldShell>
        <FieldShell id="en-level" label="Class level" required>
          <select id="en-level" v-model="level" :class="select">
            <option v-for="l in levels" :key="l.level">{{ l.level }}</option>
          </select>
        </FieldShell>
        <FieldShell
          id="en-arm"
          label="Class arm"
          required
          :hint="
            target ? `${level}${arm}: ${target.used} of ${target.capacity} places used` : undefined
          "
        >
          <select id="en-arm" v-model="arm" :class="select">
            <option v-for="a in arms" :key="a.arm" :value="a.arm">
              {{ level }}{{ a.arm }}{{ a.used >= a.capacity ? ' · full' : '' }}
            </option>
          </select>
        </FieldShell>
      </div>
    </SectionCard>

    <SectionCard :title="`Students to enroll · ${picked.size} of ${candidates.length}`">
      <p v-if="!candidates.length" class="text-[13px] text-muted-foreground">
        No admitted students are waiting for {{ level }}.
      </p>
      <ul class="flex flex-col divide-y divide-divider">
        <li v-for="s in candidates" :key="s.id">
          <label class="flex items-center gap-2.5 py-2 text-[13px]">
            <Checkbox :model-value="picked.has(s.id)" @update:model-value="toggle(s.id)" />
            <span class="flex flex-col">
              <span class="font-medium">{{ s.name }}</span>
              <span class="text-xs text-faint"
                >{{ s.admissionNo }} · admitted into {{ s.level }}</span
              >
            </span>
          </label>
        </li>
      </ul>
    </SectionCard>

    <section
      v-if="reviewing"
      class="flex flex-col gap-3 rounded-lg border bg-card p-4 lg:col-span-2"
      aria-label="Review enrollment"
    >
      <dl class="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt class="text-faint">Session</dt>
        <dd>{{ data.session }}</dd>
        <dt class="text-faint">Class</dt>
        <dd>{{ level }} · {{ level }}{{ arm }}</dd>
        <dt class="text-faint">Students</dt>
        <dd>{{ picked.size }}</dd>
        <dt class="text-faint">Capacity after</dt>
        <dd :class="cn(over && 'font-medium text-error-strong')">
          {{ after }} of {{ target?.capacity
          }}{{ over ? `: over by ${after - target!.capacity}` : '' }}
        </dd>
      </dl>
      <InlineNotice
        v-if="over"
        tone="error"
        :title="`${level}${arm} would be over capacity`"
        :description="`Split the group across ${level} arms, or raise capacity in Classes & Arms.`"
        role="alert"
      />
      <InlineNotice
        v-if="serverError"
        tone="error"
        title="Enrollment didn’t save"
        :description="serverError"
        role="alert"
      />
    </section>

    <div class="flex justify-end gap-2 lg:col-span-2">
      <template v-if="reviewing">
        <Button variant="outline" @click="reviewing = false">Back</Button>
        <Button :disabled="over || !picked.size || enroll.isPending.value" @click="confirm">
          <Spinner v-if="enroll.isPending.value" /> Confirm enrollment
        </Button>
      </template>
      <Button v-else :disabled="!picked.size || !arm" @click="reviewing = true">Review</Button>
    </div>
  </div>
</template>
