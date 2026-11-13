<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { ChevronRightIcon, KeyRoundIcon, MonitorSmartphoneIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { initials } from '@edutrack/app-kit/lib/format';

import { useProfileQuery } from '@/api/services/profile';
import { formatDay } from '@/lib/dates';
import { getApiErrorMessage } from '@/lib/api-errors';
import { routesPath } from '@/router/routes-path';

const { data: p, isPending, error } = useProfileQuery();

const contact = computed(() => [
  { label: 'Work email', value: p.value?.email },
  {
    label: 'Mobile',
    value: p.value?.phone || 'Not added yet',
    emphasis: p.value?.phone ? undefined : ('error' as const),
  },
  { label: 'Address', value: p.value?.address || '—' },
]);
const emergency = computed(() =>
  p.value?.emergencyContact
    ? [
        { label: 'Name', value: p.value.emergencyContact.name },
        { label: 'Mobile', value: p.value.emergencyContact.phone },
        { label: 'Relationship', value: p.value.emergencyContact.relationship || '—' },
      ]
    : [{ label: 'Contact', value: 'Not added yet' }],
);
const work = computed(() => [
  { label: 'Staff number', value: p.value?.staffNo },
  { label: 'Department', value: p.value?.department ?? '—' },
  { label: 'Roles', value: p.value?.roles.join(', ') },
  { label: 'Campuses', value: p.value?.branches.join(', ') },
  { label: 'Employment', value: p.value?.employment },
  { label: 'Joined', value: formatDay(p.value?.joinedOn) },
  { label: 'Class teacher of', value: p.value?.classTeacherOf ?? '—' },
]);

const security = [
  {
    label: 'Change password',
    description: 'Signs you out on every other device.',
    to: { name: routesPath.profile.password.name },
    icon: KeyRoundIcon,
  },
  {
    label: 'Signed-in devices',
    description: 'See where you’re signed in and sign out devices you don’t use.',
    to: { name: routesPath.profile.devices.name },
    icon: MonitorSmartphoneIcon,
  },
];
</script>

<template>
  <template v-if="isPending">
    <Skeleton class="h-14 w-72" />
    <Skeleton class="h-48 w-full" />
  </template>
  <EmptyState
    v-else-if="error || !p"
    title="Your profile couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <template v-else>
    <PageHeader :title="p.name" :description="p.position" :initials="initials(p.name)">
      <template #actions>
        <Button as-child
          ><RouterLink :to="{ name: routesPath.profile.edit.name }"
            >Edit profile</RouterLink
          ></Button
        >
      </template>
    </PageHeader>
    <InlineNotice
      v-if="!p.phone"
      tone="warning"
      title="Complete your profile"
      description="Add your mobile number so the school office can reach you about your classes."
    >
      <template #action>
        <Button as-child size="sm" variant="outline"
          ><RouterLink :to="{ name: routesPath.profile.edit.name }">Add phone</RouterLink></Button
        >
      </template>
    </InlineNotice>
    <div class="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
      <div class="flex min-w-0 flex-col gap-5">
        <KeyValueCard title="Contact" :rows="contact" />
        <KeyValueCard title="Emergency contact" :rows="emergency" />
      </div>
      <div class="flex min-w-0 flex-col gap-5">
        <KeyValueCard
          title="Work"
          :rows="work"
          footer="Your name, email, roles and campuses are kept by the school office."
        />
        <SectionCard title="Teaching this term">
          <p v-if="!p.teaching.length" class="text-[13px] text-muted-foreground">
            No classes yet. The academic office assigns classes.
          </p>
          <ul v-else class="flex flex-wrap gap-1.5">
            <li
              v-for="t in p.teaching"
              :key="t"
              class="rounded-sm bg-muted px-2 py-1 text-xs font-medium"
            >
              {{ t }}
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
    <SectionCard title="Security" flush>
      <ul class="divide-y divide-divider">
        <li v-for="s in security" :key="s.label">
          <RouterLink :to="s.to" class="flex items-center gap-3 px-4.5 py-3 hover:bg-muted">
            <component :is="s.icon" class="size-4.5 shrink-0 text-muted-foreground" />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="text-[13px] font-medium">{{ s.label }}</span>
              <span class="text-xs text-muted-foreground">{{ s.description }}</span>
            </span>
            <ChevronRightIcon class="size-4 shrink-0 text-faint" />
          </RouterLink>
        </li>
      </ul>
    </SectionCard>
  </template>
</template>
