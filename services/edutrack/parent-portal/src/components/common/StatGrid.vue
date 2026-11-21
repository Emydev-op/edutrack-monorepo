<script setup lang="ts">
/** Small figures in a row (Total · Paid · Outstanding). */
defineProps<{ items: { label: string; value: string; tone?: 'error' | 'success' }[] }>();
</script>

<template>
  <dl class="grid grid-cols-3 gap-2">
    <div
      v-for="x in items"
      :key="x.label"
      class="flex flex-col rounded-lg border bg-card px-3 py-2.5"
    >
      <dt class="text-[11px] text-faint">{{ x.label }}</dt>
      <dd
        class="text-[15px] font-semibold tabular-nums"
        :class="
          x.tone === 'error'
            ? 'text-error-strong'
            : x.tone === 'success'
              ? 'text-success-strong'
              : ''
        "
      >
        {{ x.value }}
      </dd>
    </div>
  </dl>
</template>
