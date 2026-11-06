<script setup lang="ts">
withDefaults(defineProps<{ min?: string }>(), { min: '300px' });
</script>

<template>
  <div class="grid gap-4" :style="{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))` }">
    <slot />
  </div>
</template>
