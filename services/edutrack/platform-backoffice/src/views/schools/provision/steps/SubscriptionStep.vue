<script setup lang="ts">
import { cn } from '@edutrack/ui/lib/utils';
import { useField } from 'vee-validate';

import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import { PLAN_LIMIT_LABEL } from '@/config/plans';
import type { PlanName } from '@/types';

const { value: plan } = useField<PlanName>('plan');
const plans = Object.entries(PLAN_LIMIT_LABEL) as [PlanName, (typeof PLAN_LIMIT_LABEL)[PlanName]][];
</script>

<template>
  <span class="font-semibold">Subscription</span>
  <div role="radiogroup" aria-label="Plan" class="grid gap-2.5 sm:grid-cols-3">
    <button
      v-for="[name, limits] in plans"
      :key="name"
      type="button"
      role="radio"
      :aria-checked="plan === name"
      :class="
        cn(
          'flex flex-col gap-1 rounded-lg border-[1.5px] p-3.5 text-left transition-colors hover:border-primary',
          plan === name ? 'border-primary bg-brand-tint' : 'bg-card',
        )
      "
      @click="plan = name"
    >
      <span class="font-semibold">{{ name }}</span>
      <span class="text-[15px]">{{ limits.price }}</span>
      <span class="text-xs text-muted-foreground"
        >{{ limits.students }} students · {{ limits.branches }} branches</span
      >
    </button>
  </div>
  <FormInput
    name="startDate"
    label="Start date"
    type="date"
    required
    class="max-w-72"
    placeholder="YYYY-MM-DD"
  />
</template>
