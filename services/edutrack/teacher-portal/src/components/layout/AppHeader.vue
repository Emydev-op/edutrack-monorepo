<script setup lang="ts">
import { Kbd } from '@edutrack/ui/components/kbd';
import { SidebarTrigger } from '@edutrack/ui/components/sidebar';
import { CalendarDaysIcon, ChevronsLeftIcon, SearchIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { useTermContext } from '@/composables/useTermContext';
import { formatWeekday } from '@/lib/dates';
import type { Crumb } from '@/router/types';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

import AccountMenu from './AccountMenu.vue';
import ContextSwitcher from './ContextSwitcher.vue';
import NotificationsPopover from './NotificationsPopover.vue';

defineEmits<{ search: [] }>();

const route = useRoute();
const router = useRouter();
const layout = useLayoutStore();
const { today, now } = useTermContext();

const crumbs = computed<Crumb[]>(() => {
  const trail = [...route.matched].reverse().find((r) => r.meta.breadcrumb)?.meta.breadcrumb ?? [];
  const all: Crumb[] = [{ label: 'Workspace', to: routesPath.dashboard.name }, ...trail];
  if (layout.recordLabel) all.push({ label: layout.recordLabel });
  return all;
});

/** The page this one drills down from (e.g. Assignments for an assignment), if any. */
const parent = computed(() =>
  crumbs.value
    .slice(1, -1)
    .reverse()
    .find((c) => c.to && c.to !== route.name),
);

function goBack() {
  if (!parent.value?.to) return;
  // Return to the exact list the user came from (filters, page) when that's where they were.
  const previous = window.history.state?.back as string | undefined;
  if (previous && router.resolve(previous).name === parent.value.to) router.back();
  else void router.push({ name: parent.value.to });
}

const isMac = navigator.userAgent.includes('Mac');
</script>

<template>
  <header
    class="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2.5 border-b bg-card px-5 max-md:gap-1.5 max-md:px-3"
  >
    <SidebarTrigger class="-ml-1 md:hidden" />
    <button
      v-if="parent"
      type="button"
      :aria-label="`Back to ${parent.label}`"
      :title="`Back to ${parent.label}`"
      class="-ml-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-sm:hidden"
      @click="goBack"
    >
      <ChevronsLeftIcon class="size-4.5" />
    </button>
    <nav aria-label="Breadcrumb" class="min-w-0 overflow-hidden max-xl:hidden">
      <ol class="flex items-center gap-1.5 text-[13px] whitespace-nowrap text-faint">
        <li
          v-for="(crumb, i) in crumbs"
          :key="`${crumb.label}-${i}`"
          class="flex items-center gap-1.5"
        >
          <RouterLink
            v-if="crumb.to && i < crumbs.length - 1"
            :to="{ name: crumb.to }"
            class="text-muted-foreground hover:text-foreground"
          >
            {{ crumb.label }}
          </RouterLink>
          <span v-else class="truncate font-medium text-foreground" aria-current="page">{{
            crumb.label
          }}</span>
          <span v-if="i < crumbs.length - 1" aria-hidden="true">/</span>
        </li>
      </ol>
    </nav>
    <ContextSwitcher />
    <span
      v-if="today"
      class="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-faint max-lg:hidden"
      :title="`The date and time the workspace is using: ${formatWeekday(today)} ${now.slice(11, 16)}`"
    >
      <CalendarDaysIcon class="size-3.5" aria-hidden="true" />
      {{ formatWeekday(today) }} · {{ now.slice(11, 16) }}
    </span>
    <span class="flex-1" />
    <button
      type="button"
      aria-label="Search"
      class="flex h-9 w-48 shrink-0 items-center gap-2 rounded-md border bg-muted px-2.5 text-[13px] whitespace-nowrap text-faint hover:border-[#D9D5CD] max-xl:w-9 max-xl:justify-center"
      @click="$emit('search')"
    >
      <SearchIcon class="size-4" />
      <span class="flex-1 text-left max-xl:hidden">Search…</span>
      <Kbd class="bg-card max-xl:hidden">{{ isMac ? '⌘' : 'Ctrl' }} K</Kbd>
    </button>
    <NotificationsPopover />
    <AccountMenu />
  </header>
</template>
