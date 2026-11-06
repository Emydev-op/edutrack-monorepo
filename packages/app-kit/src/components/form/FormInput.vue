<script setup lang="ts">
import { Input } from '@edutrack/ui/components/input';
import { cn } from '@edutrack/ui/lib/utils';
import { EyeIcon, EyeOffIcon } from '@lucide/vue';
import { useField } from 'vee-validate';
import { computed, ref, useId, type HTMLAttributes, type InputTypeHTMLAttribute } from 'vue';

import FieldShell from './FieldShell.vue';

const props = defineProps<{
  name: string;
  label: string;
  required?: boolean;
  hint?: string;
  type?: InputTypeHTMLAttribute;
  /** Required: every field shows an example of what to enter. */
  placeholder: string;
  autocomplete?: string;
  inputmode?: HTMLAttributes['inputmode'];
  readonly?: boolean;
  class?: HTMLAttributes['class'];
}>();

const id = useId();
const { value, errorMessage, handleBlur } = useField<string>(() => props.name);

/** Password fields get a show/hide toggle so people can check what they typed. */
const isPassword = computed(() => props.type === 'password');
const revealed = ref(false);
const inputType = computed(() =>
  isPassword.value && revealed.value ? 'text' : (props.type ?? 'text'),
);
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
    <template #label-aside><slot name="label-aside" /></template>
    <div class="relative">
      <Input
        :id="id"
        v-model="value"
        :type="inputType"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        :inputmode="inputmode"
        :readonly="readonly"
        :aria-invalid="!!errorMessage"
        :aria-describedby="errorMessage ? `${id}-error` : hint ? `${id}-hint` : undefined"
        :class="
          cn(
            'font-normal',
            readonly ? 'bg-muted text-muted-foreground' : 'bg-card',
            isPassword && 'pr-10',
          )
        "
        @blur="handleBlur"
      />
      <button
        v-if="isPassword"
        type="button"
        :aria-label="revealed ? 'Hide password' : 'Show password'"
        :aria-pressed="revealed"
        :aria-controls="id"
        :title="revealed ? 'Hide password' : 'Show password'"
        class="absolute inset-y-1 right-1 flex w-8 items-center justify-center rounded-sm text-faint transition-colors hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none"
        @mousedown.prevent
        @click="revealed = !revealed"
      >
        <EyeOffIcon v-if="revealed" class="size-4" />
        <EyeIcon v-else class="size-4" />
      </button>
    </div>
    <slot name="after" />
  </FieldShell>
</template>
