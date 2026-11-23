<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { RouterLink, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import { useGroupOverviewQuery, useSwitchSchoolMutation } from '@/api/services/group';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';

/**
 * School Admin › Group overview: every school of the proprietor's group side by side, with
 * totals; "Open" moves into that school. Fees show for the group owner and finance.
 */
const auth = useAuthStore();
const router = useRouter();
const { data, isPending, error } = useGroupOverviewQuery();
const switchSchool = useSwitchSchoolMutation();
const fmt = (n: number) => n.toLocaleString('en-NG');

async function open(id: string, name: string) {
  if (id === auth.school?.id) return void router.push({ name: routesPath.dashboard.name });
  try {
    await switchSchool.mutateAsync(id);
    toast.success(`You’re now in ${name}.`);
    await router.push({ name: routesPath.dashboard.name });
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'That school couldn’t be opened. Try again.'));
  }
}
</script>

<template>
  <Skeleton v-if="isPending" class="h-80" />
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="The group overview can’t be shown"
    :description="getApiErrorMessage(error)"
  />
  <template v-else-if="data">
    <PageHeader
      :title="data.group.name"
      :description="`Group overview · ${data.role} · ${data.totals.schools} schools`"
    >
      <template #actions>
        <Button v-if="data.role === 'Group owner'" as-child variant="outline"
          ><RouterLink :to="{ name: routesPath.groupAnnouncement.name }"
            >Announcement</RouterLink
          ></Button
        >
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: routesPath.groupReports.name }">Reports</RouterLink></Button
        >
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: routesPath.groupTemplates.name }"
            >Shared templates</RouterLink
          ></Button
        >
      </template>
    </PageHeader>
    <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Group totals">
      <div class="rounded-lg border bg-card p-4">
        <p class="text-xs text-faint">Students on roll</p>
        <p class="text-2xl font-semibold tabular-nums">{{ fmt(data.totals.students) }}</p>
      </div>
      <div class="rounded-lg border bg-card p-4">
        <p class="text-xs text-faint">Staff</p>
        <p class="text-2xl font-semibold tabular-nums">{{ fmt(data.totals.staff) }}</p>
      </div>
      <template v-if="data.totals.fees">
        <div class="rounded-lg border bg-card p-4">
          <p class="text-xs text-faint">Fees collected this term</p>
          <p class="text-2xl font-semibold tabular-nums">
            {{ formatNaira(data.totals.fees.collected) }}
          </p>
          <p class="text-xs text-muted-foreground">
            of {{ formatNaira(data.totals.fees.billed) }} billed
          </p>
        </div>
        <div class="rounded-lg border bg-card p-4">
          <p class="text-xs text-faint">Outstanding</p>
          <p class="text-2xl font-semibold text-warning-strong tabular-nums">
            {{ formatNaira(data.totals.fees.outstanding) }}
          </p>
        </div>
      </template>
      <div v-else class="rounded-lg border bg-card p-4">
        <p class="text-xs text-faint">Branches</p>
        <p class="text-2xl font-semibold tabular-nums">{{ fmt(data.totals.branches) }}</p>
      </div>
    </section>
    <ul class="flex flex-col divide-y rounded-lg border bg-card">
      <li
        v-for="s in data.schools"
        :key="s.id"
        class="grid items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto]"
      >
        <span class="flex min-w-0 items-center gap-2.5">
          <span
            class="size-3 shrink-0 rounded-full"
            :style="{ background: s.brandColor ?? 'var(--primary)' }"
            aria-hidden="true"
          />
          <span class="flex min-w-0 flex-col">
            <span class="truncate font-medium">{{ s.name }}</span>
            <span class="text-xs text-muted-foreground"
              >{{ s.term ?? 'No active term' }} · {{ s.plan ?? 'No plan' }}</span
            >
          </span>
          <StatusBadge v-if="s.id === auth.school?.id" label="You’re here" />
        </span>
        <span class="text-sm"
          ><span class="font-semibold tabular-nums">{{ fmt(s.students) }}</span> students</span
        >
        <span class="text-sm"
          ><span class="font-semibold tabular-nums">{{ fmt(s.staff) }}</span> staff ·
          {{ s.branches }} branch{{ s.branches === 1 ? '' : 'es' }}</span
        >
        <span v-if="s.fees" class="text-sm"
          ><span class="font-semibold tabular-nums">{{ formatNaira(s.fees.collected) }}</span>
          <span class="text-muted-foreground"> of {{ formatNaira(s.fees.billed) }}</span></span
        >
        <span v-else />
        <Button
          size="sm"
          variant="outline"
          :disabled="switchSchool.isPending.value"
          @click="open(s.id, s.name)"
          >{{ s.id === auth.school?.id ? 'Dashboard' : 'Open' }}</Button
        >
      </li>
    </ul>
  </template>
</template>
