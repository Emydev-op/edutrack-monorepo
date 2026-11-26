<script setup lang="ts">
import { useLogoFallback } from '@edutrack/app-kit/composables/useLogoFallback';
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
  useSidebar,
} from '@edutrack/ui/components/sidebar';
import { ChevronDownIcon } from '@lucide/vue';
import { useStorage } from '@vueuse/core';
import { computed, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { useMyHostelQuery } from '@/api/services/boarding';
import { useConversationsQuery } from '@/api/services/messages';
import { useMeQuery, useNavCountsQuery } from '@/api/services/shell';
import { navigationFor, navKeyAliases, type NavItem } from '@/config/navigation';
import { routesPath } from '@/router/routes-path';
import { useSchoolBrand } from '@/lib/school-brand';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const auth = useAuthStore();
const { data: me } = useMeQuery();
const { data: counts } = useNavCountsQuery();
// Unread messages from parents: the conversation list refreshes itself every 30 s.
const { data: inbox } = useConversationsQuery();
// My hostel shows only for house staff (at least one hostel).
const { data: hostel } = useMyHostelQuery();
// Screens outside the school's plan are hidden.
const groups = computed(() =>
  navigationFor(me.value, auth.school?.modules, Boolean(hostel.value?.hostels.length)),
);

const collapsed = useStorage<Record<string, boolean>>('edutrack.teacher-portal.nav-collapsed', {});

const activeKey = computed(() => {
  const key = (route.meta.nav as string | undefined) ?? (route.name as string | undefined) ?? '';
  return navKeyAliases[key] ?? key;
});
const badgeFor = (item: NavItem) =>
  (item.route === routesPath.messages.list.name
    ? inbox.value?.unread
    : counts.value?.[item.route]) || undefined;
const toggleGroup = (label: string) =>
  (collapsed.value = { ...collapsed.value, [label]: !collapsed.value[label] });

// On phones the sidebar is a sheet: close it once a page is chosen.
// Their campus's logo (one campus), else the school's from the session or this address.
const brand = useSchoolBrand();
const logo = computed(() => me.value?.campus?.logoUrl ?? auth.school?.logoUrl ?? brand.logoUrl);
const { failed: logoFailed, onError: onLogoError } = useLogoFallback(() => logo.value);

const sidebar = useSidebar();
watch(
  () => route.fullPath,
  () => sidebar.isMobile.value && sidebar.setOpenMobile(false),
);
</script>

<template>
  <Sidebar collapsible="offcanvas" class="border-r">
    <SidebarHeader class="flex-row items-center gap-2.5 px-4 pt-4 pb-3">
      <img
        v-if="logo && !logoFailed"
        :src="logo"
        alt=""
        class="size-8 shrink-0 rounded-lg object-contain"
        @error="onLogoError"
      />
      <span
        v-else
        class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-semibold text-brand-subtle"
        aria-hidden="true"
        >{{ auth.school?.initials }}</span
      >
      <div class="flex min-w-0 flex-col">
        <span class="truncate text-sm font-semibold">{{ auth.school?.name }}</span>
        <span class="text-xs text-faint">Teacher Workspace</span>
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
