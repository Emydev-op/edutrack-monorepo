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
import { useChildrenStore } from '@/stores/children';
import { useUiStore } from '@/stores/ui';

/** "Sign out of the parent portal?" from Profile and More. */
const ui = useUiStore();
const auth = useAuthStore();
const children = useChildrenStore();
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
  children.clear();
  await router.replace({ name: routesPath.auth.login.name, query: { reason: 'signedout' } });
  queries.clear();
}
</script>

<template>
  <Sheet v-model:open="ui.signOutOpen">
    <SheetContent side="bottom" class="mx-auto max-w-lg rounded-t-2xl px-5 pt-5 pb-7">
      <SheetHeader class="p-0">
        <SheetTitle>Sign out of the parent portal?</SheetTitle>
        <SheetDescription>
          You’ll stop getting in-app alerts on this device. Email and SMS messages from the school
          still arrive. Your children’s records aren’t affected.
        </SheetDescription>
      </SheetHeader>
      <Button variant="destructive" size="lg" :disabled="logout.isPending.value" @click="signOut">
        <Spinner v-if="logout.isPending.value" /> Sign out
      </Button>
      <Button variant="outline" size="lg" @click="ui.signOutOpen = false">Cancel</Button>
    </SheetContent>
  </Sheet>
</template>
