<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { MonitorIcon, SmartphoneIcon } from '@lucide/vue';
import { computed } from 'vue';
import { toast } from 'vue-sonner';

import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  useDevicesQuery,
  useEndDeviceMutation,
  useSignOutOthersMutation,
} from '@/api/services/auth';
import { formatDateTime } from '@/lib/dates';
import { getApiErrorMessage } from '@/lib/api-errors';
import type { DeviceSession } from '@/types';

const { data, isPending, error } = useDevicesQuery();
const endOne = useEndDeviceMutation();
const endOthers = useSignOutOthersMutation();
const confirm = useConfirm();
const others = computed(() => data.value?.filter((d) => !d.current) ?? []);

const isPhone = (d: DeviceSession) => /iPhone|Android/.test(d.device);

function signOutDevice(d: DeviceSession) {
  void confirm({
    title: `Sign out of ${d.device}?`,
    description: 'Anyone using that device will need your password to sign in again.',
    details: [
      ['Last active', formatDateTime(d.lastActive)],
      ['Location', d.location],
    ],
    confirmLabel: 'Sign out device',
    tone: 'destructive',
    action: async () => {
      await endOne.mutateAsync(d.id);
      toast.success(`Signed out of ${d.device}.`);
    },
  });
}

function signOutOthers() {
  const n = others.value.length;
  void confirm({
    title: `Sign out of ${n} other device${n === 1 ? '' : 's'}?`,
    description:
      'You stay signed in here. The other devices will need your password again; anything unsaved on them is lost.',
    confirmLabel: 'Sign out others',
    tone: 'destructive',
    action: async () => {
      const { signedOut } = await endOthers.mutateAsync();
      toast.success(`Signed out of ${signedOut} other device${signedOut === 1 ? '' : 's'}.`);
    },
  });
}
</script>

<template>
  <PageHeader
    title="Signed-in devices"
    description="Where your Teacher Workspace account is signed in. Sign out of any you don’t recognise, then change your password."
  >
    <template #actions>
      <Button
        variant="outline"
        :disabled="!others.length || endOthers.isPending.value"
        @click="signOutOthers"
        >Sign out all other devices</Button
      >
    </template>
  </PageHeader>
  <p v-if="error" class="text-sm text-error-strong">
    {{ getApiErrorMessage(error, 'Your devices couldn’t load. Refresh to try again.') }}
  </p>
  <Skeleton v-else-if="isPending" class="h-48 w-full" />
  <SectionCard v-else flush>
    <ul class="divide-y divide-divider">
      <li
        v-for="d in data"
        :key="d.id"
        class="flex items-center gap-3 px-4.5 py-3 max-sm:flex-wrap max-sm:px-4"
      >
        <component
          :is="isPhone(d) ? SmartphoneIcon : MonitorIcon"
          class="size-5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="flex flex-wrap items-center gap-2 text-[13px] font-medium"
            >{{ d.device }}<StatusBadge v-if="d.current" label="This device" tone="success"
          /></span>
          <span class="text-xs text-muted-foreground"
            >{{ d.location }} ·
            {{ d.current ? 'Active now' : `Last active ${formatDateTime(d.lastActive)}` }}</span
          >
          <span class="text-[11px] text-faint">Signed in {{ formatDateTime(d.signedInAt) }}</span>
        </span>
        <Button
          v-if="!d.current"
          variant="ghost"
          size="sm"
          class="text-destructive max-sm:ml-8"
          @click="signOutDevice(d)"
          >Sign out</Button
        >
      </li>
    </ul>
  </SectionCard>
</template>
