<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { RouterLink } from 'vue-router';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import { routesPath } from '@/router/routes-path';
import type { StudentDetail } from '@/types';

defineProps<{ student: StudentDetail }>();
const f = routesPath.finance;
</script>

<template>
  <div class="flex flex-wrap justify-end gap-2">
    <Button as-child variant="outline" size="sm"
      ><RouterLink :to="{ name: f.studentAccount.name, params: { key: student.financeKey } }"
        >Statement & account</RouterLink
      ></Button
    >
    <Button as-child size="sm"
      ><RouterLink :to="{ name: f.paymentNew.name, query: { student: student.financeKey } }"
        >Record payment</RouterLink
      ></Button
    >
  </div>
  <InlineNotice
    v-if="student.credit > 0"
    tone="info"
    :title="`${formatNaira(student.credit)} credit on account`"
    description="Money paid that isn’t on any invoice. Apply it to an invoice or refund it from the student’s account."
  />
  <EmptyState
    v-if="!student.invoices.length"
    title="No invoices"
    description="Nothing has been billed to this student yet."
  />
  <div v-else class="grid items-start gap-4 md:grid-cols-2">
    <KeyValueCard
      v-for="(inv, i) in student.invoices"
      :key="inv.id"
      :title="inv.period"
      :status="inv.status"
      :footer="i > 0 ? 'Old balances stay attached to the session they belong to.' : undefined"
      :rows="[
        { label: 'Invoice', value: inv.number },
        { label: 'Total', value: formatNaira(inv.total) },
        { label: 'Paid', value: formatNaira(inv.paid) },
        { label: 'Pending verification', value: inv.pending ? formatNaira(inv.pending) : '—' },
        {
          label: 'Balance',
          value: formatNaira(inv.balance),
          emphasis: inv.balance ? 'error' : 'success',
        },
      ]"
    >
      <template #action>
        <RouterLink
          :to="{ name: f.invoiceDetail.name, params: { id: inv.id } }"
          class="text-[13px] font-medium text-primary hover:underline"
          >Open invoice</RouterLink
        >
      </template>
    </KeyValueCard>
  </div>
  <ActivityTimeline
    title="Payment history"
    :items="student.payments"
    empty-text="No payments recorded yet."
  />
</template>
