<script setup lang="ts">
import { computed } from 'vue';
import {
  BedDoubleIcon,
  BellIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  FolderOpenIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  PhoneIcon,
  UserIcon,
  UsersIcon,
} from '@lucide/vue';
import { RouterLink } from 'vue-router';

import { useMessagesQuery } from '@/api/services/messages';
import PageTitle from '@/components/common/PageTitle.vue';
import { useCurrentChild } from '@/composables/useCurrentChild';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

/** Everything that isn't a tab. */
const ui = useUiStore();
const auth = useAuthStore();
const messages = useMessagesQuery();
const unreadMessages = computed(() => messages.data.value?.unread ?? 0);
const { child } = useCurrentChild();
const LINKS = [
  { label: 'Messages', route: routesPath.messages.list.name, icon: MessageSquareIcon },
  { label: 'My children', route: routesPath.children.name, icon: UsersIcon },
  { label: 'Timetable', route: routesPath.timetable.name, icon: CalendarDaysIcon },
  { label: 'Attendance', route: routesPath.attendance.name, icon: CalendarCheckIcon },
  { label: 'Boarding', route: routesPath.boarding.name, icon: BedDoubleIcon, boarders: true },
  {
    label: 'Materials',
    route: routesPath.materials.name,
    icon: FolderOpenIcon,
    module: 'homework',
  },
  { label: 'Announcements', route: routesPath.announcements.name, icon: MegaphoneIcon },
  { label: 'Notifications', route: routesPath.notifications.name, icon: BellIcon },
  { label: 'Profile & preferences', route: routesPath.profile.name, icon: UserIcon },
];
// Links outside the school's plan are hidden; Boarding shows only for a boarder.
const links = computed(() =>
  LINKS.filter((l) => {
    if ((l as { boarders?: boolean }).boarders && !child.value?.boarding) return false;
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
      <span class="flex-1 text-sm">{{ l.label }}</span>
      <span
        v-if="l.route === routesPath.messages.list.name && unreadMessages"
        class="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
        :aria-label="`${unreadMessages} unread`"
        >{{ unreadMessages > 9 ? '9+' : unreadMessages }}</span
      >
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
        <span class="text-sm">Signed in as {{ auth.user?.email }}</span>
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
