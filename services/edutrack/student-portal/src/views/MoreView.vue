<script setup lang="ts">
import { computed } from 'vue';
import {
  BellIcon,
  CalendarCheckIcon,
  FolderOpenIcon,
  MegaphoneIcon,
  PhoneIcon,
  UserIcon,
} from '@lucide/vue';
import { RouterLink } from 'vue-router';

import PageTitle from '@/components/common/PageTitle.vue';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

/** Everything that isn't a tab. */
const ui = useUiStore();
const auth = useAuthStore();
const LINKS = [
  { label: 'Attendance', route: routesPath.attendance.name, icon: CalendarCheckIcon },
  {
    label: 'Materials',
    route: routesPath.materials.name,
    icon: FolderOpenIcon,
    module: 'homework',
  },
  { label: 'Announcements', route: routesPath.announcements.name, icon: MegaphoneIcon },
  { label: 'Notifications', route: routesPath.notifications.name, icon: BellIcon },
  { label: 'Profile & password', route: routesPath.profile.name, icon: UserIcon },
];
// Links outside the school's plan are hidden.
const links = computed(() =>
  LINKS.filter((l) => {
    const m = (l as { module?: string }).module;
    return !m || !auth.school?.modules || auth.school.modules.includes(m);
  }),
);
</script>

<template>
  <PageTitle title="More" />
  <nav class="overflow-hidden rounded-lg border bg-card" aria-label="More">
    <RouterLink
      v-for="l in links"
      :key="l.route"
      :to="{ name: l.route }"
      class="flex min-h-13 items-center gap-3 border-t border-divider px-3.5 first:border-t-0 hover:bg-surface-warm"
    >
      <component :is="l.icon" class="size-4.5 text-muted-foreground" aria-hidden="true" />
      <span class="text-sm">{{ l.label }}</span>
    </RouterLink>
    <button
      type="button"
      class="flex min-h-13 w-full items-center gap-3 border-t border-divider px-3.5 text-left hover:bg-surface-warm"
      @click="ui.contactOpen = true"
    >
      <PhoneIcon class="size-4.5 text-muted-foreground" aria-hidden="true" />
      <span class="text-sm">Contact school</span>
    </button>
  </nav>
  <section class="flex flex-col gap-1.5">
    <h2 class="text-sm font-semibold">Account</h2>
    <div class="overflow-hidden rounded-lg border bg-card">
      <div class="flex min-h-13 flex-col justify-center px-3.5 py-2.5">
        <span class="text-sm">Signed in as {{ auth.user?.admissionNo }}</span>
        <span class="text-xs text-faint">{{ auth.fullName }}</span>
      </div>
      <button
        type="button"
        class="flex min-h-13 w-full items-center border-t border-divider px-3.5 text-left text-sm font-medium text-destructive hover:bg-error-subtle"
        @click="ui.signOutOpen = true"
      >
        Sign out
      </button>
    </div>
  </section>
</template>
