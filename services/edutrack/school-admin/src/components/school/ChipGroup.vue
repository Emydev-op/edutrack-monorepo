<script setup lang="ts">
import { cn } from '@edutrack/ui/lib/utils';
import { CheckIcon } from '@lucide/vue';
import { useId } from 'vue';

/** A labelled set of toggle chips for choosing several values (roles, branches, approvals). */
const props = defineProps<{
  label: string;
  options: readonly string[];
  required?: boolean;
  hint?: string;
  error?: string;
  disabled?: boolean;
}>();
const model = defineModel<string[]>({ required: true });
const id = useId();

function toggle(option: string) {
  if (props.disabled) return;
  model.value = model.value.includes(option)
    ? model.value.filter((x) => x !== option)
    : [...model.value, option];
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <span :id="`${id}-label`" class="text-[13px] font-medium"
      >{{ label }}<span v-if="required" class="text-destructive"> *</span></span
    >
    <div role="group" :aria-labelledby="`${id}-label`" class="flex flex-wrap gap-1.5">
      <button
        v-for="o in options"
        :key="o"
        type="button"
        :aria-pressed="model.includes(o)"
        :disabled="disabled"
        :class="
          cn(
            'flex h-8 items-center gap-1 rounded-md border px-2.5 text-[13px] transition-colors disabled:cursor-default',
            model.includes(o)
              ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
              : 'bg-card text-body enabled:hover:bg-muted',
          )
        "
        @click="toggle(o)"
      >
        <CheckIcon v-if="model.includes(o)" class="size-3.5" />{{ o }}
      </button>
    </div>
    <p v-if="error" role="alert" class="text-xs text-destructive">{{ error }}</p>
    <p v-else-if="hint" class="text-xs text-faint">{{ hint }}</p>
  </div>
</template>
