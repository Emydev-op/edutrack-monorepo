<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  GROUP_PERIODS,
  useGroupBillingMutation,
  useGroupBillingQuery,
  type GroupPeriod,
} from '@/api/services/groups';
import { usePlansQuery } from '@/api/services/plans';

/**
 * One bill per group: one plan at one price for the whole group. Member schools follow the group
 * plan with no price of their own; EduTrack invoices the group, and recording its payment moves
 * every school's renewal on.
 */
const props = defineProps<{ groupId: string }>();
const confirm = useConfirm();
const { data: billing, isPending } = useGroupBillingQuery(() => props.groupId);
const { data: plans } = usePlansQuery();
const mut = useGroupBillingMutation(() => props.groupId);
const offered = computed(() =>
  (plans.value ?? []).filter((p) => p.status === 'Active' || p.name === billing.value?.plan),
);
const editing = ref(false);
const form = reactive({
  plan: '',
  period: 'Annual' as GroupPeriod,
  priceNaira: 0,
  renewsOn: '',
  billingContactEmail: '',
});
const references = reactive<Record<string, string>>({});
watch(
  billing,
  (b) => {
    if (!b) return;
    Object.assign(form, {
      plan: b.plan ?? '',
      period: b.period ?? 'Annual',
      priceNaira: b.priceKobo !== null ? b.priceKobo / 100 : 0,
      renewsOn: b.renewsOn ?? '',
      billingContactEmail: b.billingContactEmail ?? '',
    });
  },
  { immediate: true },
);

async function run(work: Promise<unknown>, done: string) {
  try {
    await work;
    toast.success(done);
    return true;
  } catch (e) {
    toast.error(getApiErrorMessage(e));
    return false;
  }
}
async function save() {
  const ok = await run(
    mut.mutateAsync({
      kind: 'plan',
      plan: form.plan,
      period: form.period,
      priceNaira: Number(form.priceNaira),
      renewsOn: form.renewsOn || undefined,
      billingContactEmail: form.billingContactEmail,
    }),
    'Group plan saved. Every school in the group now follows it.',
  );
  if (ok) editing.value = false;
}
const stop = () =>
  confirm({
    title: 'Stop group billing?',
    description:
      'Each school goes back to paying for its own plan from its next renewal. The renewal date already paid for stays.',
    confirmLabel: 'Stop group billing',
    tone: 'destructive',
    action: () => run(mut.mutateAsync({ kind: 'stop' }), 'Group billing stopped.'),
  });
const issue = () => run(mut.mutateAsync({ kind: 'invoice' }), 'Group invoice issued.');
const pay = (number: string) =>
  run(
    mut.mutateAsync({ kind: 'payment', number, reference: references[number] ?? '' }),
    'Payment recorded. Every school’s renewal has moved on.',
  );
</script>

<template>
  <SectionCard
    title="Billing"
    description="One plan at one price for the whole group. The group's schools follow its plan and renewal date, and EduTrack invoices the group."
  >
    <Skeleton v-if="isPending" class="h-24" />
    <template v-else-if="billing">
      <div v-if="!editing" class="flex flex-col gap-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <dl v-if="billing.plan" class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt class="text-xs text-muted-foreground">Plan</dt>
              <dd class="font-medium">{{ billing.plan }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">Group price</dt>
              <dd class="font-medium">{{ billing.price }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">Schools on their own</dt>
              <dd>{{ billing.separately }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">Renews</dt>
              <dd>{{ billing.renewsOnLabel }}</dd>
            </div>
          </dl>
          <p v-else class="text-sm text-muted-foreground">
            Each school pays for its own plan. Set a group plan to bill the group once.
          </p>
          <span class="flex items-center gap-2">
            <StatusBadge :label="billing.status" />
            <Button size="sm" variant="outline" @click="editing = true">{{
              billing.plan ? 'Change' : 'Set group plan'
            }}</Button>
          </span>
        </div>
        <template v-if="billing.plan">
          <div class="flex flex-wrap gap-2">
            <Button size="sm" :disabled="mut.isPending.value" @click="issue">Issue invoice</Button>
            <Button size="sm" variant="ghost" @click="stop">Stop group billing</Button>
          </div>
          <ul class="flex flex-col divide-y rounded-md border">
            <li
              v-for="inv in billing.invoices"
              :key="inv.number"
              class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span class="flex flex-col">
                <span class="font-medium">{{ inv.number }} · {{ inv.amount }}</span>
                <span class="text-xs text-muted-foreground"
                  >{{ inv.period }} · due {{ inv.dueOn
                  }}{{ inv.reference ? ` · ${inv.reference}` : '' }}</span
                >
              </span>
              <span class="flex items-center gap-2">
                <StatusBadge :label="inv.status" />
                <template v-if="inv.status !== 'Paid'">
                  <Input
                    v-model="references[inv.number]"
                    class="h-8 w-36"
                    placeholder="Payment ref."
                    :aria-label="`Payment reference for ${inv.number}`"
                  />
                  <Button size="sm" :disabled="mut.isPending.value" @click="pay(inv.number)"
                    >Record payment</Button
                  >
                </template>
              </span>
            </li>
            <li v-if="!billing.invoices.length" class="px-3 py-3 text-sm text-muted-foreground">
              No group invoices yet.
            </li>
          </ul>
        </template>
      </div>
      <form v-else class="grid gap-3 sm:grid-cols-2" @submit.prevent="save">
        <label class="flex flex-col gap-1 text-sm">
          Plan
          <select v-model="form.plan" class="h-9 rounded-md border bg-card px-2.5" required>
            <option value="" disabled>Choose a plan</option>
            <option v-for="p in offered" :key="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm">
          Billed
          <select v-model="form.period" class="h-9 rounded-md border bg-card px-2.5">
            <option v-for="p in GROUP_PERIODS" :key="p">{{ p }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm">
          Group price (₦ per period)
          <Input v-model.number="form.priceNaira" type="number" min="0" step="1000" />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          Renews on
          <Input v-model="form.renewsOn" type="date" />
        </label>
        <label class="flex flex-col gap-1 text-sm sm:col-span-2">
          Billing contact email
          <Input v-model="form.billingContactEmail" type="email" placeholder="Optional" />
        </label>
        <p class="text-xs text-muted-foreground sm:col-span-2">
          Every school in the group moves to this plan and renewal date at once. Leave the renewal
          date empty to start one period from today.
        </p>
        <div class="flex gap-2 sm:col-span-2">
          <Button type="submit" :disabled="mut.isPending.value || !form.plan"
            >Save group plan</Button
          >
          <Button type="button" variant="ghost" @click="editing = false">Cancel</Button>
        </div>
      </form>
    </template>
  </SectionCard>
</template>
