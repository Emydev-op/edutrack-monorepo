<script setup lang="ts">
defineProps<{ title: string; description?: string; centered?: boolean }>();
</script>

<template>
  <div class="flex flex-col gap-1" :class="centered && 'text-center'">
    <h1 class="text-2xl font-semibold text-balance">{{ title }}</h1>
    <p v-if="description" class="text-[13px] text-pretty text-muted-foreground">
      {{ description }}
    </p>
  </div>
</template>
