<script setup lang="ts">
import {
  ArrowRightIcon,
  BuildingIcon,
  CreditCardIcon,
  LifeBuoyIcon,
  SchoolIcon,
  UserPlusIcon,
} from '@lucide/vue';
import { RouterLink } from 'vue-router';

import { routesPath } from '@/router/routes-path';

defineEmits<{ invite: [] }>();

const actions = [
  {
    label: 'Provision school',
    to: { name: routesPath.schools.provision.name },
    icon: BuildingIcon,
  },
  { label: 'Invite user', icon: UserPlusIcon, invite: true },
  {
    label: 'Create support issue',
    to: { name: routesPath.support.create.name },
    icon: LifeBuoyIcon,
  },
  { label: 'View schools', to: { name: routesPath.schools.list.name }, icon: SchoolIcon },
  {
    label: 'View subscriptions',
    to: { name: routesPath.subscriptions.name },
    icon: CreditCardIcon,
  },
];
const tile =
  'group flex items-center gap-3 rounded-lg border bg-card p-3.5 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-primary hover:shadow-[0_4px_14px_rgb(155_64_60/0.10)]';
</script>

<template>
  <section aria-labelledby="quick-actions" class="flex flex-col gap-2.5">
    <h2 id="quick-actions" class="text-[15px] font-semibold">Quick actions</h2>
    <div class="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
      <component
        :is="action.invite ? 'button' : RouterLink"
        v-for="action in actions"
        :key="action.label"
        :to="action.to"
        :type="action.invite ? 'button' : undefined"
        :class="tile"
        @click="action.invite && $emit('invite')"
      >
        <span
          aria-hidden="true"
          class="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-subtle text-primary transition-colors group-hover:bg-primary group-hover:text-white"
        >
          <component
            :is="action.icon"
            class="size-5.5 transition-transform group-hover:scale-110 group-hover:-rotate-6"
            :stroke-width="1.7"
          />
        </span>
        <span class="flex-1 text-sm font-medium">{{ action.label }}</span>
        <ArrowRightIcon
          class="size-4 text-primary transition-transform group-hover:translate-x-0.5"
        />
      </component>
    </div>
  </section>
</template>
