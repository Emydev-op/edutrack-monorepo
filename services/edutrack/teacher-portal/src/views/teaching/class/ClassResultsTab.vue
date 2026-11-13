<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import SheetCompletion from '@/components/results/SheetCompletion.vue';
import SheetStatusBadge from '@/components/results/SheetStatusBadge.vue';
import { countdown } from '@/components/results/sheet-status';
import { useTermContext } from '@/composables/useTermContext';
import { formatDeadline } from '@/lib/dates';
import { routesPath as r } from '@/router/routes-path';
import type { TeachingClassDetail } from '@/types';

/** The class page's Results tab: the class's score sheet at a glance, with a way in. */
const props = defineProps<{ detail: TeachingClassDetail }>();
const { now } = useTermContext();
const res = computed(() => props.detail.results);
const s = computed(() => res.value?.sheet ?? null);
const left = computed(() =>
  s.value?.deadline && s.value.editable ? countdown(s.value.deadline, now.value) : null,
);
</script>

<template>
  <EmptyState
    v-if="!s"
    title="No result sheet for this class"
    description="The academic office creates sheets when classes are assigned. Ask them if you expected one."
  />
  <template v-else>
    <InlineNotice
      v-if="s.status === 'Returned' && s.returnNote"
      tone="error"
      title="Returned to you"
      :description="`“${s.returnNote}” Make the changes, then submit again.`"
    />
    <SectionCard :title="`${s.arm} · ${s.subjectName}`" :description="s.branchName">
      <template #actions>
        <SheetStatusBadge :status="s.status" :with-hod="s.withHod" />
      </template>
      <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-4">
        <div class="col-span-2 flex flex-col gap-1">
          <dt class="text-xs text-faint">Scores entered</dt>
          <dd><SheetCompletion :completion="s.completion" /></dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-xs text-faint">Class average</dt>
          <dd class="font-semibold tabular-nums">
            {{ s.average === null ? '—' : s.average.toFixed(1) }}
          </dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-xs text-faint">Deadline</dt>
          <dd>
            {{ s.deadline ? formatDeadline(s.deadline) : 'Not set' }}
            <span
              v-if="left"
              class="block text-xs"
              :class="left.urgent ? 'text-error-strong' : 'text-muted-foreground'"
              >{{ left.label }}</span
            >
          </dd>
        </div>
      </dl>
      <p v-if="s.withLabel" class="mt-3 text-[13px] text-muted-foreground">{{ s.withLabel }}.</p>
      <p v-if="res?.lockReason" class="mt-1 text-xs text-faint">{{ res.lockReason }}</p>
      <div class="mt-4 flex flex-wrap gap-2">
        <Button as-child size="sm"
          ><RouterLink :to="{ name: r.results.sheet.name, params: { sheetId: s.id } }">{{
            s.editable ? 'Open sheet' : 'View sheet'
          }}</RouterLink></Button
        >
        <Button as-child variant="outline" size="sm"
          ><RouterLink
            :to="{
              name: r.results.sheet.name,
              params: { sheetId: s.id },
              query: { tab: 'review' },
            }"
            >Review totals</RouterLink
          ></Button
        >
      </div>
    </SectionCard>
  </template>
</template>
