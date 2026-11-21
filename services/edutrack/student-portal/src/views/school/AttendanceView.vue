<script setup lang="ts">
import { computed, ref } from 'vue';

import { useAttendanceQuery } from '@/api/services/student';
import ChipPicker from '@/components/common/ChipPicker.vue';
import ListRow from '@/components/common/ListRow.vue';
import ListSection from '@/components/common/ListSection.vue';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import StatGrid from '@/components/common/StatGrid.vue';
import { formatWeekday } from '@/lib/dates';
import { calendarMonths, MARK_CLASS } from '@/lib/attendance';

/** My attendance for a term: the summary, a calendar and the days I wasn't present. */
const term = ref<string | undefined>();
const q = useAttendanceQuery(term);
const a = computed(() => q.data.value);
const chips = computed(() => (a.value?.terms ?? []).map((t) => ({ value: t.id, label: t.label })));
const selected = computed({
  get: () => term.value ?? a.value?.termId,
  set: (v) => (term.value = v),
});
const stats = computed(() => {
  const s = a.value?.summary;
  if (!s) return [];
  return [
    { label: 'Present', value: s.percent === null ? '—' : `${s.percent}%` },
    { label: 'Absent', value: String(s.absent), tone: s.absent ? ('error' as const) : undefined },
    { label: 'Late', value: String(s.late) },
  ];
});
const missed = computed(() => (a.value?.days ?? []).filter((d) => d.mark !== 'Present').reverse());
const months = computed(() => (a.value ? calendarMonths(a.value.days) : []));
</script>

<template>
  <PageTitle title="Attendance" :sub="a?.term" />
  <ChipPicker v-if="chips.length > 1" v-model="selected" :options="chips" label="Term" />
  <QueryState v-if="!a" :loading="q.isPending.value" :error="q.error.value" @retry="q.refetch()" />
  <template v-else>
    <StatGrid :items="stats" />
    <p class="text-[13px] text-muted-foreground">
      {{
        a.summary.schoolDays
          ? `${a.summary.present + a.summary.late} of ${a.summary.schoolDays} school days present (late counts as present) · ${a.summary.excused} excused.`
          : 'The class register hasn’t been taken this term yet.'
      }}
    </p>

    <section v-for="m in months" :key="m.label" class="flex flex-col gap-1.5">
      <h2 class="text-sm font-semibold">{{ m.label }}</h2>
      <div class="grid grid-cols-5 gap-1 rounded-lg border bg-card p-2 text-center text-xs">
        <span v-for="d in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']" :key="d" class="text-faint">{{
          d
        }}</span>
        <span v-for="n in m.offset" :key="`o${n}`" />
        <span
          v-for="d in m.days"
          :key="d.date"
          class="flex h-8 items-center justify-center rounded-md tabular-nums"
          :class="d.mark ? MARK_CLASS[d.mark] : 'text-faint'"
          :title="d.mark ? `${formatWeekday(d.date)} · ${d.mark}` : undefined"
          >{{ +d.date.slice(8) }}</span
        >
      </div>
    </section>
    <div v-if="months.length" class="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span v-for="(cls, mark) in MARK_CLASS" :key="mark" class="flex items-center gap-1.5"
        ><span class="size-3 rounded-sm" :class="cls" />{{ mark }}</span
      >
    </div>

    <ListSection
      title="Days not present"
      :empty="missed.length ? undefined : 'Present every day the register was taken.'"
    >
      <ListRow
        v-for="d in missed"
        :key="d.date"
        :title="formatWeekday(d.date)"
        :sub="d.reason"
        :badge="d.mark"
        :tone="d.mark === 'Absent' ? 'error' : d.mark === 'Late' ? 'warning' : 'info'"
      />
    </ListSection>
  </template>
</template>
