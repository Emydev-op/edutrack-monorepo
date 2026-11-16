<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ initials: string; logoUrl: string | null }>();

// The logo link is short-lived; if it fails to load, the initials take its place.
const logoFailed = ref(false);
watch(
  () => props.logoUrl,
  () => (logoFailed.value = false),
);
</script>

<template>
  <span
    class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-[0_6px_20px_rgb(0_0_0/0.18)] sm:size-20"
    :class="logoUrl && !logoFailed ? 'bg-white p-2' : 'bg-[#FFF8EE] text-brand-strong'"
  >
    <img
      v-if="logoUrl && !logoFailed"
      :src="logoUrl"
      alt=""
      class="max-h-full max-w-full object-contain"
      @error="logoFailed = true"
    />
    <span v-else class="text-2xl font-semibold tracking-wide sm:text-[28px]">{{ initials }}</span>
  </span>
</template>
