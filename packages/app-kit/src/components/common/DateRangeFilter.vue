<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@edutrack/ui/components/popover';
import { RangeCalendar } from '@edutrack/ui/components/range-calendar';
import { cn } from '@edutrack/ui/lib/utils';
import { CalendarIcon, ChevronDownIcon } from '@lucide/vue';
import {
  getLocalTimeZone,
  parseDate,
  startOfMonth,
  today,
  type CalendarDate,
} from '@internationalized/date';
import type { DateRange } from 'reka-ui';
import { computed, ref, shallowRef, watch } from 'vue';

/** A date range as ISO calendar dates (YYYY-MM-DD). Empty means "any time". */
export interface DateRangeValue {
  from?: string;
  to?: string;
}

const props = withDefaults(defineProps<{ label?: string }>(), { label: 'Date range' });
const model = defineModel<DateRangeValue>({ default: () => ({}) });

const open = ref(false);
// shallowRef keeps the CalendarDate instances intact (a deep ref would unwrap their class type).
const draft = shallowRef<DateRange>({ start: undefined, end: undefined });

const toRange = (v: DateRangeValue): DateRange => ({
  start: v.from ? parseDate(v.from) : undefined,
  end: v.to ? parseDate(v.to) : undefined,
});
watch(open, (isOpen) => isOpen && (draft.value = toRange(model.value)));

const now = () => today(getLocalTimeZone());
const PRESETS: { label: string; range: () => [CalendarDate, CalendarDate] }[] = [
  { label: 'Today', range: () => [now(), now()] },
  { label: 'Last 7 days', range: () => [now().subtract({ days: 6 }), now()] },
  { label: 'Last 30 days', range: () => [now().subtract({ days: 29 }), now()] },
  { label: 'This month', range: () => [startOfMonth(now()), now()] },
];

const format = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short' });
const formatYear = new Intl.DateTimeFormat('en-NG', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const asDate = (iso: string) => parseDate(iso).toDate(getLocalTimeZone());

const active = computed(() => !!model.value.from);
const summary = computed(() => {
  const { from, to } = model.value;
  if (!from) return props.label;
  if (!to || to === from) return formatYear.format(asDate(from));
  return `${format.format(asDate(from))} – ${formatYear.format(asDate(to))}`;
});

function applyPreset(range: [CalendarDate, CalendarDate]) {
  model.value = { from: range[0].toString(), to: range[1].toString() };
  open.value = false;
}
function apply() {
  const { start, end } = draft.value;
  model.value = start ? { from: start.toString(), to: (end ?? start).toString() } : {};
  open.value = false;
}
function clear() {
  model.value = {};
  open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
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
        <CalendarIcon :class="active ? 'text-brand-strong' : 'text-muted-foreground'" />
        <span :class="active && 'font-medium'">{{ summary }}</span>
        <ChevronDownIcon class="size-3.5 opacity-60" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-auto p-0">
      <div class="flex max-sm:flex-col">
        <div
          class="flex flex-col gap-0.5 border-r p-2 max-sm:flex-row max-sm:flex-wrap max-sm:border-r-0 max-sm:border-b"
        >
          <span class="px-2 py-1.5 text-xs font-medium text-muted-foreground max-sm:hidden"
            >Quick ranges</span
          >
          <Button
            v-for="preset in PRESETS"
            :key="preset.label"
            variant="ghost"
            size="sm"
            class="justify-start font-normal"
            @click="applyPreset(preset.range())"
          >
            {{ preset.label }}
          </Button>
        </div>
        <div class="flex flex-col">
          <RangeCalendar
            v-model="draft"
            :number-of-months="2"
            :placeholder="draft.start ?? now().subtract({ months: 1 })"
            locale="en-NG"
          />
          <div class="flex items-center justify-between gap-2 border-t px-3 py-2.5">
            <Button variant="ghost" size="sm" :disabled="!active && !draft.start" @click="clear"
              >Clear</Button
            >
            <Button size="sm" :disabled="!draft.start" @click="apply">Apply</Button>
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
