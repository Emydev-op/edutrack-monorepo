<script setup lang="ts">
import { Kbd } from '@edutrack/ui/components/kbd';
import { SidebarTrigger } from '@edutrack/ui/components/sidebar';
import { ChevronsLeftIcon, SearchIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import type { Crumb } from '@/router/types';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

import NotificationsPopover from './NotificationsPopover.vue';

defineEmits<{ search: [] }>();

const route = useRoute();
const router = useRouter();
const layout = useLayoutStore();

const crumbs = computed<Crumb[]>(() => {
  const trail = [...route.matched].reverse().find((r) => r.meta.breadcrumb)?.meta.breadcrumb ?? [];
  const all: Crumb[] = [{ label: 'Platform', to: routesPath.dashboard.name }, ...trail];
  if (layout.recordLabel) all.push({ label: layout.recordLabel });
  return all;
});

/** The page this one drills down from (e.g. Schools for a school), if any. */
const parent = computed(() =>
  crumbs.value
    .slice(1, -1)
    .reverse()
    .find((c) => c.to),
);

function goBack() {
  if (!parent.value?.to) return;
  // Return to the exact list the user came from (filters, page, scroll) when that's where they
  // were; otherwise (deep link, switched tabs) open the parent page.
  const previous = window.history.state?.back as string | undefined;
  if (previous && router.resolve(previous).name === parent.value.to) router.back();
  else void router.push({ name: parent.value.to });
}

const isMac = navigator.userAgent.includes('Mac');
</script>

<template>
  <header class="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2.5 border-b bg-card px-5">
    <SidebarTrigger class="-ml-1 md:hidden" />
    <button
      v-if="parent"
      type="button"
      :aria-label="`Back to ${parent.label}`"
      :title="`Back to ${parent.label}`"
      class="-ml-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      @click="goBack"
    >
      <ChevronsLeftIcon class="size-4.5" />
    </button>
    <nav aria-label="Breadcrumb" class="mr-auto min-w-0 overflow-hidden">
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
    <button
      type="button"
      class="flex h-9 w-56 items-center gap-2 rounded-md border bg-muted px-2.5 text-[13px] text-faint hover:border-[#D9D5CD] max-sm:w-9 max-sm:justify-center"
      @click="$emit('search')"
    >
      <SearchIcon class="size-4" />
      <span class="flex-1 text-left max-sm:hidden">Search…</span>
      <Kbd class="bg-card max-sm:hidden">{{ isMac ? '⌘' : 'Ctrl' }} K</Kbd>
    </button>
    <NotificationsPopover />
  </header>
</template>
