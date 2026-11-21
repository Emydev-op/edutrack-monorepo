<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@edutrack/ui/components/sheet';
import { Spinner } from '@edutrack/ui/components/spinner';
import { useQueryClient } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';

import { useLogoutMutation } from '@/api/services/auth';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

/** "Sign out of the student portal?" from Profile and More. */
const ui = useUiStore();
const auth = useAuthStore();
const router = useRouter();
const queries = useQueryClient();
const logout = useLogoutMutation();

async function signOut() {
  try {
    await logout.mutateAsync();
  } catch {
    // Signed out on this device even if the server can't be reached.
  }
  ui.signOutOpen = false;
  auth.clear();
  await router.replace({ name: routesPath.auth.login.name, query: { reason: 'signedout' } });
  queries.clear();
}
</script>

<template>
  <Sheet v-model:open="ui.signOutOpen">
    <SheetContent side="bottom" class="mx-auto max-w-lg rounded-t-2xl px-5 pt-5 pb-7">
      <SheetHeader class="p-0">
        <SheetTitle>Sign out of the student portal?</SheetTitle>
        <SheetDescription>
          On a shared or school computer, always sign out when you’re done. Your homework and
          results aren’t affected.
        </SheetDescription>
      </SheetHeader>
      <Button variant="destructive" size="lg" :disabled="logout.isPending.value" @click="signOut">
        <Spinner v-if="logout.isPending.value" /> Sign out
      </Button>
      <Button variant="outline" size="lg" @click="ui.signOutOpen = false">Cancel</Button>
    </SheetContent>
  </Sheet>
</template>
