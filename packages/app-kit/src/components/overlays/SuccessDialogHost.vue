<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@edutrack/ui/components/dialog';
import { CheckIcon } from '@lucide/vue';
import { RouterLink } from 'vue-router';

import { useSuccessDialog } from '@edutrack/app-kit/composables/useSuccessDialog';

const { current, close } = useSuccessDialog();
</script>

<template>
  <Dialog :open="!!current" @update:open="(open) => !open && close()">
    <DialogContent
      v-if="current"
      class="w-[400px] max-w-[calc(100%-2rem)] items-center gap-2.5 rounded-xl px-6 pt-7 pb-5 text-center sm:max-w-[400px]"
      :show-close-button="false"
    >
      <span
        aria-hidden="true"
        class="mx-auto flex size-13 items-center justify-center rounded-full bg-success-subtle text-success"
      >
        <CheckIcon class="size-6.5" :stroke-width="2.4" />
      </span>
      <DialogTitle class="mt-1 text-lg font-semibold">{{ current.title }}</DialogTitle>
      <DialogDescription class="text-[13px] text-pretty text-muted-foreground">{{
        current.description
      }}</DialogDescription>
      <div class="mt-2.5 flex w-full gap-2">
        <Button v-if="current.secondary" as-child variant="outline" class="flex-1">
          <RouterLink :to="current.secondary.to" @click="close">{{
            current.secondary.label
          }}</RouterLink>
        </Button>
        <Button as-child class="flex-1">
          <RouterLink :to="current.primary.to" @click="close">{{
            current.primary.label
          }}</RouterLink>
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
