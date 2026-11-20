<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { PlusIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { messageOf } from '@edutrack/web-core/http';
import { toast } from 'vue-sonner';

import { useSchoolSmsQuery, useSenderIdDecisionMutation } from '@/api/services/sms';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { formatCount } from '@edutrack/app-kit/lib/format';
import { useAuthStore } from '@/stores/auth';
import type { School, SenderIdRequest, SmsLedgerLine } from '@/types';

import SmsTopUpDrawer from '../../components/SmsTopUpDrawer.vue';

const props = defineProps<{ school: School }>();
const { data: sms, isPending } = useSchoolSmsQuery(() => props.school.id);
const decide = useSenderIdDecisionMutation(() => props.school.id);
const confirm = useConfirm();
const auth = useAuthStore();
const toppingUp = ref(false);

const pending = computed(() => sms.value?.requests.find((r) => r.status === 'Pending approval'));

function approve(r: SenderIdRequest) {
  void confirm({
    title: `Approve “${r.name}” for ${props.school.name}?`,
    description: 'Only once the networks have registered the name for this school.',
    details: [
      ['SMS goes out as', r.name],
      ['Until now', sms.value?.sender ?? 'EDUTRACK'],
      ['The school', 'Is told in School Admin'],
    ],
    confirmLabel: 'Approve sender ID',
    action: async () => {
      const saved = await decide.mutateAsync({ approve: true, note: '' });
      toast.success(messageOf(saved, 'Sender ID approved.'));
    },
  });
}

function reject(r: SenderIdRequest) {
  void confirm({
    title: `Reject “${r.name}”?`,
    description: `${props.school.name} keeps sending as ${sms.value?.sender ?? 'EDUTRACK'} and can request another name.`,
    input: {
      label: 'Why (the school sees this)',
      placeholder: 'The networks need the school’s full name, e.g. GREENFIELDA.',
      required: true,
    },
    confirmLabel: 'Reject sender ID',
    tone: 'destructive',
    action: async ({ text }) => {
      const saved = await decide.mutateAsync({ approve: false, note: text });
      toast.success(messageOf(saved, 'Sender ID rejected.'));
    },
  });
}

const requestColumns: Column[] = [
  { key: 'name', label: 'Sender ID', width: 'minmax(140px,1fr)' },
  { key: 'requestedAt', label: 'Requested', width: 'minmax(160px,1fr)' },
  { key: 'status', label: 'Status', width: 'minmax(200px,1.4fr)' },
];
const ledgerColumns: Column[] = [
  { key: 'at', label: 'When', width: 'minmax(150px,1fr)' },
  { key: 'kind', label: 'Entry', width: 'minmax(120px,0.8fr)' },
  { key: 'units', label: 'Units', width: '110px', align: 'right' },
  { key: 'detail', label: 'Detail', width: 'minmax(220px,2fr)' },
  { key: 'by', label: 'By', width: 'minmax(120px,1fr)' },
];
</script>

<template>
  <Skeleton v-if="isPending" class="h-40 max-w-xl" />
  <template v-else-if="sms">
    <InlineNotice
      v-if="pending"
      tone="warning"
      :title="`Sender ID “${pending.name}” is waiting for approval`"
      :description="`Requested ${pending.requestedAt}${pending.requestedBy ? ` by ${pending.requestedBy}` : ''}. SMS goes out as ${sms.sender} until it's approved.`"
    >
      <template v-if="auth.can('Schools.Edit')" #action>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" @click="reject(pending)">Reject</Button>
          <Button size="sm" @click="approve(pending)">Approve</Button>
        </div>
      </template>
    </InlineNotice>

    <div class="grid items-start gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <KeyValueCard
        title="SMS units"
        :rows="[
          {
            label: 'Balance',
            value: `${formatCount(sms.balance)} units`,
            emphasis: sms.balance ? 'strong' : 'error',
          },
          { label: 'Used this term', value: `${formatCount(sms.usedThisTerm)} units` },
          {
            label: 'Plan allowance',
            value: `${formatCount(sms.allowancePerTerm)} units a term · ${sms.plan}`,
          },
        ]"
        footer="One unit sends one SMS page (160 characters, 70 with emoji) to one person."
      />
      <KeyValueCard
        title="Sender"
        :rows="[
          { label: 'SMS goes out as', value: sms.sender, emphasis: 'strong' },
          {
            label: 'Sender ID',
            value: sms.senderId.name
              ? `${sms.senderId.name} · ${sms.senderId.status}`
              : 'Not requested',
          },
        ]"
      />
    </div>

    <DataTable
      title="Sender ID requests"
      :columns="requestColumns"
      :rows="sms.requests"
      :row-key="(r) => r.id"
      :row-label="(r) => r.name"
      empty-text="No sender ID requested yet."
    >
      <template #cell-name="{ row }"
        ><span class="font-medium">{{ row.name }}</span></template
      >
      <template #cell-requestedAt="{ row }">
        <span>{{ row.requestedAt }}</span>
        <span v-if="row.requestedBy" class="text-xs text-faint">{{ row.requestedBy }}</span>
      </template>
      <template #cell-status="{ row }">
        <StatusBadge :label="row.status" />
        <span v-if="row.note" class="text-xs text-faint">{{ row.note }}</span>
      </template>
    </DataTable>

    <DataTable
      title="SMS units ledger"
      :columns="ledgerColumns"
      :rows="sms.ledger"
      :row-key="(l: SmsLedgerLine) => l.id"
      :row-label="(l: SmsLedgerLine) => `${l.kind} ${l.at}`"
      empty-text="No SMS units yet."
    >
      <template #toolbar>
        <Button
          v-if="auth.can('Subscriptions.Edit')"
          variant="outline"
          class="h-9"
          @click="toppingUp = true"
          ><PlusIcon />Add SMS units</Button
        >
      </template>
      <template #cell-units="{ row }">
        <span :class="['tabular-nums', row.units > 0 ? 'font-medium text-success-strong' : '']"
          >{{ row.units > 0 ? '+' : '' }}{{ formatCount(row.units) }}</span
        >
      </template>
    </DataTable>
    <SmsTopUpDrawer v-model:open="toppingUp" :school="school" :balance="sms.balance" />
  </template>
</template>
