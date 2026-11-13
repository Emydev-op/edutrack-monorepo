<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useTeachingLessonQuery } from '@/api/services/teaching';
import TeachingQueryError from '@/components/teaching/TeachingQueryError.vue';
import { useTermContext } from '@/composables/useTermContext';
import { MATERIAL_ICON } from '@/components/materials/material-format';
import { daysBetween, formatDateTime, formatDeadline, formatWeekday } from '@/lib/dates';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

const route = useRoute();
const layout = useLayoutStore();
const { today } = useTermContext();
const id = computed(() => String(route.params.lessonId));
const { data, isPending, error, refetch } = useTeachingLessonQuery(id);
const l = computed(() => data.value?.lesson ?? null);
watch(l, (x) => layout.setRecordLabel(x ? `${x.armName} · ${x.day} ${x.start}` : null), {
  immediate: true,
});

const nextLabel = computed(() => {
  const n = data.value?.next;
  if (!n) return data.value?.readOnly ? 'The term has ended' : 'No more this term';
  if (n.inProgress) return `Now, until ${n.end}`;
  const days = daysBetween(today.value, n.date);
  const when =
    days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : formatWeekday(n.date, { year: false });
  return `${when}, ${n.start}–${n.end}`;
});
const query = computed(() => (l.value ? { class: l.value.armId, subject: l.value.subject } : {}));
const r = routesPath;
</script>

<template>
  <template v-if="isPending"><Skeleton class="h-16 w-1/2" /><Skeleton class="h-64" /></template>
  <TeachingQueryError
    v-else-if="error || !data || !l"
    :error="error"
    what="this lesson"
    not-found-title="This lesson wasn’t found"
    :back="{ label: 'Timetable', to: { name: r.teaching.timetable.name } }"
    reason="It isn’t one of your lessons."
    @retry="refetch()"
  />
  <template v-else>
    <PageHeader
      :title="`${l.armName} · ${l.subjectName}`"
      :description="`${l.day} · ${l.periodLabel} · ${l.start}–${l.end} · ${l.branchName}`"
      :meta="[
        { label: 'Room', value: l.room },
        { label: 'Students', value: String(data.students) },
      ]"
    />
    <div class="grid items-start gap-4 md:grid-cols-2">
      <KeyValueCard
        title="Lesson"
        :rows="[
          { label: 'Class', value: `${l.armName} · ${data.section}` },
          { label: 'Subject', value: l.subjectName },
          { label: 'When', value: `Every ${l.day} · ${l.periodLabel} · ${l.start}–${l.end}` },
          { label: 'Room', value: l.room },
          { label: 'Campus', value: l.branchName },
          { label: 'Students', value: data.students },
          { label: 'Class teacher', value: data.classTeacher?.name ?? 'Not assigned' },
          {
            label: 'Next lesson',
            value: nextLabel,
            emphasis: data.next?.inProgress ? 'success' : undefined,
          },
        ]"
      />
      <div class="flex min-w-0 flex-col gap-4">
        <SectionCard title="Open assignment" flush>
          <RouterLink
            v-if="data.openAssignment"
            :to="{
              name: r.assignments.detail.name,
              params: { assignmentId: data.openAssignment.id },
            }"
            class="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted"
          >
            <span class="text-[13px] font-medium">{{ data.openAssignment.title }}</span>
            <span class="text-xs text-faint"
              >Due {{ formatDeadline(data.openAssignment.dueAt) }} ·
              {{ data.openAssignment.handedIn }} of {{ data.openAssignment.students }} handed
              in</span
            >
          </RouterLink>
          <p v-else class="px-4 py-3 text-[13px] text-muted-foreground">
            No assignment open for this class.
          </p>
        </SectionCard>
        <SectionCard title="Latest material" flush>
          <RouterLink
            v-if="data.latestMaterial"
            :to="{ name: r.materials.detail.name, params: { materialId: data.latestMaterial.id } }"
            class="flex items-start gap-2.5 px-4 py-3 hover:bg-muted"
          >
            <component
              :is="MATERIAL_ICON[data.latestMaterial.type]"
              class="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span class="flex min-w-0 flex-col gap-0.5">
              <span class="text-[13px] font-medium">{{ data.latestMaterial.title }}</span>
              <span class="text-xs text-faint"
                >{{ data.latestMaterial.type }} · shared
                {{ formatDateTime(data.latestMaterial.publishedAt, false) }}</span
              >
            </span>
          </RouterLink>
          <p v-else class="px-4 py-3 text-[13px] text-muted-foreground">
            Nothing shared with this class yet.
          </p>
        </SectionCard>
        <SectionCard
          title="Shortcuts"
          :description="data.readOnly ? (data.lockReason ?? undefined) : undefined"
        >
          <div class="flex flex-col items-start gap-2">
            <Button as-child variant="outline" size="sm"
              ><RouterLink
                :to="{
                  name: r.teaching.class.name,
                  params: { armId: l.armId, subject: l.subject },
                }"
                >Open class</RouterLink
              ></Button
            >
            <template v-if="!data.readOnly">
              <Button as-child variant="outline" size="sm"
                ><RouterLink :to="{ name: r.materials.upload.name, query }"
                  >Upload material</RouterLink
                ></Button
              >
              <Button as-child variant="outline" size="sm"
                ><RouterLink :to="{ name: r.assignments.new.name, query }"
                  >Create assignment</RouterLink
                ></Button
              >
            </template>
            <Button as-child variant="ghost" size="sm"
              ><RouterLink :to="{ name: r.teaching.timetable.name }"
                >Back to timetable</RouterLink
              ></Button
            >
          </div>
        </SectionCard>
      </div>
    </div>
  </template>
</template>
