<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@edutrack/ui/components/dropdown-menu';
import { cn } from '@edutrack/ui/lib/utils';
import { ChevronDownIcon, ListFilterIcon } from '@lucide/vue';
import { computed } from 'vue';

/**
 * A toolbar filter: a button that shows the active choice ("Plan: Growth") and opens a list of
 * options. An empty model means "any".
 */
const props = defineProps<{ label: string; options: readonly string[] }>();
const model = defineModel<string>({ default: '' });

const ANY = '__any__';
const selected = computed({
  get: () => model.value || ANY,
  set: (value: string) => (model.value = value === ANY ? '' : value),
});
const active = computed(() => !!model.value);
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="outline"
        :class="
          cn(
            'h-9 shrink-0 gap-1.5 px-3 font-normal whitespace-nowrap',
            active &&
              'border-primary/40 bg-brand-tint text-brand-strong hover:bg-brand-subtle hover:text-brand-strong',
          )
        "
      >
        <ListFilterIcon class="text-muted-foreground" :class="active && 'text-brand-strong'" />
        {{ props.label
        }}<template v-if="active"
          ><span class="text-brand-strong/60">:</span
          ><span class="font-medium">{{ model }}</span></template
        >
        <ChevronDownIcon class="size-3.5 opacity-60" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="max-h-80 min-w-48 overflow-y-auto">
      <DropdownMenuLabel class="text-xs font-medium text-muted-foreground"
        >Filter by {{ props.label.toLowerCase() }}</DropdownMenuLabel
      >
      <DropdownMenuSeparator />
      <DropdownMenuRadioGroup v-model="selected">
        <DropdownMenuRadioItem :value="ANY" class="text-[13px]">All</DropdownMenuRadioItem>
        <DropdownMenuRadioItem
          v-for="option in options"
          :key="option"
          :value="option"
          class="text-[13px]"
          >{{ option }}</DropdownMenuRadioItem
        >
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
