<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { PlusIcon, XIcon } from '@lucide/vue';
import { useFieldArray, useFormErrors } from 'vee-validate';
import { computed, nextTick, ref } from 'vue';

const { fields, push, remove } = useFieldArray<{ name: string; address: string }>('branches');

const list = ref<HTMLElement>();
/** Adds an empty branch and puts the cursor in its name, ready to type. */
async function addBranch() {
  push({ name: '', address: '' });
  await nextTick();
  list.value
    ?.querySelectorAll<HTMLInputElement>('input[aria-label="Branch name"]')
    .item(fields.value.length - 1)
    ?.focus();
}
const errors = useFormErrors();
const branchError = (i: number) =>
  (errors.value as Record<string, string | undefined>)[`branches[${i}].name`];
const listError = computed(() => (errors.value as Record<string, string | undefined>).branches);
</script>

<template>
  <span class="font-semibold">Branches</span>
  <div ref="list" class="contents">
    <div v-for="(field, i) in fields" :key="field.key" class="flex flex-col gap-1">
      <div class="grid grid-cols-[1fr_2fr_auto] gap-2.5">
        <Input
          v-model="field.value.name"
          aria-label="Branch name"
          placeholder="Main Campus"
          class="bg-card"
          :aria-invalid="!!branchError(i)"
        />
        <Input
          v-model="field.value.address"
          aria-label="Branch address"
          placeholder="14 Adeniyi Jones Avenue, Ikeja"
          class="bg-card"
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
      <p v-if="branchError(i)" role="alert" class="text-xs text-destructive">
        {{ branchError(i) }}
      </p>
    </div>
  </div>
  <p v-if="listError" role="alert" class="text-xs text-destructive">{{ listError }}</p>
  <Button variant="outline" size="sm" class="self-start" @click="addBranch">
    <PlusIcon /> Add branch
  </Button>
</template>
