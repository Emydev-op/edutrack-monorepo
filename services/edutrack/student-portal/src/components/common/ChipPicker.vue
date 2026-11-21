<script setup lang="ts">
/** Round chips to pick one option (terms on Results and Attendance, days on Timetable). */
defineProps<{ options: { value: string; label: string }[]; label: string }>();
const model = defineModel<string | undefined>();
</script>

<template>
  <div role="radiogroup" :aria-label="label" class="flex flex-wrap gap-1.5">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="radio"
      :aria-checked="model === o.value"
      class="h-9 rounded-full border px-3 text-[13px] transition-colors"
      :class="
        model === o.value
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-card hover:bg-muted'
      "
      @click="model = o.value"
    >
      {{ o.label }}
    </button>
  </div>
</template>
