<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';

import { useSaveNumberingMutation, useSchoolSettingsQuery } from '@/api/services/settings';
import { formatNumber, patternProblem } from '@/lib/numbering';
import { routesPath } from '@/router/routes-path';
import type { NumberingKind } from '@/types';

import { supportLink, useSettingsDirtyGuard } from '../settings-shared';

const { data, isPending, isError, refetch } = useSchoolSettingsQuery();
const save = useSaveNumberingMutation();

const form = reactive<Record<NumberingKind, string>>({ admission: '', staff: '' });
const saved = computed(() =>
  Object.fromEntries((data.value?.numbering ?? []).map((n) => [n.kind, n.pattern])),
);
watch(
  () => data.value?.numbering,
  (list) => list?.forEach((n) => (form[n.kind] = n.pattern)),
  { immediate: true },
);
const dirty = computed(
  () => !!data.value && (['admission', 'staff'] as const).some((k) => form[k] !== saved.value[k]),
);
useSettingsDirtyGuard(dirty);

const serverError = ref('');
const errors = computed(() => {
  const e: Partial<Record<NumberingKind, string>> = {};
  for (const k of ['admission', 'staff'] as const) {
    const p = patternProblem(form[k]);
    if (p) e[k] = p;
  }
  if (!e.admission && !e.staff) {
    const plain = (s: string) => s.replace(/\[[^\]]*\]/g, '');
    if (plain(form.admission) === plain(form.staff))
      e.staff = 'Use a different prefix from admission numbers.';
  }
  return e;
});
const preview = (kind: NumberingKind) => {
  const n = data.value?.numbering.find((x) => x.kind === kind);
  return n && !errors.value[kind] ? formatNumber(form[kind], n.nextSeq) : '—';
};

function onInput(kind: NumberingKind, value: string | number) {
  form[kind] = String(value).toUpperCase();
  serverError.value = '';
}

async function submit() {
  if (Object.keys(errors.value).length) return;
  serverError.value = '';
  try {
    await save.mutateAsync({ admission: form.admission, staff: form.staff });
    toast.success('Numbering formats saved. New records use them from now on.');
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}

function reset() {
  for (const k of ['admission', 'staff'] as const) form[k] = saved.value[k] ?? '';
  serverError.value = '';
}

const HINTS: Record<NumberingKind, string> = {
  admission: 'Given when a student is admitted or imported.',
  staff: 'Given when a staff record is created.',
};
</script>

<template>
  <div v-if="isPending" class="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
    <Skeleton class="h-48 w-full" /><Skeleton class="h-48 w-full" />
  </div>
  <InlineNotice
    v-else-if="isError || !data"
    tone="error"
    title="School settings couldn’t load"
    description="Check your connection and try again."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>
  <div v-else class="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] [&>*]:min-w-0">
    <SectionCard
      title="Numbering"
      description="How new admission numbers and staff IDs are written. Existing numbers never change."
    >
      <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <div
          v-for="n in data.numbering"
          :key="n.kind"
          class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)] [&>*]:min-w-0"
        >
          <FieldShell
            :id="`numbering-${n.kind}`"
            :label="n.label"
            required
            :hint="HINTS[n.kind]"
            :error="errors[n.kind]"
          >
            <Input
              :id="`numbering-${n.kind}`"
              :model-value="form[n.kind]"
              :placeholder="n.kind === 'admission' ? 'STU-[YYYY]-[####]' : 'GFA-ST-[####]'"
              autocomplete="off"
              spellcheck="false"
              class="font-mono"
              :aria-invalid="!!errors[n.kind]"
              @update:model-value="onInput(n.kind, $event)"
            />
          </FieldShell>
          <div class="flex flex-col gap-1.5 text-[13px]">
            <span class="font-medium">Next number</span>
            <span
              class="flex h-9 items-center rounded-md border border-dashed bg-muted px-3 font-mono text-sm"
              aria-live="polite"
              >{{ preview(n.kind) }}</span
            >
          </div>
        </div>
        <p class="text-xs text-muted-foreground">
          Codes: <code class="font-mono">[YYYY]</code> year,
          <code class="font-mono">[YY]</code> short year,
          <code class="font-mono">[####]</code> running number (3 to 6 #s set the digits).
        </p>
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Not saved"
          :description="serverError"
        />
        <div class="flex flex-wrap gap-2">
          <Button
            type="submit"
            :disabled="!dirty || save.isPending.value || !!Object.keys(errors).length"
          >
            <Spinner v-if="save.isPending.value" /> Save formats
          </Button>
          <Button v-if="dirty" type="button" variant="outline" @click="reset"
            >Discard changes</Button
          >
        </div>
      </form>
    </SectionCard>

    <div class="flex flex-col gap-4">
      <KeyValueCard
        title="Localisation"
        :rows="[
          { label: 'Country', value: data.localisation.country },
          { label: 'Currency', value: data.localisation.currency },
          { label: 'Timezone', value: data.localisation.timezone },
          { label: 'Date format', value: data.localisation.dateFormat },
          { label: 'Address format', value: data.localisation.addressFormat },
        ]"
        footer="Set by Edutrack for schools in Nigeria."
      >
        <template #action>
          <RouterLink
            :to="supportLink('Account & billing', 'Change our regional settings')"
            class="text-xs font-medium text-primary hover:underline"
            >Request a change</RouterLink
          >
        </template>
      </KeyValueCard>

      <KeyValueCard
        title="Finance numbering"
        :rows="[
          { label: 'Invoices', value: `${data.invoicePrefix}-[YYYY]-[####]` },
          { label: 'Receipts', value: `${data.receiptPrefix}-[YYYY]-[####]` },
        ]"
      >
        <template #action>
          <RouterLink
            :to="{ name: routesPath.finance.fees.name, query: { tab: 'settings' } }"
            class="text-xs font-medium text-primary hover:underline"
            >Billing settings</RouterLink
          >
        </template>
      </KeyValueCard>

      <section class="flex flex-col gap-2 rounded-lg border bg-card px-4.5 py-4">
        <header class="flex items-center justify-between gap-2">
          <h2 class="text-[15px] font-semibold">Setup Center</h2>
          <StatusBadge
            :label="data.setup.finished ? 'Completed' : 'In progress'"
            :tone="data.setup.finished ? 'success' : 'warning'"
          />
        </header>
        <p class="text-[13px] text-muted-foreground">
          {{
            data.setup.finished
              ? 'Setup is finished. You can still revisit any step.'
              : `${data.setup.done} of ${data.setup.total} steps done.`
          }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" as-child>
            <RouterLink :to="{ name: routesPath.setup.name }">Open Setup Center</RouterLink>
          </Button>
          <Button variant="outline" size="sm" as-child>
            <RouterLink :to="{ name: routesPath.school.profile.name }">School profile</RouterLink>
          </Button>
        </div>
      </section>
    </div>
  </div>
</template>
