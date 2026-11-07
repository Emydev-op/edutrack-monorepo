<script setup lang="ts">
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@edutrack/ui/components/dropdown-menu';
import { Spinner } from '@edutrack/ui/components/spinner';
import { BellIcon, ChevronDownIcon, LogOutIcon, UserIcon } from '@lucide/vue';
import { useQueryClient } from '@tanstack/vue-query';
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import InitialsAvatar from '@edutrack/app-kit/components/common/InitialsAvatar.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useLogoutMutation } from '@/api/services/auth';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const queryClient = useQueryClient();
const confirm = useConfirm();
const logout = useLogoutMutation();
const signingOut = ref(false);

const links = [
  {
    label: 'My profile & security',
    to: { name: routesPath.settings.name, query: { tab: 'security' } },
    icon: UserIcon,
  },
  {
    label: 'Notification settings',
    to: { name: routesPath.settings.name, query: { tab: 'notifications' } },
    icon: BellIcon,
  },
];

// Opened after the menu closes, so the dialog doesn't compete with the menu's focus handling.
const defer = (open: () => void) => setTimeout(open, 0);

async function finishSignOut() {
  signingOut.value = true;
  try {
    await logout.mutateAsync(false);
  } catch {
    // The session ends locally even if the server can't be reached.
  }
  auth.clear();
  await router.replace({ name: routesPath.auth.login.name, query: { reason: 'signedout' } });
  // Cleared after leaving the app shell, so mounted pages don't refetch on the way out.
  queryClient.clear();
  signingOut.value = false;
}

function signOut() {
  void confirm({
    title: `Sign out of ${auth.school?.name ?? 'School Admin'}?`,
    description:
      'You’ll need your email and password to sign back in. Unsaved changes on open pages will be lost.',
    confirmLabel: 'Sign out',
    tone: 'destructive',
    action: finishSignOut,
  });
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger
      aria-label="Account menu"
      class="flex h-10 shrink-0 items-center gap-2 rounded-lg px-1.5 text-left hover:bg-muted data-[state=open]:bg-muted"
    >
      <InitialsAvatar :initials="auth.initials" />
      <span class="flex min-w-0 flex-col max-lg:hidden">
        <span class="truncate text-[13px] leading-tight font-medium">{{ auth.fullName }}</span>
        <span class="truncate text-xs text-faint"
          >{{ auth.user?.position }} · {{ auth.user?.roleName }}</span
        >
      </span>
      <ChevronDownIcon class="size-3.5 text-muted-foreground max-lg:hidden" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-72 overflow-hidden rounded-[10px] p-0">
      <div class="flex items-center gap-2.5 bg-muted p-3.5">
        <InitialsAvatar :initials="auth.initials" solid />
        <div class="flex min-w-0 flex-col">
          <span class="text-[13px] font-semibold">{{ auth.fullName }}</span>
          <span class="text-xs text-muted-foreground"
            >{{ auth.user?.position }} · {{ auth.user?.roleName }}</span
          >
          <span class="truncate text-xs text-faint">{{ auth.user?.email }}</span>
        </div>
      </div>
      <div class="p-1.5">
        <DropdownMenuItem
          v-for="link in links"
          :key="link.label"
          as-child
          class="h-9 gap-2.5 px-2.5 text-[13px]"
        >
          <RouterLink :to="link.to"
            ><component :is="link.icon" class="text-muted-foreground" />{{ link.label }}</RouterLink
          >
        </DropdownMenuItem>
      </div>
      <DropdownMenuSeparator class="m-0 bg-divider" />
      <div class="p-1.5">
        <DropdownMenuItem
          class="h-9 gap-2.5 px-2.5 text-[13px] font-medium text-destructive focus:bg-error-subtle focus:text-destructive"
          @select="defer(signOut)"
        >
          <LogOutIcon class="text-destructive" />Sign out
        </DropdownMenuItem>
      </div>
    </DropdownMenuContent>
  </DropdownMenu>

  <Teleport to="body">
    <div
      v-if="signingOut"
      role="status"
      aria-live="polite"
      class="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background/90 text-sm"
    >
      <Spinner class="size-7 text-primary" />
      Signing you out…
    </div>
  </Teleport>
</template>
