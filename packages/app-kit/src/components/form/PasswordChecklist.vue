<script setup lang="ts">
import { CheckIcon, CircleIcon } from '@lucide/vue';
import { computed } from 'vue';

import { passwordRules } from '@edutrack/app-kit/lib/password';

const props = defineProps<{ password: string }>();
const rules = computed(() => passwordRules(props.password));
</script>

<template>
  <ul class="flex flex-col gap-0.5 text-xs" aria-label="Password requirements">
    <li
      v-for="rule in rules"
      :key="rule.label"
      class="flex items-center gap-1.5"
      :class="rule.met ? 'text-success-strong' : 'text-faint'"
    >
      <CheckIcon v-if="rule.met" class="size-3" :stroke-width="3" />
      <CircleIcon v-else class="size-3" />
      {{ rule.label }}
      <span class="sr-only">{{ rule.met ? '(met)' : '(not met)' }}</span>
    </li>
  </ul>
</template>
