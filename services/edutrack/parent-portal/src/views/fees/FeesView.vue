<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import { useFeesQuery } from '@/api/services/parent';
import AlertCard from '@/components/common/AlertCard.vue';
import ListRow from '@/components/common/ListRow.vue';
import ListSection from '@/components/common/ListSection.vue';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import StatGrid from '@/components/common/StatGrid.vue';
import { useCurrentChild } from '@/composables/useCurrentChild';
import { formatDay } from '@/lib/dates';
import { naira } from '@/lib/money';
import { payLabel, payState } from '@/lib/pay';
import { routesPath } from '@/router/routes-path';

/**
 * Fees for the selected child: this term's invoice and installments, anything still owed from
 * earlier terms, and payments with their status. The fee payer can pay by transfer; another
 * guardian sees everything read-only.
 */
const { child, id } = useCurrentChild();
const q = useFeesQuery(id);
const f = computed(() => q.data.value);
const pay = computed(() => (f.value ? payState(f.value) : null));
const stats = computed(() => {
  const cur = f.value?.current;
  if (!f.value) return [];
  return [
    { label: 'This term', value: naira(cur?.total ?? 0) },
    { label: 'Paid', value: naira(cur?.paid ?? 0) },
    {
      label: 'Outstanding',
      value: naira(f.value.totals.outstanding),
      tone: f.value.totals.outstanding > 0 ? ('error' as const) : ('success' as const),
    },
  ];
});
const paymentTitle = (p: { amount: number; method: string; byParent: boolean }) =>
  `${naira(p.amount)} · ${p.method}${p.byParent ? ' · reported by parent' : ''}`;
</script>

<template>
  <PageTitle
    :title="`Fees · ${child?.firstName ?? ''}`"
    :sub="[child?.className, f?.term?.label].filter(Boolean).join(' · ')"
  />
  <QueryState v-if="!f" :loading="q.isPending.value" :error="q.error.value" @retry="q.refetch()" />
  <template v-else>
    <StatGrid :items="stats" />
    <AlertCard
      v-if="f.totals.pending > 0"
      tone="warning"
      :title="`${naira(f.totals.pending)} transfer being verified`"
      text="Your balance updates once the school confirms the transfer."
    />
    <AlertCard
      v-if="pay && !pay.canPay && pay.reason && f.totals.outstanding > 0 && !f.totals.pending"
      tone="neutral"
      title="You can see these fees but not pay here"
      :text="pay.reason"
    />
    <AlertCard
      v-if="f.totals.outstanding <= 0"
      tone="success"
      :title="`Nothing to pay for ${child?.firstName ?? 'this child'}`"
      :text="f.totals.credit > 0 ? `${naira(f.totals.credit)} credit on account.` : null"
    />
    <Button v-if="pay?.canPay" as-child size="lg" class="h-12">
      <RouterLink :to="{ name: routesPath.fees.pay.name }">{{ payLabel(f.options) }}</RouterLink>
    </Button>

    <ListSection
      v-if="f.current?.installments.length"
      :title="f.current.installments.length > 1 ? 'Installments' : 'Due date'"
    >
      <ListRow
        v-for="i in f.current.installments"
        :key="i.label"
        :title="`${i.label} · ${naira(i.amount)}`"
        :sub="`Due ${formatDay(i.due)}${i.paid && i.paid < i.amount ? ` · ${naira(i.paid)} paid` : ''}`"
        :badge="i.status"
        :tone="
          i.status === 'Due soon' ? 'warning' : i.status === 'Part paid' ? 'warning' : undefined
        "
      />
    </ListSection>

    <ListSection v-if="f.current" :title="`Invoice ${f.current.number}`">
      <ListRow
        v-for="l in f.current.lines"
        :key="l.label"
        :title="l.label"
        :right="naira(l.amount)"
      />
      <ListRow
        v-for="d in f.current.discounts"
        :key="d.label"
        :title="d.label"
        :right="`−${naira(d.amount)}`"
        muted
      />
      <ListRow title="Total" :right="naira(f.current.total)">
        <template #title><span class="font-semibold">Total</span></template>
      </ListRow>
    </ListSection>
    <p v-else class="text-[13px] text-muted-foreground">
      The school hasn’t issued this term’s invoice yet.
    </p>

    <ListSection v-if="f.previous.length" title="Earlier balances">
      <ListRow
        v-for="i in f.previous"
        :key="i.id"
        :title="`${i.period} · ${i.number}`"
        sub="Still payable. Stays attached to that term."
        :right="naira(i.balance)"
        :badge="i.status"
      />
    </ListSection>

    <ListSection
      title="Payments & receipts"
      :empty="f.payments.length ? undefined : 'No payments yet.'"
    >
      <ListRow
        v-for="p in f.payments"
        :key="p.id"
        :title="paymentTitle(p)"
        :sub="
          [formatDay(p.date), p.number, p.rejectReason && `Rejected: ${p.rejectReason}`]
            .filter(Boolean)
            .join(' · ')
        "
        :badge="p.status === 'Pending verification' ? 'Pending' : p.status"
      />
    </ListSection>
  </template>
</template>
