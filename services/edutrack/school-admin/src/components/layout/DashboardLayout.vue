<script setup lang="ts">
import { SidebarInset, SidebarProvider } from '@edutrack/ui/components/sidebar';
import { ref, watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';

import { useContextOptionsQuery } from '@/api/services/shell';
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
const { data: options } = useContextOptionsQuery();
watch(options, (o) => o && context.useOptions(o), { immediate: true });

// A record's breadcrumb label belongs to the page that set it.
watch(
  () => route.params.id,
  () => layout.setRecordLabel(null),
);

// Pages scroll inside the content pane, not the window, so the router's scroll reset doesn't
// reach it. Start each new page at the top.
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
      <div id="main-content" ref="content" class="flex-1 overflow-y-auto print:overflow-visible">
        <div class="mx-auto flex max-w-330 flex-col gap-5 px-8 pt-6 pb-14 max-md:px-4">
          <RouterView />
        </div>
      </div>
    </SidebarInset>
    <CommandMenu v-model:open="searchOpen" />
  </SidebarProvider>
</template>
