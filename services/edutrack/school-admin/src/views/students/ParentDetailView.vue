<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { computed, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { formatNaira, initials } from '@edutrack/app-kit/lib/format';

import {
  useInviteGuardianMutation,
  useWithdrawGuardianInviteMutation,
} from '@/api/services/portal-accounts';
import { useGuardianQuery } from '@/api/services/students';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

import { tone } from './student-tones';

const route = useRoute();
const layout = useLayoutStore();
const id = computed(() => String(route.params.id));
const { data: g, isPending, isError } = useGuardianQuery(id);
watch(g, (x) => layout.setRecordLabel(x?.name ?? null), { immediate: true });

const confirm = useConfirm();
const invite = useInviteGuardianMutation();
const withdraw = useWithdrawGuardianInviteMutation();

/** "Invited by SMS and email on 17 Nov 2026 · expires 24 Nov 2026". */
const inviteLine = computed(() => {
  const i = g.value?.invitation;
  if (!i) return '';
  return `Invitation sent by ${i.sentBy} on ${i.sentOn} · ${i.expired ? 'expired' : `expires ${i.expiresOn}`}`;
});

async function sendInvite() {
  try {
    const result = await invite.mutateAsync(id.value);
    toast.success(messageOf(result, 'Invitation sent.'));
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'We couldn’t send the invitation. Try again.'));
  }
}

function withdrawInvite() {
  void confirm({
    title: `Withdraw ${g.value?.name}’s invitation?`,
    details: [['What happens', 'The link stops working. You can invite them again later.']],
    confirmLabel: 'Withdraw invitation',
    tone: 'destructive',
    action: async () => {
      const result = await withdraw.mutateAsync(id.value);
      toast.success(messageOf(result, 'Invitation withdrawn.'));
    },
  });
}
</script>

<template>
  <Skeleton v-if="isPending" class="h-80" />
  <EmptyState v-else-if="isError || !g" illustrated title="This guardian doesn’t exist">
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.students.parents.name }"
        >All guardians</RouterLink
      ></Button
    >
  </EmptyState>
  <template v-else>
    <PageHeader
      :title="g.name"
      :initials="initials(g.name)"
      :status="g.portal"
      :description="`Guardian of ${g.children.length} child${g.children.length === 1 ? '' : 'ren'}${g.portalSince ? ` · portal account since ${g.portalSince}` : ''}`"
    >
      <template #actions>
        <Button v-if="g.portal === 'Invited'" variant="ghost" @click="withdrawInvite"
          >Withdraw invitation</Button
        >
        <Button
          v-if="g.portal !== 'Active'"
          variant="outline"
          :disabled="invite.isPending.value"
          @click="sendInvite"
          >{{ g.portal === 'Invited' ? 'Resend invitation' : 'Invite to parent portal' }}</Button
        >
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: routesPath.communication.announcements.name }"
            >Send message</RouterLink
          ></Button
        >
      </template>
    </PageHeader>

    <p v-if="inviteLine" class="text-[13px] text-muted-foreground">{{ inviteLine }}</p>

    <div class="grid gap-3 sm:grid-cols-2">
      <RouterLink
        v-for="c in g.childrenDetail"
        :key="c.id"
        :to="{ name: routesPath.students.detail.name, params: { id: c.id } }"
        class="flex flex-col gap-1.5 rounded-lg border bg-card p-4 transition-colors hover:border-primary"
      >
        <span class="flex items-start justify-between gap-2">
          <span class="flex flex-col">
            <span class="font-semibold">{{ c.name }}</span>
            <span class="text-xs text-muted-foreground"
              >{{ c.className || 'Awaiting arm' }} · {{ c.branch }}</span
            >
          </span>
          <StatusBadge :label="c.status" :tone="tone(c.status)" />
        </span>
        <span class="text-[13px]">Balance {{ formatNaira(c.balance) }}</span>
        <span class="text-xs text-faint">{{ c.note || `Relationship: ${c.relationship}` }}</span>
      </RouterLink>
    </div>

    <div class="grid items-start gap-4 md:grid-cols-3">
      <KeyValueCard
        title="Contact"
        :rows="[
          { label: 'Phone', value: g.phone },
          { label: 'Email', value: g.email },
          { label: 'Address', value: g.address },
          { label: 'Occupation', value: g.occupation },
        ]"
      />
      <KeyValueCard
        title="Financial responsibility"
        :rows="[
          {
            label: 'Pays for',
            value: g.paysFees ? g.children.map((c) => c.name.split(' ')[0]).join(', ') : 'No one',
          },
          {
            label: 'Combined balance',
            value: formatNaira(g.balance),
            emphasis: g.balance ? 'error' : 'success',
          },
          { label: 'Payment plan', value: g.paymentPlan },
          { label: 'Preferred method', value: g.preferredMethod },
        ]"
      />
      <KeyValueCard
        title="Notification preferences"
        :rows="g.notifications.map(([label, value]) => ({ label, value }))"
      />
    </div>
  </template>
</template>
