<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { PlusIcon, Trash2Icon } from '@lucide/vue';
import { useFieldArray, useFormErrors, useFormValues } from 'vee-validate';
import { computed, nextTick, ref } from 'vue';

import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormSelect from '@edutrack/app-kit/components/form/FormSelect.vue';
import { ALL_BRANCHES, MAX_ADMINS, OTHER_POSITION, SCHOOL_POSITIONS } from '@/schema/school';

interface AdminRow {
  name: string;
  email: string;
  phone: string;
  position: string;
  positionOther: string;
  scope: string;
}

const { fields, push, remove } = useFieldArray<AdminRow>('admins');
const values = useFormValues<{ branches: { name: string }[] }>();
const errors = useFormErrors();

const scopeOptions = computed(() => [
  { value: ALL_BRANCHES, label: 'All branches (school-wide)' },
  ...(values.value.branches ?? [])
    .map((b) => b.name.trim())
    .filter(Boolean)
    .map((name) => ({ value: name, label: `${name} only` })),
]);
// Errors that belong to the list as a whole (unique emails, a school-wide admin, …).
const listError = computed(() => (errors.value as Record<string, string | undefined>).admins);

const list = ref<HTMLElement>();
async function addAdmin() {
  push({
    name: '',
    email: '',
    phone: '',
    position: 'School Administrator',
    positionOther: '',
    scope: ALL_BRANCHES,
  });
  await nextTick();
  list.value
    ?.querySelectorAll<HTMLElement>('[data-admin]')
    .item(fields.value.length - 1)
    ?.querySelector('input')
    ?.focus();
}
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <span class="font-semibold">School administrators</span>
    <span class="text-xs text-muted-foreground">
      Each administrator receives their own invitation. Give school-wide access to whoever runs
      setup and billing, and limit others to the branch they manage.
    </span>
  </div>

  <div ref="list" class="flex flex-col gap-3">
    <section
      v-for="(field, i) in fields"
      :key="field.key"
      data-admin
      :aria-label="`Administrator ${i + 1}`"
      class="flex flex-col gap-3.5 rounded-lg border p-4"
    >
      <header class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="text-[13px] font-semibold">Administrator {{ i + 1 }}</span>
          <StatusBadge
            v-if="field.value.scope === ALL_BRANCHES"
            label="School-wide"
            tone="brand"
            :dot="false"
          />
          <StatusBadge v-else :label="`${field.value.scope} only`" tone="neutral" :dot="false" />
        </div>
        <Button
          v-if="fields.length > 1"
          variant="ghost"
          size="sm"
          class="text-destructive hover:bg-error-subtle hover:text-destructive"
          :aria-label="`Remove administrator ${i + 1}`"
          @click="remove(i)"
        >
          <Trash2Icon /> Remove
        </Button>
      </header>
      <div class="grid gap-3.5 sm:grid-cols-2">
        <FormInput
          :name="`admins[${i}].name`"
          label="Full name"
          required
          placeholder="Osegbo Emeka"
          autocomplete="off"
        />
        <FormInput
          :name="`admins[${i}].email`"
          label="Email"
          type="email"
          required
          placeholder="e.osegbo@crestviewcollege.ng"
          hint="The invitation is sent here."
          autocomplete="off"
        />
        <FormInput
          :name="`admins[${i}].phone`"
          label="Phone"
          type="tel"
          placeholder="0809 555 0177"
          autocomplete="off"
        />
        <FormSelect
          :name="`admins[${i}].position`"
          label="Position"
          :options="SCHOOL_POSITIONS"
          required
        />
        <FormInput
          v-if="field.value.position === OTHER_POSITION"
          :name="`admins[${i}].positionOther`"
          label="Position title"
          required
          placeholder="Director of Studies"
        />
        <FormSelect
          :name="`admins[${i}].scope`"
          label="Manages"
          :options="scopeOptions"
          required
          :hint="
            field.value.scope === ALL_BRANCHES
              ? 'Every branch, plus school-wide setup and billing.'
              : 'Only this branch’s staff, students and records.'
          "
        />
      </div>
    </section>
  </div>

  <p
    v-if="listError"
    role="alert"
    class="rounded-md bg-error-subtle px-3 py-2.5 text-[13px] text-error-strong"
  >
    {{ listError }}
  </p>

  <div class="flex items-center gap-3">
    <Button variant="outline" size="sm" :disabled="fields.length >= MAX_ADMINS" @click="addAdmin">
      <PlusIcon /> Add another administrator
    </Button>
    <span class="text-xs text-faint">{{ fields.length }} of {{ MAX_ADMINS }}</span>
  </div>
</template>
