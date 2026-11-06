<script setup lang="ts">
import { Toaster } from '@edutrack/ui/components/sonner';
import { TooltipProvider } from '@edutrack/ui/components/tooltip';
import { RouterView } from 'vue-router';

import ConfirmDialogHost from '@edutrack/app-kit/components/overlays/ConfirmDialogHost.vue';
import SuccessDialogHost from '@edutrack/app-kit/components/overlays/SuccessDialogHost.vue';
</script>

<template>
  <TooltipProvider>
    <RouterView />
    <ConfirmDialogHost />
    <SuccessDialogHost />
    <Toaster position="bottom-center" :toast-options="{ class: 'toast-ink' }" />
  </TooltipProvider>
</template>
