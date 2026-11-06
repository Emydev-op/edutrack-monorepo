<script setup lang="ts">
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@edutrack/ui/components/dropdown-menu';
import { Spinner } from '@edutrack/ui/components/spinner';
import { BellIcon, ChevronsUpDownIcon, LogOutIcon, ShieldCheckIcon, UserIcon } from '@lucide/vue';
import { useQueryClient } from '@tanstack/vue-query';
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { useLogoutMutation } from '@/api/services/auth';
import InitialsAvatar from '@edutrack/app-kit/components/common/InitialsAvatar.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const queryClient = useQueryClient();
const confirm = useConfirm();
const logout = useLogoutMutation();
const signingOut = ref(false);

const links = [
  { label: 'My profile', to: { name: routesPath.settings.profile.name }, icon: UserIcon },
  {
    label: 'Security & sessions',
    to: { name: routesPath.users.security.name, params: { id: auth.user?.id ?? 'u1' } },
    icon: ShieldCheckIcon,
  },
  {
    label: 'Notification settings',
    to: { name: routesPath.settings.notifications.name },
    icon: BellIcon,
  },
];

// Opened after the menu closes, so the dialog doesn't compete with the menu's focus handling.
const defer = (open: () => void) => setTimeout(open, 0);

async function finishSignOut(allDevices: boolean) {
  signingOut.value = true;
  try {
    await logout.mutateAsync(allDevices);
  } catch {
    // The session ends locally even if the server can't be reached.
  }
  auth.clear();
  await router.replace({ name: routesPath.auth.login.name });
  // Cleared after leaving the app shell, so mounted pages don't refetch on the way out.
  queryClient.clear();
  signingOut.value = false;
}

function signOut() {
  void confirm({
    title: 'Sign out of the Platform Back Office?',
    description:
      'You’ll return to the sign-in page. Nothing in progress on the platform is affected.',
    details: [
      ['Signed in as', auth.user?.email ?? ''],
      ['This device', 'Chrome on macOS · Lagos · since 08:14'],
      ['Other sessions', '1 · Safari on iPhone. Stays signed in'],
      ['Logged', 'Sign-out is recorded in the audit log'],
    ],
    confirmLabel: 'Sign out',
    tone: 'destructive',
    action: () => finishSignOut(false),
  });
}

function signOutEverywhere() {
  void confirm({
    title: 'Sign out of all devices?',
    description:
      'Every active session for your account ends now, including this one. Use this if you think someone else has access.',
    details: [
      ['Sessions ended', '2 · Chrome on macOS, Safari on iPhone'],
      ['Next sign-in', 'Password required on every device'],
    ],
    confirmLabel: 'Sign out everywhere',
    tone: 'destructive',
    action: () => finishSignOut(true),
  });
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger
      class="flex w-full items-center gap-2.5 rounded-lg border border-transparent p-2 text-left hover:border-border hover:bg-muted data-[state=open]:border-border data-[state=open]:bg-muted"
    >
      <span class="relative">
        <InitialsAvatar :initials="auth.initials" />
        <span
          title="Online"
          class="absolute -right-px -bottom-px size-2.5 rounded-full border-2 border-card bg-success"
        />
      </span>
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-[13px] font-medium">{{ auth.fullName }}</span>
        <span class="truncate text-xs text-faint">{{ auth.user?.roleName }}</span>
      </span>
      <ChevronsUpDownIcon class="size-4 text-faint" />
    </DropdownMenuTrigger>
    <DropdownMenuContent
      side="top"
      align="start"
      class="w-(--reka-dropdown-menu-trigger-width) min-w-56 overflow-hidden rounded-[10px] p-0"
    >
      <div class="flex items-center gap-2.5 bg-muted p-3.5">
        <InitialsAvatar :initials="auth.initials" solid />
        <div class="flex min-w-0 flex-col">
          <span class="text-[13px] font-semibold">{{ auth.fullName }}</span>
          <span class="truncate text-xs text-muted-foreground">{{ auth.user?.email }}</span>
          <span
            class="mt-1 self-start rounded-sm bg-brand-subtle px-1.5 py-0.5 text-[11px] font-medium text-brand-strong"
          >
            {{ auth.user?.roleName }}
          </span>
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
        <DropdownMenuItem
          class="h-8 pl-9 text-xs text-muted-foreground"
          @select="defer(signOutEverywhere)"
          >Sign out of all devices</DropdownMenuItem
        >
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
