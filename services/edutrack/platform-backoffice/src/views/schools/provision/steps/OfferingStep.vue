<script setup lang="ts">
import { cn } from '@edutrack/ui/lib/utils';
import {
  BabyIcon,
  BookOpenIcon,
  CheckIcon,
  FlaskConicalIcon,
  GraduationCapIcon,
} from '@lucide/vue';
import { useField } from 'vee-validate';

import type { AcademicSection } from '@/types';

const SECTIONS: {
  name: AcademicSection;
  description: string;
  color: string;
  tint: string;
  icon: typeof BabyIcon;
}[] = [
  {
    name: 'Nursery',
    description: 'Ages 2–5 · Creche, Pre-nursery, Nursery 1–3',
    color: '#F19E3F',
    tint: '#FDF0DF',
    icon: BabyIcon,
  },
  {
    name: 'Primary',
    description: 'Ages 6–11 · Primary 1–6',
    color: '#2E7D5B',
    tint: '#E7F2EC',
    icon: BookOpenIcon,
  },
  {
    name: 'Junior Secondary',
    description: 'Ages 12–14 · JSS 1–3',
    color: '#3B6FA8',
    tint: '#E9F0F8',
    icon: FlaskConicalIcon,
  },
  {
    name: 'Senior Secondary',
    description: 'Ages 15–17 · SSS 1–3 · WAEC/NECO',
    color: '#9B403C',
    tint: '#F6E7E4',
    icon: GraduationCapIcon,
  },
];

const { value: sections, errorMessage } = useField<AcademicSection[]>('sections');
const isOn = (name: AcademicSection) => (sections.value ?? []).includes(name);
function toggle(name: AcademicSection) {
  const current = sections.value ?? [];
  sections.value = isOn(name) ? current.filter((s) => s !== name) : [...current, name];
}
</script>

<template>
  <fieldset class="flex flex-col gap-3">
    <legend class="mb-3 font-semibold">Which sections does the school run?</legend>
    <div class="grid gap-2 sm:grid-cols-2">
      <label
        v-for="s in SECTIONS"
        :key="s.name"
        :class="
          cn(
            'relative flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-[background,border-color,box-shadow] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary',
          )
        "
        :style="
          isOn(s.name)
            ? { borderColor: s.color, background: s.tint, boxShadow: `0 0 0 1px ${s.color}` }
            : {}
        "
      >
        <input type="checkbox" class="sr-only" :checked="isOn(s.name)" @change="toggle(s.name)" />
        <span
          aria-hidden="true"
          class="flex size-11 shrink-0 items-center justify-center rounded-[10px] transition-colors"
          :style="{
            background: isOn(s.name) ? s.color : s.tint,
            color: isOn(s.name) ? '#fff' : s.color,
          }"
        >
          <component :is="s.icon" class="size-6" :stroke-width="1.7" />
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5 pr-5.5">
          <span class="text-sm font-semibold">{{ s.name }}</span>
          <span class="text-xs text-pretty text-muted-foreground">{{ s.description }}</span>
        </span>
        <span
          aria-hidden="true"
          class="absolute top-3 right-3 flex size-4.5 items-center justify-center rounded-full border-[1.5px] text-white"
          :style="{
            background: isOn(s.name) ? s.color : '#fff',
            borderColor: isOn(s.name) ? s.color : '#C9C3BA',
          }"
        >
          <CheckIcon v-if="isOn(s.name)" class="size-3" :stroke-width="3" />
        </span>
      </label>
    </div>
    <p v-if="errorMessage" role="alert" class="text-xs text-destructive">{{ errorMessage }}</p>
    <p class="text-xs text-muted-foreground">
      The school's Setup Center only shows steps for the sections chosen here.
    </p>
  </fieldset>
</template>
