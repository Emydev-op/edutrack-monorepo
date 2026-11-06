<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';

import { useSchoolUsageQuery } from '@/api/services/schools';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import { formatCount } from '@edutrack/app-kit/lib/format';
import type { School } from '@/types';

const props = defineProps<{ school: School }>();
const { data: usage, isPending } = useSchoolUsageQuery(() => props.school.id);
</script>

<template>
  <Skeleton v-if="isPending" class="h-40 max-w-xl" />
  <KeyValueCard
    v-else-if="usage"
    title="Last 30 days"
    class="max-w-xl"
    :rows="[
      { label: 'Active staff users', value: formatCount(usage.activeStaff) },
      { label: 'Parent sign-ins', value: formatCount(usage.parentSignIns) },
      {
        label: 'SMS sent',
        value: `${formatCount(usage.smsSent)}${usage.smsNote ? ` · ${usage.smsNote}` : ''}`,
        emphasis: usage.smsNote ? 'error' : undefined,
      },
      { label: 'Storage', value: `${usage.storageUsedGb} GB of ${usage.storageLimitGb} GB` },
    ]"
  />
</template>
