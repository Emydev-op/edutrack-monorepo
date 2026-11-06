<script setup lang="ts">
import { AlertCircleIcon, CheckIcon, MailIcon } from '@lucide/vue';
import { cn } from '@edutrack/ui/lib/utils';

const props = defineProps<{ tone: 'success' | 'error' | 'brand'; centered?: boolean }>();
const styles = {
  success: { cls: 'bg-success-subtle text-success-strong', icon: CheckIcon },
  error: { cls: 'bg-error-subtle text-error-strong', icon: AlertCircleIcon },
  brand: { cls: 'bg-brand-subtle text-brand-strong', icon: MailIcon },
};
</script>

<template>
  <span
    aria-hidden="true"
    :class="
      cn(
        'flex size-11 shrink-0 items-center justify-center rounded-full',
        styles[props.tone].cls,
        centered && 'self-center',
      )
    "
  >
    <component :is="styles[props.tone].icon" class="size-5" :stroke-width="2.2" />
  </span>
</template>
