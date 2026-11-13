<script setup lang="ts">
import { cn } from '@edutrack/ui/lib/utils';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';

import { routesPath } from '@/router/routes-path';
import type { Period, TimetableLesson, Weekday } from '@/types';

import { campusClasses } from './campus';

/**
 * A teacher's week: Mon–Fri × periods (breaks shown) on wide screens, a day picker and that
 * day's list on phones. Today's column is highlighted from the API's `todayDay`.
 */
const props = defineProps<{
  periods: Period[];
  days: Weekday[];
  lessons: TimetableLesson[];
  todayDay: Weekday | null;
  showCampus?: boolean;
}>();

const slot = (day: Weekday, periodId: string) =>
  props.lessons.filter((l) => l.day === day && l.periodId === periodId);

const day = ref<Weekday>(props.todayDay ?? 'Mon');
watch(
  () => props.todayDay,
  (d) => d && (day.value = d),
);
const dayOptions = computed(() =>
  props.days.map((d) => ({ value: d, label: d === props.todayDay ? `${d} · Today` : d })),
);
const lessonTo = (l: TimetableLesson) => ({
  name: routesPath.teaching.lesson.name,
  params: { lessonId: l.id },
});
</script>

<template>
  <!-- Wide screens: the week grid, scrolling inside its card if it must. -->
  <div class="overflow-x-auto max-md:hidden">
    <table class="w-full min-w-[720px] table-fixed border-collapse text-xs">
      <thead>
        <tr class="bg-muted text-left text-muted-foreground">
          <th class="w-24 px-3 py-2 font-medium">Period</th>
          <th
            v-for="d in days"
            :key="d"
            :class="
              cn('px-2 py-2 font-medium', d === todayDay && 'bg-brand-subtle text-brand-strong')
            "
            :aria-current="d === todayDay ? 'date' : undefined"
          >
            {{ d }}<span v-if="d === todayDay" class="font-normal"> · Today</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in periods" :key="p.id" class="border-t border-divider">
          <th class="px-3 py-2 text-left align-top font-medium">
            <span class="block">{{ p.isBreak ? p.label : `Period ${p.label}` }}</span>
            <span class="font-normal text-faint tabular-nums">{{ p.start }}–{{ p.end }}</span>
          </th>
          <td
            v-if="p.isBreak"
            :colspan="days.length"
            class="bg-muted px-2 py-1.5 text-center text-faint"
          >
            {{ p.label }}
          </td>
          <template v-else>
            <td
              v-for="d in days"
              :key="d"
              :class="cn('h-14 px-1.5 py-1.5 align-top', d === todayDay && 'bg-brand-subtle/40')"
            >
              <RouterLink
                v-for="l in slot(d, p.id)"
                :key="l.id"
                :to="lessonTo(l)"
                :title="`${l.armName} · ${l.subjectName} · ${l.room} · ${l.branchName}`"
                :class="
                  cn(
                    'flex flex-col gap-0.5 rounded-sm border-l-2 px-2 py-1 hover:brightness-95',
                    campusClasses(l.branchId).surface,
                    l.branchId === 'lk' ? 'border-info' : 'border-primary',
                  )
                "
              >
                <span class="truncate font-semibold text-foreground">{{ l.armName }}</span>
                <span class="truncate text-muted-foreground">{{ l.subjectName }}</span>
                <span class="truncate text-faint"
                  >{{ l.room }}<template v-if="showCampus"> · {{ l.branchShort }}</template></span
                >
              </RouterLink>
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Phones: one day at a time. -->
  <div class="flex flex-col gap-3 md:hidden">
    <SegmentedControl v-model="day" :options="dayOptions" label="Day" class="flex-wrap px-4 pt-3" />
    <ol class="flex flex-col divide-y divide-divider border-t border-divider">
      <li
        v-for="p in periods"
        :key="p.id"
        :class="cn('flex gap-3 px-4 py-2', p.isBreak && 'bg-muted py-1.5')"
      >
        <span class="w-12 shrink-0 text-xs tabular-nums">
          <span class="block font-medium">{{ p.start }}</span>
          <span class="block text-faint">{{ p.end }}</span>
        </span>
        <span v-if="p.isBreak" class="self-center text-xs text-faint">{{ p.label }}</span>
        <span v-else-if="!slot(day, p.id).length" class="self-center text-xs text-faint"
          >Free · Period {{ p.label }}</span
        >
        <span v-else class="flex min-w-0 flex-1 flex-col gap-1">
          <RouterLink
            v-for="l in slot(day, p.id)"
            :key="l.id"
            :to="lessonTo(l)"
            :class="
              cn(
                'flex min-w-0 flex-col rounded-sm border-l-2 px-2 py-1 text-xs',
                campusClasses(l.branchId).surface,
                l.branchId === 'lk' ? 'border-info' : 'border-primary',
              )
            "
          >
            <span class="truncate text-[13px] font-semibold text-foreground"
              >{{ l.armName }} · {{ l.subjectName }}</span
            >
            <span class="text-faint"
              >{{ l.periodLabel }} · {{ l.room
              }}<template v-if="showCampus"> · {{ l.branchName }}</template></span
            >
          </RouterLink>
        </span>
      </li>
    </ol>
  </div>
</template>
