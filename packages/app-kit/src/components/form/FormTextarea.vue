<script setup lang="ts">
import { Textarea } from '@edutrack/ui/components/textarea';
import { useField } from 'vee-validate';
import { useId, type HTMLAttributes } from 'vue';

import FieldShell from './FieldShell.vue';

const props = defineProps<{
  name: string;
  label: string;
  required?: boolean;
  hint?: string;
  /** Required: every field shows an example of what to enter. */
  placeholder: string;
  rows?: number;
  class?: HTMLAttributes['class'];
}>();

const id = useId();
const { value, errorMessage, handleBlur } = useField<string>(() => props.name);
</script>

<template>
  <FieldShell
    :id="id"
    :label="label"
    :required="required"
    :hint="hint"
    :error="errorMessage"
    :class="props.class"
  >
    <Textarea
      :id="id"
      v-model="value"
      :rows="rows ?? 4"
      :placeholder="placeholder"
      :aria-invalid="!!errorMessage"
      class="min-h-24 resize-y bg-card font-normal"
      @blur="handleBlur"
    />
  </FieldShell>
</template>
