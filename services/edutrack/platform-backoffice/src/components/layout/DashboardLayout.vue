<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { SidebarInset, SidebarProvider } from '@edutrack/ui/components/sidebar';
import { computed, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';

import NoAccessState from '@edutrack/app-kit/components/common/NoAccessState.vue';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import { useLayoutStore } from '@/stores/layout';

import AppHeader from './AppHeader.vue';
import AppSidebar from './AppSidebar.vue';
import CommandMenu from './CommandMenu.vue';

const searchOpen = ref(false);
const route = useRoute();
const router = useRouter();
const layout = useLayoutStore();
const auth = useAuthStore();

// Pages the role can't open show why, in place, instead of empty tables or failed requests.
const missing = computed(() =>
  (route.meta.permission ?? []).filter((p) => !auth.can(p)).map((p) => p.replace('.', ' · ')),
);
const area = computed(() => route.meta.title ?? route.meta.breadcrumb?.[0]?.label ?? 'this page');
const canGoBack = computed(() => !!router.options.history.state.back);

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
          <NoAccessState
            v-if="missing.length"
            :area="area"
            :role-name="auth.user?.roleName"
            :missing="missing"
            contact="a Platform Administrator"
          >
            <Button v-if="canGoBack" variant="outline" @click="router.back()">Go back</Button>
            <Button as-child
              ><RouterLink :to="{ name: routesPath.dashboard.name }"
                >Go to dashboard</RouterLink
              ></Button
            >
          </NoAccessState>
          <RouterView v-else />
        </div>
      </div>
    </SidebarInset>
    <CommandMenu v-model:open="searchOpen" />
  </SidebarProvider>
</template>
