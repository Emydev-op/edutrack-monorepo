<script setup lang="ts">
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@edutrack/ui/components/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@edutrack/ui/components/sidebar';
import { ChevronDownIcon } from '@lucide/vue';
import { useStorage } from '@vueuse/core';
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { useSetupQuery } from '@/api/services/setup';
import { useNavCountsQuery } from '@/api/services/shell';
import { navigation, navKeyAliases, type NavItem } from '@/config/navigation';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const auth = useAuthStore();
const { data: counts } = useNavCountsQuery();
const { data: setup } = useSetupQuery();
// Once setup is finished the Setup Center leaves the sidebar; it stays reachable from the dashboard.
const groups = computed(() =>
  navigation.map((g) => ({
    ...g,
    items: g.items.filter((i) => !(i.route === routesPath.setup.name && setup.value?.finished)),
  })),
);

const collapsed = useStorage<Record<string, boolean>>('edutrack.school-admin.nav-collapsed', {});

const activeKey = computed(() => {
  const key = (route.meta.nav as string | undefined) ?? (route.name as string | undefined) ?? '';
  return navKeyAliases[key] ?? key;
});
const badgeFor = (item: NavItem) => counts.value?.[item.route] || undefined;
const toggleGroup = (label: string) =>
  (collapsed.value = { ...collapsed.value, [label]: !collapsed.value[label] });
</script>

<template>
  <Sidebar collapsible="offcanvas" class="border-r">
    <SidebarHeader class="flex-row items-center gap-2.5 px-4 pt-4 pb-3">
      <img
        v-if="auth.school?.logoUrl"
        :src="auth.school.logoUrl"
        alt=""
        class="size-8 shrink-0 rounded-lg object-contain"
      />
      <span
        v-else
        class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-semibold text-brand-subtle"
        aria-hidden="true"
        >{{ auth.school?.initials }}</span
      >
      <div class="flex min-w-0 flex-col">
        <span class="truncate text-sm font-semibold">{{ auth.school?.name }}</span>
        <span class="text-xs text-faint">School Admin</span>
      </div>
    </SidebarHeader>

    <SidebarContent class="px-1 pb-3">
      <nav aria-label="Main">
        <SidebarGroup v-for="(group, gi) in groups" :key="group.label || `root-${gi}`" class="py-1">
          <Collapsible
            :open="!group.label || !collapsed[group.label]"
            @update:open="group.label && toggleGroup(group.label)"
          >
            <CollapsibleTrigger
              v-if="group.label"
              class="group/trigger flex h-7 w-full items-center justify-between rounded-sm px-2 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              {{ group.label }}
              <ChevronDownIcon
                class="size-3.5 transition-transform group-data-[state=closed]/trigger:-rotate-90"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu class="gap-px">
                  <SidebarMenuItem v-for="item in group.items" :key="item.route">
                    <SidebarMenuButton
                      as-child
                      :is-active="activeKey === item.route"
                      class="h-8 px-2.5 text-[13px] data-[active=true]:bg-brand-subtle data-[active=true]:font-medium data-[active=true]:text-brand-strong"
                    >
                      <RouterLink
                        :to="{ name: item.route }"
                        :aria-current="activeKey === item.route ? 'page' : undefined"
                      >
                        {{ item.label }}
                      </RouterLink>
                    </SidebarMenuButton>
                    <SidebarMenuBadge
                      v-if="badgeFor(item)"
                      class="rounded-[3px] bg-highlight-subtle px-1.5 text-[11px] font-normal text-warning-strong"
                    >
                      {{ badgeFor(item) }}
                    </SidebarMenuBadge>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      </nav>
    </SidebarContent>
  </Sidebar>
</template>
