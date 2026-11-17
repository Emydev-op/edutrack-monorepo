<script setup lang="ts">
import logoWhite from '@edutrack/ui/assets/brand/logo-mark-white.svg';
import logoDuo from '@edutrack/ui/assets/brand/logo-mark-duo.svg';

defineProps<{ onBrand?: boolean }>();
</script>

<template>
  <p class="flex items-center gap-2 text-xs" :class="onBrand ? 'opacity-80' : 'text-faint'">
    <img :src="onBrand ? logoWhite : logoDuo" alt="" class="size-4" />
    Powered by Edutrack
  </p>
</template>
