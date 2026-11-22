<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';

import { usePlanLimitsQuery } from '@/api/services/settings';
import { routesPath } from '@/router/routes-path';

/** Near (90%) or at the plan's student limit: shown where students are admitted or imported. */
const { data } = usePlanLimitsQuery();
const s = computed(() => data.value?.students);
const fmt = (n: number) => n.toLocaleString('en-NG');
</script>

<template>
  <InlineNotice
    v-if="s?.limit && (s.near || s.reached)"
    :tone="s.reached ? 'error' : 'warning'"
    :title="
      s.reached
        ? `Your plan’s student limit is reached (${fmt(s.used)} of ${fmt(s.limit)})`
        : `${fmt(s.used)} of ${fmt(s.limit)} students on your plan`
    "
    :description="
      s.reached
        ? 'New admissions and imports are paused until your plan is upgraded. Existing students aren’t affected.'
        : `You can admit ${fmt(Math.max(0, s.limit - s.used))} more before the limit. Upgrade your plan to make room.`
    "
  >
    <template #action>
      <Button as-child size="sm" variant="outline"
        ><RouterLink :to="{ name: routesPath.supportNew.name }"
          >Request an upgrade</RouterLink
        ></Button
      >
    </template>
  </InlineNotice>
</template>
