<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { routesPath } from '@/router/routes-path';
import { DAYS, type ClassDetail } from '@/types';

const props = defineProps<{ detail: ClassDetail }>();
const tt = computed(() => props.detail.timetable);
const nameOf = (code: string) => tt.value?.palette.find((p) => p.code === code)?.name ?? code;
const teacherOf = (code: string) =>
  (tt.value?.palette.find((p) => p.code === code)?.teacher ?? '').replace(
    /^(Mr|Mrs|Ms|Miss|Mme|Dr|Rev)\.\s/,
    '',
  );
const builder = computed(() => ({
  name: routesPath.academics.timetable.name,
  query: { arm: props.detail.arm.id },
}));
</script>

<template>
  <EmptyState
    v-if="!tt"
    title="No timetable this term"
    :description="`Build ${detail.arm.name}’s timetable from its subjects and teachers.`"
  >
    <Button as-child variant="outline"
      ><RouterLink :to="builder">Open timetable builder</RouterLink></Button
    >
  </EmptyState>
  <SectionCard
    v-else
    flush
    :title="`${tt.term} · ${tt.status} · v${tt.version}`"
    :description="
      tt.status === 'Published'
        ? 'Read-only. Revise it in the timetable builder.'
        : 'Draft: not visible to teachers or parents yet.'
    "
  >
    <div class="overflow-x-auto">
      <table class="w-full min-w-[860px] border-collapse text-xs">
        <thead>
          <tr class="bg-muted text-left text-muted-foreground">
            <th class="w-24 px-3 py-2 font-medium">Day</th>
            <th v-for="p in tt.periods" :key="p.id" class="px-2 py-2 font-medium">
              <span class="block">{{ p.isBreak ? p.label : `Period ${p.label}` }}</span>
              <span class="font-normal text-faint">{{ p.start }}–{{ p.end }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in DAYS" :key="d" class="border-t border-divider">
            <th class="px-3 py-2 text-left font-medium">{{ d }}</th>
            <td
              v-for="p in tt.periods"
              :key="p.id"
              class="h-12 px-2 py-1.5 align-top"
              :class="p.isBreak && 'bg-muted'"
            >
              <template v-if="!p.isBreak && tt.grid[`${d}-${p.id}`]">
                <span class="block font-semibold">{{ nameOf(tt.grid[`${d}-${p.id}`]!) }}</span>
                <span class="block text-faint">{{ teacherOf(tt.grid[`${d}-${p.id}`]!) }}</span>
              </template>
              <span v-else-if="!p.isBreak" class="text-faint">Free</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="flex justify-end border-t border-divider p-3">
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="builder">Open in builder</RouterLink></Button
      >
    </div>
  </SectionCard>
</template>
