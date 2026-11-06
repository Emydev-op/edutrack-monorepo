<script setup lang="ts">
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@edutrack/ui/components/command';
import { Popover, PopoverContent, PopoverTrigger } from '@edutrack/ui/components/popover';
import { cn } from '@edutrack/ui/lib/utils';
import { CheckIcon, ChevronsUpDownIcon } from '@lucide/vue';
import { useField } from 'vee-validate';
import { ref, useId, watch, type HTMLAttributes } from 'vue';

import FieldShell from './FieldShell.vue';

/** A select with a search box, for long lists such as states and LGAs. */
const props = defineProps<{
  name: string;
  label: string;
  options: readonly string[];
  /** Required: every field shows an example of what to choose. */
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  class?: HTMLAttributes['class'];
}>();

const id = useId();
const { value, errorMessage, handleBlur } = useField<string>(() => props.name);
const open = ref(false);

watch(open, (isOpen, wasOpen) => wasOpen && !isOpen && handleBlur());

function pick(option: unknown) {
  if (typeof option !== 'string') return;
  value.value = option;
  open.value = false;
}
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
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <button
          :id="id"
          type="button"
          role="combobox"
          :aria-expanded="open"
          :aria-invalid="!!errorMessage"
          :aria-describedby="errorMessage ? `${id}-error` : hint ? `${id}-hint` : undefined"
          :disabled="disabled"
          :class="
            cn(
              'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm font-normal transition-colors',
              'outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60',
              'aria-invalid:border-destructive',
            )
          "
        >
          <span :class="cn('truncate', !value && 'text-faint')">{{ value || placeholder }}</span>
          <ChevronsUpDownIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" class="w-(--reka-popover-trigger-width) min-w-56 p-0">
        <Command :model-value="value" @update:model-value="pick">
          <CommandInput :placeholder="searchPlaceholder ?? `Search ${label.toLowerCase()}`" />
          <CommandList class="max-h-64">
            <CommandEmpty class="py-4 text-[13px] text-muted-foreground">{{
              emptyText ?? 'No matches.'
            }}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                v-for="option in options"
                :key="option"
                :value="option"
                class="text-[13px]"
              >
                <CheckIcon
                  :class="
                    cn('size-3.5 text-primary', option === value ? 'opacity-100' : 'opacity-0')
                  "
                />
                {{ option }}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </FieldShell>
</template>
