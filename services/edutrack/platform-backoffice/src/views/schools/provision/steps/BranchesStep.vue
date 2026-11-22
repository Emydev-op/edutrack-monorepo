<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { CheckIcon, PlusIcon, XIcon } from '@lucide/vue';
import { useFieldArray, useFormErrors } from 'vee-validate';
import { computed, nextTick, ref } from 'vue';

import type { AcademicSection } from '@/types';

type BranchRow = { name: string; address: string; sections: AcademicSection[] };

/** The four sections a campus can run, with their colours. */
const SECTIONS: { name: AcademicSection; hint: string; color: string; tint: string }[] = [
  { name: 'Nursery', hint: 'Creche – Nursery 3', color: '#F19E3F', tint: '#FDF0DF' },
  { name: 'Primary', hint: 'Primary 1–6', color: '#2E7D5B', tint: '#E7F2EC' },
  { name: 'Junior Secondary', hint: 'JSS 1–3', color: '#3B6FA8', tint: '#E9F0F8' },
  { name: 'Senior Secondary', hint: 'SSS 1–3', color: '#9B403C', tint: '#F6E7E4' },
];

const { fields, push, remove } = useFieldArray<BranchRow>('branches');

const list = ref<HTMLElement>();
/** Adds a branch running what the last one runs, with the cursor in its name, ready to type. */
async function addBranch() {
  const last = fields.value.at(-1)?.value.sections ?? [];
  push({ name: '', address: '', sections: [...last] });
  await nextTick();
  list.value
    ?.querySelectorAll<HTMLInputElement>('input[aria-label="Branch name"]')
    .item(fields.value.length - 1)
    ?.focus();
}
function toggle(row: BranchRow, name: AcademicSection) {
  const on = row.sections ?? [];
  row.sections = on.includes(name)
    ? on.filter((s) => s !== name)
    : SECTIONS.map((s) => s.name).filter((s) => s === name || on.includes(s));
}
const errors = useFormErrors();
const err = (key: string) => (errors.value as Record<string, string | undefined>)[key];
const listError = computed(() => err('branches'));
/** The school's sections: every branch's together. */
const offering = computed(() =>
  SECTIONS.filter((s) => fields.value.some((f) => f.value.sections?.includes(s.name))).map(
    (s) => s.name,
  ),
);
</script>

<template>
  <div class="flex flex-col gap-1">
    <span class="font-semibold">Branches and what each runs</span>
    <p class="text-xs text-muted-foreground">
      Each campus chooses its own sections, e.g. Main Campus for Junior and Senior Secondary and a
      second campus for Nursery and Primary. Classes, staff and the Setup Center follow each branch.
    </p>
  </div>
  <div ref="list" class="contents">
    <div
      v-for="(field, i) in fields"
      :key="field.key"
      class="flex flex-col gap-2.5 rounded-lg border bg-card p-3"
    >
      <div class="grid grid-cols-[1fr_2fr_auto] gap-2.5">
        <Input
          v-model="field.value.name"
          aria-label="Branch name"
          placeholder="Main Campus"
          :aria-invalid="!!err(`branches[${i}].name`)"
        />
        <Input
          v-model="field.value.address"
          aria-label="Branch address"
          placeholder="14 Adeniyi Jones Avenue, Ikeja"
        />
        <Button
          variant="ghost"
          size="icon"
          :disabled="fields.length === 1"
          :aria-label="`Remove ${field.value.name || 'branch'}`"
          @click="remove(i)"
        >
          <XIcon />
        </Button>
      </div>
      <p v-if="err(`branches[${i}].name`)" role="alert" class="text-xs text-destructive">
        {{ err(`branches[${i}].name`) }}
      </p>
      <fieldset class="flex flex-col gap-1.5">
        <legend class="mb-1 text-xs font-medium text-muted-foreground">
          {{ field.value.name || 'This branch' }} runs
        </legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="s in SECTIONS"
            :key="s.name"
            class="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
            :style="
              field.value.sections?.includes(s.name)
                ? { borderColor: s.color, background: s.tint, color: s.color }
                : {}
            "
            :title="s.hint"
          >
            <input
              type="checkbox"
              class="sr-only"
              :checked="field.value.sections?.includes(s.name)"
              :aria-label="`${field.value.name || 'Branch'} runs ${s.name}`"
              @change="toggle(field.value, s.name)"
            />
            <CheckIcon
              v-if="field.value.sections?.includes(s.name)"
              class="size-3.5"
              :stroke-width="3"
            />
            {{ s.name }}
          </label>
        </div>
        <p v-if="err(`branches[${i}].sections`)" role="alert" class="text-xs text-destructive">
          {{ err(`branches[${i}].sections`) }}
        </p>
      </fieldset>
    </div>
  </div>
  <p v-if="listError" role="alert" class="text-xs text-destructive">{{ listError }}</p>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <Button variant="outline" size="sm" @click="addBranch"><PlusIcon /> Add branch</Button>
    <p v-if="offering.length" class="text-xs text-muted-foreground">
      The school runs {{ offering.join(', ') }}.
    </p>
  </div>
</template>
