<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed } from 'vue';
import { toast } from 'vue-sonner';

import { useSchoolSubscriptionQuery, useSubscriptionActionMutation } from '@/api/services/schools';
import CardGrid from '@edutrack/app-kit/components/common/CardGrid.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import { PLAN_LIMIT_LABEL } from '@/config/plans';
import { useConfirm, type ConfirmRequest } from '@edutrack/app-kit/composables/useConfirm';
import type { PlanName, School, SubscriptionAction } from '@/types';

const props = defineProps<{ school: School }>();
const { data: subscription, isPending } = useSchoolSubscriptionQuery(() => props.school.id);
const mutation = useSubscriptionActionMutation(() => props.school.id);
const confirm = useConfirm();

interface ActionDef {
  label: string;
  visible: boolean;
  danger?: boolean;
  request: Omit<ConfirmRequest, 'title' | 'action'>;
  build: (result: { text: string; option: string }) => SubscriptionAction;
}

const actions = computed<ActionDef[]>(() => {
  const s = props.school;
  const plans = (Object.keys(PLAN_LIMIT_LABEL) as PlanName[]).filter((p) => p !== s.plan);
  return [
    {
      label: 'Change plan',
      visible: true,
      request: {
        details: [
          ['Current', `${s.plan} · ${PLAN_LIMIT_LABEL[s.plan].price}`],
          ['Takes effect', 'Immediately. The price difference is prorated on the next invoice.'],
          [
            'Limits',
            "If the school is above the new plan's student or branch limit, adding more is blocked until they upgrade. No data is removed.",
          ],
        ],
        options: plans.map((p) => ({
          value: p,
          label: p,
          description: `${PLAN_LIMIT_LABEL[p].price} · ${PLAN_LIMIT_LABEL[p].students} students · ${PLAN_LIMIT_LABEL[p].branches} branches`,
        })),
        confirmLabel: 'Change plan',
      },
      build: ({ option }) => ({ action: 'change_plan', plan: option as PlanName }),
    },
    {
      label: 'Extend subscription',
      visible: true,
      request: {
        details: [
          ['Renews now', s.renews],
          ['Effect', 'Moves the renewal date. No invoice is created automatically.'],
          ['Typical use', 'Goodwill credit after an outage, or a pending bank payment'],
        ],
        options: ['1 month', '3 months', '6 months'].map((p) => ({ value: p, label: p })),
        input: {
          label: 'Reason',
          placeholder: 'e.g. Bank transfer confirmed, awaiting reconciliation',
          required: true,
        },
        confirmLabel: 'Extend',
      },
      build: ({ option, text }) => ({
        action: 'extend',
        period: option as '1 month',
        reason: text,
      }),
    },
    {
      label: 'Enter grace period',
      visible: s.status !== 'Grace period',
      request: {
        details: [
          [
            'Effect',
            'Full access continues for 14 days. Daily renewal reminders go to the billing contact.',
          ],
          ['After 14 days', 'The school becomes Restricted automatically unless paid.'],
        ],
        confirmLabel: 'Start grace period',
      },
      build: () => ({ action: 'enter_grace' }),
    },
    {
      label: 'Restrict school',
      visible: s.status !== 'Restricted',
      danger: true,
      request: {
        details: [
          ['Still available', 'Sign-in, viewing records, exports, billing and renewal'],
          ['Paused', 'Admissions, invoices, result publishing, messaging'],
          ['School sees', 'A banner explaining why and how to renew. Their data is not deleted.'],
        ],
        input: { label: 'Reason', placeholder: 'e.g. Renewal 14 days overdue', required: true },
        confirmLabel: 'Restrict school',
        tone: 'destructive',
      },
      build: ({ text }) => ({ action: 'restrict', reason: text }),
    },
    {
      label: 'Cancel subscription',
      visible: s.status !== 'Cancelled',
      danger: true,
      request: {
        details: [
          ['Effect', `No renewal. Access ends on ${s.renews}.`],
          ['Data', 'Kept for 12 months, then deleted after notice.'],
          ['Reversible', 'Yes, until access ends.'],
        ],
        input: {
          label: 'Reason',
          placeholder: 'e.g. School closing at the end of session',
          required: true,
        },
        acknowledgement: 'The proprietor has confirmed the cancellation in writing',
        confirmLabel: 'Cancel subscription',
        tone: 'destructive',
      },
      build: ({ text }) => ({ action: 'cancel', reason: text }),
    },
    {
      label: 'Reactivate subscription',
      visible: ['Restricted', 'Cancelled', 'Expired', 'Grace period'].includes(s.status),
      request: {
        details: [
          ['Current status', s.status],
          ['Effect', 'Full access restored. Paused features resume immediately.'],
          ['Billing', 'Confirm payment was received before reactivating'],
        ],
        acknowledgement: 'Payment has been received',
        confirmLabel: 'Reactivate',
      },
      build: () => ({ action: 'reactivate' }),
    },
  ];
});

function run(def: ActionDef) {
  void confirm({
    ...def.request,
    title: `${def.label} · ${props.school.name}`,
    action: async (result) => {
      await mutation.mutateAsync(def.build(result));
      toast.success(`${def.label} applied to ${props.school.name}.`);
    },
  });
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3.5 py-3">
    <span class="mr-1.5 text-[13px] font-semibold">Subscription actions</span>
    <Button
      v-for="def in actions.filter((a) => a.visible)"
      :key="def.label"
      size="sm"
      :variant="def.danger ? 'destructive-outline' : 'outline'"
      @click="run(def)"
    >
      {{ def.label }}
    </Button>
  </div>
  <Skeleton v-if="isPending" class="h-48" />
  <CardGrid v-else-if="subscription">
    <KeyValueCard
      title="Current subscription"
      :status="subscription.status"
      :rows="[
        { label: 'Plan', value: `${subscription.plan} · Annual` },
        { label: 'Price', value: subscription.price },
        { label: 'Student limit', value: subscription.studentLimit },
        { label: 'Branch limit', value: subscription.branchLimit },
        { label: 'Renews', value: subscription.renews },
        {
          label: 'Payment',
          value: subscription.payment,
          emphasis: subscription.payment === 'Overdue' ? 'error' : undefined,
        },
      ]"
    />
    <KeyValueCard
      title="Lifecycle"
      :rows="[
        { label: 'Active', value: 'Full access' },
        { label: 'Expiring', value: '30 days before renewal' },
        { label: 'Grace period', value: '14 days after renewal date · full access' },
        { label: 'Restricted', value: 'Sign-in, viewing, exports and billing only' },
        { label: 'Expired / cancelled', value: 'Data kept 12 months' },
      ]"
    />
  </CardGrid>
</template>
