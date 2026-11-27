<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorFields, getApiErrorMessage } from '@edutrack/web-core/http';
import { PlusIcon, Trash2Icon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useChecklistQuery, useSaveChecklistMutation } from '@/api/services/boarding-house';
import { useCan } from '@/composables/useCan';

/**
 * The property checklist boarders are checked in and out against each term: mattress,
 * bedsheets, bucket, provisions and so on.
 */
const { data, isPending, isError, refetch } = useChecklistQuery();
const save = useSaveChecklistMutation();
const can = useCan();

const items = ref<string[]>([]);
const savedText = ref('');
const error = ref('');
const showErrors = ref(false);
function reset() {
  items.value = (data.value ?? []).map((i) => i.name);
  savedText.value = JSON.stringify(items.value);
  error.value = '';
  showErrors.value = false;
}
watch(data, reset, { immediate: true });
watch(items, () => (error.value = ''), { deep: true });
const dirty = computed(() => JSON.stringify(items.value) !== savedText.value);

const problem = computed(() => {
  const names = items.value.map((s) => s.trim());
  if (!names.length) return 'Keep at least one item.';
  if (names.some((n) => !n)) return 'Name every item, or remove the empty one.';
  const lower = names.map((n) => n.toLowerCase());
  if (lower.some((n, i) => lower.indexOf(n) !== i)) return 'Each item can be on the list once.';
  return '';
});
const shown = computed(() => error.value || (showErrors.value ? problem.value : ''));

async function submit() {
  showErrors.value = true;
  if (problem.value) return;
  try {
    await save.mutateAsync(items.value.map((s) => s.trim()));
    toast.success('Property checklist saved.');
  } catch (e) {
    const fe = getApiErrorFields(e);
    error.value =
      fe.items ?? Object.values(fe)[0] ?? getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}
</script>

<template>
  <SectionCard
    title="Property checklist"
    description="What boarders bring. House staff tick it off at check-in and check-out each term."
  >
    <Skeleton v-if="isPending" class="h-40" />
    <InlineNotice
      v-else-if="isError"
      tone="error"
      title="The checklist couldn’t load"
      description="Check your connection and try again."
    >
      <template #action
        ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
      >
    </InlineNotice>
    <form v-else class="flex max-w-lg flex-col gap-3" novalidate @submit.prevent="submit">
      <InlineNotice v-if="shown" tone="error" :title="shown" role="alert" />
      <ol class="flex flex-col gap-2">
        <li v-for="(_, i) in items" :key="i" class="flex items-center gap-2">
          <span class="w-5 text-right text-xs text-faint tabular-nums">{{ i + 1 }}</span>
          <Input
            v-model="items[i]"
            maxlength="60"
            :aria-label="`Item ${i + 1}`"
            placeholder="e.g. Mosquito net"
            :readonly="!can('boarding.manage')"
          />
          <Button
            v-if="can('boarding.manage')"
            type="button"
            variant="ghost"
            size="icon"
            :aria-label="`Remove ${items[i] || `item ${i + 1}`}`"
            @click="items.splice(i, 1)"
            ><Trash2Icon
          /></Button>
        </li>
      </ol>
      <div v-if="can('boarding.manage')" class="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="items.length >= 40"
          @click="items.push('')"
          ><PlusIcon />Add item</Button
        >
        <div class="flex gap-2">
          <Button type="button" variant="ghost" :disabled="!dirty" @click="reset">Undo</Button>
          <Button type="submit" :disabled="!dirty || save.isPending.value"
            ><Spinner v-if="save.isPending.value" />Save checklist</Button
          >
        </div>
      </div>
    </form>
  </SectionCard>
</template>
