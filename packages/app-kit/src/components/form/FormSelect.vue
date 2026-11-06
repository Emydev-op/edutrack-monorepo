<script setup lang="ts">
import { NativeSelect, NativeSelectOption } from '@edutrack/ui/components/native-select';
import { useField } from 'vee-validate';
import { useId, type HTMLAttributes } from 'vue';

import FieldShell from './FieldShell.vue';

export type SelectOption = string | { value: string; label: string };

const props = defineProps<{
  name: string;
  label: string;
  options: readonly SelectOption[];
  required?: boolean;
  hint?: string;
  hintTone?: 'muted' | 'warning';
  class?: HTMLAttributes['class'];
}>();

const id = useId();
const { value, errorMessage } = useField<string>(() => props.name);
const optionOf = (o: SelectOption) => (typeof o === 'string' ? { value: o, label: o } : o);
</script>

<template>
  <FieldShell
    :id="id"
    :label="label"
    :required="required"
    :hint="hint"
    :hint-tone="hintTone"
    :error="errorMessage"
    :class="props.class"
  >
    <NativeSelect
      :id="id"
      v-model="value"
      :aria-invalid="!!errorMessage"
      class="w-full bg-card font-normal"
    >
      <NativeSelectOption v-for="o in options.map(optionOf)" :key="o.value" :value="o.value">{{
        o.label
      }}</NativeSelectOption>
    </NativeSelect>
  </FieldShell>
</template>

<style scoped>
:deep([data-slot='native-select-wrapper']) {
  width: 100%;
}
</style>
