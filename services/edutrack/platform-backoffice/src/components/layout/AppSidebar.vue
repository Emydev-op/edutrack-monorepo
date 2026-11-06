<script setup lang="ts">
import logoMark from '@edutrack/ui/assets/brand/logo-mark-duo.svg';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@edutrack/ui/components/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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

import { useSupportSummaryQuery } from '@/api/services/support';
import { navigation, navKeyAliases, type NavItem } from '@/config/navigation';

import AccountMenu from './AccountMenu.vue';

const route = useRoute();
const { data: support } = useSupportSummaryQuery();

const collapsed = useStorage<Record<string, boolean>>('edutrack.platform.nav-collapsed', {});

const activeKey = computed(() => {
  const key = (route.meta.nav as string | undefined) ?? (route.name as string | undefined) ?? '';
  return navKeyAliases[key] ?? key;
});
const badgeFor = (item: NavItem) => (item.badge === 'openIssues' ? support.value?.open : undefined);
const toggleGroup = (label: string) =>
  (collapsed.value = { ...collapsed.value, [label]: !collapsed.value[label] });
</script>

<template>
  <Sidebar collapsible="offcanvas" class="border-r">
    <SidebarHeader class="flex-row items-center gap-2.5 px-4 pt-4 pb-3">
      <img :src="logoMark" alt="" class="size-8 shrink-0 object-contain" />
      <div class="flex min-w-0 flex-col">
        <span class="text-sm font-semibold">EduTrack</span>
        <span class="text-xs text-faint">Platform back office</span>
      </div>
    </SidebarHeader>

    <SidebarContent class="px-1 pb-3">
      <nav aria-label="Main">
        <SidebarGroup v-for="group in navigation" :key="group.label || 'root'" class="py-1">
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

    <SidebarFooter class="border-t p-2.5">
      <AccountMenu />
    </SidebarFooter>
  </Sidebar>
</template>
