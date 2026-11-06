<script setup lang="ts">
import { Switch } from '@edutrack/ui/components/switch';

export interface ToggleItem {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  disabled?: boolean;
}

defineProps<{ title: string; items: ToggleItem[] }>();
const emit = defineEmits<{ toggle: [key: string, enabled: boolean] }>();
</script>

<template>
  <section class="rounded-lg border bg-card py-1.5">
    <h2 class="px-4.5 py-2.5 text-[15px] font-semibold">{{ title }}</h2>
    <div
      v-for="item in items"
      :key="item.key"
      class="flex items-center gap-4 border-t border-divider px-4.5 py-2.5"
    >
      <div class="flex flex-1 flex-col text-[13px]">
        <span class="font-medium">{{ item.label }}</span>
        <span class="text-xs text-muted-foreground">{{ item.description }}</span>
      </div>
      <Switch
        :model-value="item.enabled"
        :disabled="item.disabled"
        :aria-label="item.label"
        @update:model-value="emit('toggle', item.key, $event)"
      />
    </div>
  </section>
</template>
