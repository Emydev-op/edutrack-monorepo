<script setup lang="ts">
defineProps<{ title: string; sub?: string | null }>();
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <h1 class="text-xl font-semibold text-balance">{{ title }}</h1>
    <p v-if="sub" class="text-[13px] text-muted-foreground">{{ sub }}</p>
  </div>
</template>
