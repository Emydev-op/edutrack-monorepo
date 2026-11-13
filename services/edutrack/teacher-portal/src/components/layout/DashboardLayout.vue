<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { SidebarInset, SidebarProvider } from '@edutrack/ui/components/sidebar';
import { ref, watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';

import { useMeQuery, useShellContextQuery } from '@/api/services/shell';
import { getApiErrorMessage } from '@/lib/api-errors';
import { useContextStore } from '@/stores/context';
import { useLayoutStore } from '@/stores/layout';

import AppHeader from './AppHeader.vue';
import AppSidebar from './AppSidebar.vue';
import CommandMenu from './CommandMenu.vue';
import ContextBanner from './ContextBanner.vue';

const searchOpen = ref(false);
const route = useRoute();
const layout = useLayoutStore();
const context = useContextStore();
const me = useMeQuery();
const shell = useShellContextQuery();
watch(shell.data, (s) => s && context.useShell(s), { immediate: true });

// A record's breadcrumb label belongs to the page that set it.
watch(
  () => route.path,
  () => layout.setRecordLabel(null),
);

// Pages scroll inside the content pane, so start each new page at the top.
const content = ref<HTMLElement | null>(null);
watch(
  () => route.path,
  () => content.value?.scrollTo({ top: 0 }),
);
</script>

<template>
  <SidebarProvider :style="{ '--sidebar-width': '244px' }" class="h-svh print:block print:h-auto">
    <AppSidebar class="print:hidden" />
    <SidebarInset class="flex min-h-0 min-w-0 flex-col print:block">
      <AppHeader class="print:hidden" @search="searchOpen = true" />
      <ContextBanner class="print:hidden" />
      <div
        id="main-content"
        ref="content"
        class="flex-1 overflow-x-hidden overflow-y-auto print:overflow-visible"
      >
        <div class="mx-auto flex max-w-330 flex-col gap-5 px-8 pt-6 pb-14 max-md:px-4">
          <!-- Every screen can rely on `me` and the term context being loaded. -->
          <template v-if="me.data.value && context.shell">
            <RouterView />
          </template>
          <EmptyState
            v-else-if="me.error.value || shell.error.value"
            title="Your workspace couldn’t load"
            :description="
              getApiErrorMessage(
                me.error.value ?? shell.error.value,
                'Check your connection and refresh the page.',
              )
            "
          />
          <template v-else>
            <Skeleton class="h-9 w-64" />
            <Skeleton class="h-28 w-full" />
            <Skeleton class="h-64 w-full" />
          </template>
        </div>
      </div>
    </SidebarInset>
    <CommandMenu v-model:open="searchOpen" />
  </SidebarProvider>
</template>
