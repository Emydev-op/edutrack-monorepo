<script setup lang="ts">
import { CheckIcon } from '@lucide/vue';
import { useField } from 'vee-validate';
import { computed } from 'vue';

import { BRAND_PALETTE, contrastWithWhite, isHexColor, paletteName } from '@/lib/brand-color';
import { initials } from '@edutrack/app-kit/lib/format';

const props = defineProps<{ schoolName: string }>();
const { value: color, errorMessage } = useField<string>('brandColor');

const valid = computed(() => isHexColor(color.value ?? ''));
const safe = computed(() => (valid.value ? color.value : '#E7E3DC'));
const ratio = computed(() => contrastWithWhite(color.value ?? ''));
const ratioLabel = computed(() =>
  valid.value
    ? `${ratio.value.toFixed(1)}:1 contrast with white text · ${ratio.value >= 4.5 ? 'passes' : 'too low'}`
    : 'Enter a valid hex',
);
const isSelected = (hex: string) => (color.value ?? '').toLowerCase() === hex.toLowerCase();
</script>

<template>
  <div class="flex flex-col gap-3 border-t border-divider pt-4">
    <div class="flex flex-col gap-0.5">
      <span class="font-semibold">School brand color</span>
      <span class="text-xs text-muted-foreground">
        Themes the school’s workspace and the teacher, parent and student portals. Only EduTrack can
        change it later.
      </span>
    </div>
    <div class="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(220px,260px)]">
      <div class="flex flex-col gap-3">
        <div role="radiogroup" aria-label="Brand color" class="flex flex-wrap gap-2.5">
          <button
            v-for="c in BRAND_PALETTE"
            :key="c.hex"
            type="button"
            role="radio"
            :aria-checked="isSelected(c.hex)"
            :aria-label="c.name"
            :title="`${c.name} · ${c.hex}`"
            class="flex size-10 items-center justify-center rounded-full text-white transition-transform hover:scale-110"
            :style="{
              background: c.hex,
              boxShadow: isSelected(c.hex)
                ? `0 0 0 2px #fff, 0 0 0 4px ${c.hex}`
                : 'inset 0 0 0 1px rgb(0 0 0 / 0.08)',
            }"
            @click="color = c.hex"
          >
            <CheckIcon v-if="isSelected(c.hex)" class="size-4" :stroke-width="3" />
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-2.5">
          <label
            title="Pick a custom color"
            class="relative size-10 cursor-pointer overflow-hidden rounded-lg border"
            style="background: conic-gradient(#c4473f, #f19e3f, #2e7d5b, #3b6fa8, #7a2e62, #c4473f)"
          >
            <input
              type="color"
              :value="safe"
              aria-label="Custom color"
              class="absolute inset-0 cursor-pointer opacity-0"
              @input="color = ($event.target as HTMLInputElement).value"
            />
          </label>
          <label class="flex flex-col gap-1 text-xs text-muted-foreground">
            Hex
            <input
              :value="(color ?? '').toUpperCase()"
              maxlength="7"
              placeholder="#24497A"
              class="h-9 w-30 rounded-sm border bg-card px-2.5 font-mono text-[13px] text-foreground focus:border-ring aria-invalid:border-destructive"
              :aria-invalid="!!errorMessage"
              @input="color = ($event.target as HTMLInputElement).value"
            />
          </label>
          <span class="text-xs text-muted-foreground"
            >{{ paletteName(color ?? '') }} · {{ ratioLabel }}</span
          >
        </div>
        <p v-if="errorMessage" role="alert" class="text-xs text-destructive">{{ errorMessage }}</p>
      </div>
      <div aria-label="Theme preview" class="overflow-hidden rounded-lg border text-xs">
        <div class="flex items-center gap-2 px-3 py-2.5 text-white" :style="{ background: safe }">
          <span
            class="flex size-6 items-center justify-center rounded-[5px] bg-white/20 text-[11px] font-semibold"
            >{{ initials(props.schoolName || 'School') }}</span
          >
          <span class="text-[13px] font-semibold">{{ props.schoolName || 'School name' }}</span>
        </div>
        <div class="flex flex-col gap-2 bg-card p-3">
          <span class="text-muted-foreground">Parent Portal · sign in</span>
          <span
            class="flex h-7.5 items-center justify-center rounded-[5px] font-medium text-white"
            :style="{ background: safe }"
            >Sign in</span
          >
          <span class="font-medium" :style="{ color: safe }">Forgot password?</span>
        </div>
      </div>
    </div>
  </div>
</template>
