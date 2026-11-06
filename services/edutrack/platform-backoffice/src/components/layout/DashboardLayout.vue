<script setup lang="ts">
import { SidebarInset, SidebarProvider } from '@edutrack/ui/components/sidebar';
import { ref, watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';

import { useLayoutStore } from '@/stores/layout';

import AppHeader from './AppHeader.vue';
import AppSidebar from './AppSidebar.vue';
import CommandMenu from './CommandMenu.vue';

const searchOpen = ref(false);
const route = useRoute();
const layout = useLayoutStore();

// A record's breadcrumb label belongs to the page that set it.
watch(
  () => route.params.id,
  () => layout.setRecordLabel(null),
);
</script>

<template>
  <SidebarProvider :style="{ '--sidebar-width': '244px' }" class="h-svh">
    <AppSidebar />
    <SidebarInset class="flex min-h-0 min-w-0 flex-col">
      <AppHeader @search="searchOpen = true" />
      <div id="main-content" class="flex-1 overflow-y-auto">
        <div class="mx-auto flex max-w-330 flex-col gap-5 px-8 pt-6 pb-14 max-md:px-4">
          <RouterView />
        </div>
      </div>
    </SidebarInset>
    <CommandMenu v-model:open="searchOpen" />
  </SidebarProvider>
</template>
