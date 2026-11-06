<script setup lang="ts">
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@edutrack/ui/components/input-group';
import { cn } from '@edutrack/ui/lib/utils';
import { useField } from 'vee-validate';
import { ref, useId, watch, type HTMLAttributes } from 'vue';

import { formatCount } from '@edutrack/app-kit/lib/format';

import FieldShell from './FieldShell.vue';

const props = defineProps<{
  name: string;
  label: string;
  /** Required: every field shows an example of what to enter. */
  placeholder: string;
  required?: boolean;
  hint?: string;
  hintTone?: 'muted' | 'warning';
  /** Shown before the number, e.g. ₦. */
  prefix?: string;
  /** Shown after the number, e.g. days or GB. */
  suffix?: string;
  disabled?: boolean;
  /** Keep the label for screen readers only, when a row already names the field. */
  hideLabel?: boolean;
  class?: HTMLAttributes['class'];
}>();

const id = useId();
const { value, errorMessage, handleBlur } = useField<number | null>(() => props.name);

/** Whole naira, days or counts: the field shows 1,850,000 and stores 1850000. */
const text = ref('');
const show = (n: number | null | undefined) =>
  n === null || n === undefined ? '' : formatCount(n);
watch(value, (n) => (text.value = show(n)), { immediate: true });

function onInput(raw: string | number) {
  const digits = String(raw).replace(/\D/g, '');
  value.value = digits ? Number(digits) : null;
  text.value = show(value.value);
}
</script>

<template>
  <FieldShell
    :id="id"
    :label="label"
    :required="required"
    :hint="hint"
    :hint-tone="hintTone"
    :error="errorMessage"
    :class="cn(hideLabel && '[&>label]:sr-only', props.class)"
  >
    <template #label-aside><slot name="label-aside" /></template>
    <InputGroup :class="cn('h-10 bg-card', disabled && 'bg-muted')" :data-disabled="disabled">
      <InputGroupAddon v-if="prefix">
        <InputGroupText class="text-[13px] font-normal text-muted-foreground">{{
          prefix
        }}</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        :id="id"
        :model-value="text"
        inputmode="numeric"
        autocomplete="off"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-invalid="!!errorMessage"
        :aria-describedby="errorMessage ? `${id}-error` : hint ? `${id}-hint` : undefined"
        class="font-normal tabular-nums"
        @update:model-value="onInput"
        @blur="handleBlur"
      />
      <InputGroupAddon v-if="suffix" align="inline-end">
        <InputGroupText class="text-[13px] font-normal text-faint">{{ suffix }}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  </FieldShell>
</template>
