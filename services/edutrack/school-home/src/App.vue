<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { RefreshCwIcon, SearchXIcon, WifiOffIcon } from '@lucide/vue';

import SchoolLanding from '@/components/SchoolLanding.vue';
import StatusPage from '@/components/StatusPage.vue';
import { useSchool } from '@/lib/useSchool';

const { state, load } = useSchool();
void load();
</script>

<template>
  <StatusPage v-if="state.status === 'not-found'" :icon="SearchXIcon" title="School not found">
    <p class="text-[13px] leading-relaxed text-pretty text-muted-foreground">
      {{ state.message }}
    </p>
    <p class="text-xs text-pretty text-faint">
      School addresses look like <span class="font-medium text-body">yourschool.edutrack.ng</span>.
    </p>
  </StatusPage>

  <StatusPage
    v-else-if="state.status === 'error'"
    :icon="WifiOffIcon"
    title="We couldn’t load this page"
  >
    <p role="alert" class="text-[13px] leading-relaxed text-pretty text-muted-foreground">
      {{ state.message }}
    </p>
    <template #action>
      <Button size="lg" @click="load"><RefreshCwIcon aria-hidden="true" /> Try again</Button>
    </template>
  </StatusPage>

  <SchoolLanding v-else :school="state.status === 'ready' ? state.school : null" />
</template>
