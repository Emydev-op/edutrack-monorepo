<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';

import { useInviteStaffMutation } from '@/api/services/staff';
import { routesPath } from '@/router/routes-path';
import type { StaffDetail } from '@/types';

const props = defineProps<{ staff: StaffDetail }>();
const invite = useInviteStaffMutation();
const u = computed(() => props.staff.user);
const active = computed(() => props.staff.status === 'Active');

async function sendInvite() {
  try {
    const r = await invite.mutateAsync([props.staff.id]);
    if (r.invited) toast.success(`Invitation sent to ${props.staff.email}.`);
    else
      toast.error(
        'No obvious role for this position. Choose one from Edit by turning on portal access.',
      );
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'We couldn’t send the invitation. Try again.'));
  }
}
</script>

<template>
  <div v-if="u" class="grid items-start gap-4 md:grid-cols-2">
    <KeyValueCard
      title="Account"
      :status="u.status"
      :rows="[
        { label: 'Sign-in email', value: u.email },
        { label: 'Last active', value: u.lastActive },
        {
          label: 'Invitation',
          value:
            u.status === 'Invited'
              ? `Sent ${u.invited ?? ''} · expires in 7 days`
              : u.invited
                ? `Sent ${u.invited}`
                : 'Accepted',
        },
      ]"
    >
      <template v-if="u.status === 'Invited' && active" #action>
        <Button variant="outline" size="sm" :disabled="invite.isPending.value" @click="sendInvite"
          >Resend</Button
        >
      </template>
    </KeyValueCard>
    <KeyValueCard
      title="Roles & scope"
      :rows="[
        { label: 'System roles', value: u.roles.join(', ') },
        {
          label: 'Scope',
          value:
            staff.kind === 'Teaching' && u.roles.join() === 'Teacher'
              ? 'Assigned classes & subjects'
              : u.scope,
        },
        { label: 'Position (not a role)', value: staff.position },
      ]"
      footer="Position is the job title. Roles decide what they can do in Edutrack."
    >
      <template #action>
        <RouterLink
          :to="{ name: routesPath.school.user.name, params: { id: u.id } }"
          class="text-[13px] text-primary hover:underline"
          >Manage access</RouterLink
        >
      </template>
    </KeyValueCard>
  </div>

  <EmptyState
    v-else
    title="No Edutrack account"
    :description="
      staff.email
        ? `${staff.name} is a staff record only. Drivers, cleaners and security don’t need an account; invite them only if they’ll use Edutrack.`
        : `Add an email for ${staff.name} before inviting them. Drivers, cleaners and security don’t need an account.`
    "
  >
    <Button v-if="!active" disabled>Reactivate to invite</Button>
    <Button v-else-if="staff.email" :disabled="invite.isPending.value" @click="sendInvite"
      >Invite to Edutrack</Button
    >
    <Button v-else as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.staff.edit.name, params: { id: staff.id } }"
        >Add an email</RouterLink
      ></Button
    >
  </EmptyState>
</template>
