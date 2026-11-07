<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import ToggleList from '@edutrack/app-kit/components/common/ToggleList.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useFinanceTogglesQuery, useSaveFinanceTogglesMutation } from '@/api/services/settings';
import { routesPath } from '@/router/routes-path';
import type { FinanceToggles } from '@/types';

const { data, isPending, isError, refetch } = useFinanceTogglesQuery();
const save = useSaveFinanceTogglesMutation();
const confirm = useConfirm();

const ITEMS: { key: keyof FinanceToggles; label: string; description: string }[] = [
  {
    key: 'verifyTransfers',
    label: 'Verify bank transfers before confirming',
    description:
      'Transfers stay Pending verification until finance matches them on the bank statement. Balances only change once confirmed.',
  },
  {
    key: 'allowPartial',
    label: 'Allow part payments',
    description:
      'Parents can pay any amount up to the balance, not only the full invoice or installment.',
  },
  {
    key: 'autoSibling',
    label: 'Apply the sibling discount automatically',
    description:
      'Added to new invoices for the 2nd and later child of the same fee payer. Finance can remove it per invoice.',
  },
];
const items = computed(() =>
  ITEMS.map((i) => ({ ...i, enabled: !!data.value?.[i.key], disabled: save.isPending.value })),
);

async function toggle(key: string, enabled: boolean) {
  const k = key as keyof FinanceToggles;
  const label = ITEMS.find((i) => i.key === k)!.label;
  const done = () => toast.success(`${label} turned ${enabled ? 'on' : 'off'}.`);
  if (k === 'verifyTransfers' && !enabled) {
    await confirm({
      title: 'Stop verifying bank transfers?',
      description:
        'Transfers recorded from now on are confirmed straight away and reduce balances immediately, before anyone checks the bank statement.',
      details: [
        ['Already pending', 'Still need verifying'],
        ['Risk', 'A transfer that never arrived would show as paid'],
      ],
      confirmLabel: 'Stop verifying',
      tone: 'destructive',
      action: async () => {
        await save.mutateAsync({ [k]: enabled });
        done();
      },
    });
    return;
  }
  try {
    await save.mutateAsync({ [k]: enabled });
    done();
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'That didn’t save. Try again.'));
  }
}
</script>

<template>
  <div v-if="isPending"><Skeleton class="h-48 w-full" /></div>
  <InlineNotice
    v-else-if="isError || !data"
    tone="error"
    title="Finance settings couldn’t load"
    description="Check your connection and try again."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>
  <div v-else class="flex flex-col gap-4">
    <ToggleList title="Payments" :items="items" @toggle="toggle" />
    <InlineNotice
      tone="info"
      title="Parents pay the school directly"
      description="Edutrack doesn’t collect money. Parents transfer to your bank account and tell you they’ve paid; finance confirms the payment. Due dates, late fees, payment methods, prefixes and approval limits are in Billing settings."
    >
      <template #action>
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="{ name: routesPath.finance.fees.name, query: { tab: 'settings' } }"
            >Billing settings</RouterLink
          >
        </Button>
      </template>
    </InlineNotice>
  </div>
</template>
