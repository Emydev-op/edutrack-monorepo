<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { PrinterIcon } from '@lucide/vue';
import { onBeforeUnmount } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';

import { routesPath } from '@/router/routes-path';
import { useLoginSlipsStore } from '@/stores/login-slips';

/** Printable Student Portal login slips. The passwords live in memory and go when you leave. */
const store = useLoginSlipsStore();
const print = () => window.print();
onBeforeUnmount(() => store.clear());
</script>

<template>
  <EmptyState
    v-if="!store.result"
    illustrated
    title="No login slips to print"
    description="One-time passwords are shown once, right after you create logins. Create them again from Students to print new slips (old passwords then stop working)."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.students.list.name }">All students</RouterLink></Button
    >
  </EmptyState>
  <template v-else>
    <div class="print:hidden flex flex-col gap-4">
      <PageHeader
        title="Student login slips"
        :description="`${store.result.slips.length} slip${store.result.slips.length === 1 ? '' : 's'} · issued ${store.result.issuedOn}`"
      >
        <template #actions>
          <Button @click="print"><PrinterIcon class="size-4" />Print slips</Button>
        </template>
      </PageHeader>
      <InlineNotice
        tone="warning"
        title="Print now: the passwords are shown only once"
        description="They aren’t stored anywhere you can see again. Leaving this page clears them; each student changes theirs at the first sign-in."
      />
      <InlineNotice
        v-if="store.result.skipped.length"
        tone="info"
        :title="`${store.result.skipped.length} student${store.result.skipped.length === 1 ? '' : 's'} skipped`"
        :description="store.result.skipped.map((s) => `${s.name}: ${s.reason}`).join(' ')"
      />
    </div>

    <div class="slips grid gap-3 sm:grid-cols-2">
      <article
        v-for="s in store.result.slips"
        :key="s.studentId"
        class="slip flex flex-col gap-2 rounded-lg border border-dashed bg-card p-4"
      >
        <header class="flex items-baseline justify-between gap-2">
          <span class="font-semibold">{{ s.schoolName }}</span>
          <span class="text-xs text-faint">Student Portal</span>
        </header>
        <dl class="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 text-[13px]">
          <dt class="text-muted-foreground">Name</dt>
          <dd class="font-medium">{{ s.name }}</dd>
          <dt class="text-muted-foreground">Class</dt>
          <dd>{{ s.className }}</dd>
          <dt class="text-muted-foreground">Sign in at</dt>
          <dd class="break-all">{{ s.signInAddress }}</dd>
          <dt class="text-muted-foreground">Admission no.</dt>
          <dd class="font-mono">{{ s.admissionNo }}</dd>
          <dt class="text-muted-foreground">Password</dt>
          <dd class="font-mono text-base font-semibold tracking-wider">
            {{ s.oneTimePassword }}
          </dd>
        </dl>
        <p class="text-xs text-faint">
          One-time password: you’ll choose your own when you first sign in. Keep this slip private.
        </p>
      </article>
    </div>
  </template>
</template>

<style scoped>
@media print {
  .slips {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8mm;
  }
  .slip {
    break-inside: avoid;
    border-color: #000;
    background: #fff;
    color: #000;
  }
}
</style>
