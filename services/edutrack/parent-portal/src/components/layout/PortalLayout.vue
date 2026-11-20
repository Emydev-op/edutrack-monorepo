<script setup lang="ts">
import { useIdleSignOut } from '@edutrack/app-kit/composables/useIdleSignOut';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { BellIcon, BookOpenIcon, HomeIcon, MenuIcon, TrophyIcon, WalletIcon } from '@lucide/vue';
import { useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';

import { useLogoutMutation } from '@/api/services/auth';
import { useNotificationsQuery } from '@/api/services/parent';
import { useCurrentChild } from '@/composables/useCurrentChild';
import { formatDay } from '@/lib/dates';
import { getApiErrorMessage } from '@/lib/api-errors';
import { useSchoolBrand } from '@/lib/school-brand';
import { routesPath, TABS } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import { useChildrenStore } from '@/stores/children';

import ChildSwitcher from './ChildSwitcher.vue';
import ContactSchoolSheet from './ContactSchoolSheet.vue';
import SignOutSheet from './SignOutSheet.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useChildrenStore();
const brand = useSchoolBrand();
const { overview, children, child } = useCurrentChild();
const notifications = useNotificationsQuery('unread');
const unread = computed(() => notifications.data.value?.unread ?? 0);

// Keep the chosen child valid as the list loads, and follow `?child=` (from a notification).
watch(
  [children, () => route.query.child],
  ([list, wanted]) => {
    if (!list.length) return;
    if (typeof wanted === 'string' && list.some((c) => c.id === wanted)) store.select(wanted);
    else store.sync(list);
  },
  { immediate: true },
);

const ICONS = {
  home: HomeIcon,
  fees: WalletIcon,
  results: TrophyIcon,
  assignments: BookOpenIcon,
  more: MenuIcon,
};
const activeTab = computed(() => route.meta.tab ?? 'home');
const termLabel = computed(() => {
  const t = overview.data.value?.term;
  return t ? `${t.session} · ${t.name}` : '';
});
const logoFailed = ref(false);

// Shared phones: sign out after the school's idle time, unless "Remember this device".
const queries = useQueryClient();
const logoutIdle = useLogoutMutation();
useIdleSignOut(
  () => (auth.remembered() ? null : (auth.school?.idleTimeoutMinutes ?? 30)),
  async () => {
    try {
      await logoutIdle.mutateAsync();
    } catch {
      // Signed out locally even if the server can't be reached.
    }
    auth.clear();
    await router.replace({ name: routesPath.auth.login.name, query: { reason: 'idle' } });
    queries.clear();
  },
);

// Pages scroll inside the content pane, so start each new page at the top.
const content = ref<HTMLElement | null>(null);
watch(
  () => route.path,
  () => content.value?.scrollTo({ top: 0 }),
);
</script>

<template>
  <div class="flex h-svh flex-col bg-background text-sm">
    <header class="z-10 flex-none border-b bg-card">
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-2.5 px-4 pt-2.5 pb-2.5 md:pb-0">
        <div class="flex items-center gap-2.5">
          <RouterLink
            :to="{ name: routesPath.home.name }"
            class="flex min-w-0 flex-1 items-center gap-2.5"
          >
            <span
              v-if="auth.school?.logoUrl && !logoFailed"
              class="flex size-8 shrink-0 items-center justify-center rounded-md border bg-card p-0.5"
            >
              <img
                :src="auth.school.logoUrl"
                alt=""
                class="size-full object-contain"
                @error="logoFailed = true"
              />
            </span>
            <span
              v-else
              class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-[13px] font-semibold text-brand-subtle"
              aria-hidden="true"
              >{{ auth.school?.initials ?? brand.initials }}</span
            >
            <span class="flex min-w-0 flex-col">
              <span class="truncate text-sm font-semibold">{{
                auth.school?.name ?? brand.name
              }}</span>
              <span class="text-[11px] text-faint">Parent portal</span>
            </span>
          </RouterLink>
          <RouterLink
            :to="{ name: routesPath.notifications.name }"
            class="relative flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            :aria-label="unread ? `Notifications, ${unread} unread` : 'Notifications'"
          >
            <BellIcon class="size-5" />
            <span
              v-if="unread"
              class="absolute top-2 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
              >{{ unread > 9 ? '9+' : unread }}</span
            >
          </RouterLink>
          <RouterLink
            :to="{ name: routesPath.profile.name }"
            class="flex size-8.5 items-center justify-center rounded-full bg-brand-subtle text-xs font-semibold text-brand-strong"
            aria-label="Profile"
            >{{ auth.initials }}</RouterLink
          >
        </div>
        <ChildSwitcher
          v-if="route.meta.perChild && child"
          :children="children"
          :selected="child"
          :term="termLabel"
          @select="store.select"
        />
        <nav aria-label="Portal" class="flex gap-5 border-t border-divider pt-1.5 max-md:hidden">
          <RouterLink
            v-for="t in TABS"
            :key="t.key"
            :to="{ name: t.route }"
            class="border-b-2 py-1.5 text-[13px]"
            :class="
              activeTab === t.key
                ? 'border-primary font-semibold text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            "
            :aria-current="activeTab === t.key ? 'page' : undefined"
            >{{ t.label }}</RouterLink
          >
        </nav>
      </div>
    </header>

    <main id="main" ref="content" class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-3.5 px-4 pt-4 pb-10">
        <template v-if="overview.data.value">
          <InlineNotice
            v-if="route.meta.perChild && child?.access === 'read-only'"
            tone="neutral"
            :title="`${child.firstName} has left the school`"
            :description="`Left ${formatDay(child.leftOn)}. Their records stay visible, read-only, until ${formatDay(child.readOnlyUntil)}. Any old balance can still be paid.`"
          />
          <RouterView />
        </template>
        <EmptyState
          v-else-if="overview.error.value"
          title="The Parent Portal couldn’t load"
          :description="
            getApiErrorMessage(overview.error.value, 'Check your connection and refresh the page.')
          "
        />
        <template v-else>
          <Skeleton class="h-9 w-56" />
          <Skeleton class="h-24 w-full" />
          <Skeleton class="h-48 w-full" />
        </template>
      </div>
    </main>

    <nav
      aria-label="Portal"
      class="grid h-16 flex-none grid-cols-5 border-t bg-card pb-1.5 md:hidden"
    >
      <RouterLink
        v-for="t in TABS"
        :key="t.key"
        :to="{ name: t.route }"
        class="flex flex-col items-center justify-center gap-1 text-[11px]"
        :class="activeTab === t.key ? 'font-semibold text-primary' : 'text-muted-foreground'"
        :aria-current="activeTab === t.key ? 'page' : undefined"
      >
        <component :is="ICONS[t.key]" class="size-5" aria-hidden="true" />
        {{ t.label }}
      </RouterLink>
    </nav>

    <ContactSchoolSheet />
    <SignOutSheet />
  </div>
</template>
