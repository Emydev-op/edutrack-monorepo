<script setup lang="ts">
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { useField, useFieldError, useFormValues } from 'vee-validate';
import { useId } from 'vue';

import FormNumber from '@edutrack/app-kit/components/form/FormNumber.vue';
import { formatNaira } from '@edutrack/app-kit/lib/format';
import type { PlanFormValues } from '@/schema/plan';

import { BILLING_PERIODS } from '../plan-format';

defineProps<{ warning?: string }>();

const values = useFormValues<PlanFormValues>();
const error = useFieldError('periods');
const id = useId();
const offered = Object.fromEntries(
  BILLING_PERIODS.map((p) => [p.key, useField<boolean>(`periods.${p.key}.offered`).value]),
);

/** What a termly or monthly price adds up to over a year, to compare against the annual price. */
function yearly(key: string) {
  const periods = values.value.periods;
  const price = periods?.[key as keyof PlanFormValues['periods']]?.price;
  if (!price || key === 'annual' || !periods?.annual.price) return '';
  return `≈ ${formatNaira(key === 'term' ? price * 3 : price * 12)} a year`;
}
</script>

<template>
  <fieldset class="flex flex-col gap-2" :aria-describedby="error ? `${id}-error` : undefined">
    <legend class="mb-2 text-[13px] font-medium">
      Billing periods offered <span class="text-destructive">*</span>
    </legend>
    <div
      v-for="period in BILLING_PERIODS"
      :key="period.key"
      class="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-3"
    >
      <label class="flex items-center gap-2 text-sm">
        <Checkbox v-model="offered[period.key]!.value" />
        {{ period.label }}
      </label>
      <div
        class="flex flex-wrap items-center gap-2.5"
        :class="!offered[period.key]!.value && 'opacity-55'"
      >
        <FormNumber
          :name="`periods.${period.key}.price`"
          :label="`${period.label} price`"
          hide-label
          prefix="₦"
          placeholder="0"
          :disabled="!offered[period.key]!.value"
          class="w-[220px] max-w-full"
        />
        <span v-if="offered[period.key]!.value && yearly(period.key)" class="text-xs text-faint">{{
          yearly(period.key)
        }}</span>
      </div>
    </div>
    <p v-if="error" :id="`${id}-error`" role="alert" class="text-xs text-destructive">
      {{ error }}
    </p>
    <p v-else-if="warning" class="text-xs text-warning-strong">{{ warning }}</p>
  </fieldset>
</template>
