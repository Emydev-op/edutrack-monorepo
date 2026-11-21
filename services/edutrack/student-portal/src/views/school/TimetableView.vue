<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';

import { useOverviewQuery, useTimetableQuery } from '@/api/services/student';
import ChipPicker from '@/components/common/ChipPicker.vue';
import ListRow from '@/components/common/ListRow.vue';
import ListSection from '@/components/common/ListSection.vue';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import { weekdayIndex } from '@/lib/dates';

/** The published timetable of my class, a day at a time. */
const overview = useOverviewQuery();
const q = useTimetableQuery();
const t = computed(() => q.data.value);
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const todayName = computed(() => {
  const iso = overview.data.value?.today;
  const i = iso ? weekdayIndex(iso) : 1;
  return DAYS[i - 1] ?? 'Monday';
});
const day = ref<string | undefined>();
watch(todayName, (d) => (day.value ??= d), { immediate: true });
const options = DAYS.map((d) => ({ value: d, label: d.slice(0, 3) }));
const lessons = computed(() => t.value?.days.find((d) => d.day === day.value)?.lessons ?? []);
</script>

<template>
  <PageTitle
    title="Timetable"
    :sub="
      t
        ? [t.className, t.term, t.published && `v${t.version} effective ${t.effectiveFrom}`]
            .filter(Boolean)
            .join(' · ')
        : null
    "
  />
  <QueryState v-if="!t" :loading="q.isPending.value" :error="q.error.value" @retry="q.refetch()" />
  <EmptyState
    v-else-if="!t.published"
    title="No timetable yet"
    :description="`The school hasn’t published ${t.className ?? 'this class'}’s timetable for ${t.term}. It appears here once it does.`"
  />
  <template v-else>
    <ChipPicker v-model="day" :options="options" label="Day" />
    <ListSection :title="day ?? ''" :empty="lessons.length ? undefined : 'No lessons on this day.'">
      <ListRow
        v-for="l in lessons"
        :key="`${l.start}${l.subject}`"
        :title="l.subject"
        :sub="l.isBreak ? null : l.teacher"
        :right="`${l.start}–${l.end}`"
        :muted="l.isBreak"
      />
    </ListSection>
  </template>
</template>
