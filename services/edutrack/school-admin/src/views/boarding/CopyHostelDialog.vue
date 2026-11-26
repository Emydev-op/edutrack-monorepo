<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@edutrack/ui/components/dialog';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorFields, getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { pluralize } from '@edutrack/app-kit/lib/format';

import { useCopyHostelMutation } from '@/api/services/boarding';
import type { Hostel, HostelGender } from '@/types';

import { GENDERS } from './boarding-format';

/** Copies a hostel's layout (floors and rooms, no house staff) into a new hostel. */
const props = defineProps<{ hostel: Hostel | null }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ copied: [hostel: Hostel] }>();

const copy = useCopyHostelMutation();
const form = reactive({ name: '', gender: 'Boys' as HostelGender });
const fields = ref<Record<string, string>>({});
const serverError = ref('');
const showErrors = ref(false);

watch(
  open,
  (o) => {
    if (!o || !props.hostel) return;
    form.name = `${props.hostel.name} (copy)`;
    form.gender = props.hostel.gender;
    fields.value = {};
    serverError.value = '';
    showErrors.value = false;
  },
  { immediate: true },
);
watch(form, () => (fields.value = {}));

const errors = computed(() => {
  const e: Record<string, string> = { ...fields.value };
  if (!form.name.trim()) e.name ??= 'Name the new hostel.';
  return e;
});
const err = (k: string) => (showErrors.value || fields.value[k] ? errors.value[k] : undefined);

async function submit() {
  showErrors.value = true;
  serverError.value = '';
  if (Object.keys(errors.value).length || !props.hostel) return;
  try {
    const result = await copy.mutateAsync({
      id: props.hostel.id,
      name: form.name.trim(),
      gender: form.gender,
    });
    toast.success(messageOf(result, `${result.name} added with ${props.hostel.name}’s layout.`));
    open.value = false;
    emit('copied', result);
  } catch (e) {
    const fe = getApiErrorFields(e);
    if (Object.keys(fe).length) return void (fields.value = fe);
    serverError.value = getApiErrorMessage(e, 'The hostel wasn’t copied. Try again.');
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent v-if="hostel" class="flex flex-col gap-4 sm:max-w-[460px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">Copy {{ hostel.name }}’s layout</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          The new hostel gets the same
          {{ hostel.totals.floors ? `${pluralize(hostel.totals.floors, 'floor')}, ` : ''
          }}{{ pluralize(hostel.totals.rooms, 'room') }} and bed labels at {{ hostel.campus }}.
          House staff aren’t copied.
        </DialogDescription>
      </div>
      <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Not copied"
          :description="serverError"
          role="alert"
        />
        <FieldShell id="copy-name" label="New hostel name" required :error="err('name')">
          <Input id="copy-name" v-model="form.name" maxlength="80" :aria-invalid="!!err('name')" />
        </FieldShell>
        <FieldShell id="copy-gender" label="Who stays here" :error="err('gender')">
          <div id="copy-gender" class="flex gap-2" role="radiogroup" aria-label="Who stays here">
            <button
              v-for="g in GENDERS"
              :key="g"
              type="button"
              role="radio"
              :aria-checked="form.gender === g"
              class="flex-1 rounded-md border px-3 py-1.5 text-sm"
              :class="
                form.gender === g
                  ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
                  : 'bg-card hover:border-primary'
              "
              @click="form.gender = g"
            >
              {{ g }}
            </button>
          </div>
        </FieldShell>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="copy.isPending.value"
            ><Spinner v-if="copy.isPending.value" />Copy layout</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
