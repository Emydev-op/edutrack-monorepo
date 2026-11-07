<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Spinner } from '@edutrack/ui/components/spinner';
import { cn } from '@edutrack/ui/lib/utils';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import StepIndicator from '@edutrack/app-kit/components/common/StepIndicator.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useFinanceOptionsQuery,
  useGenerateInvoicesMutation,
  useGeneratePreviewMutation,
} from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { GeneratePreview } from '@/types';

import { fmtDay } from '../finance-tones';

const r = routesPath.finance;
const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const context = useContextStore();
const { data: options } = useFinanceOptionsQuery();
const previewMut = useGeneratePreviewMutation();
const generate = useGenerateInvoicesMutation();

const step = ref(0);
const termId = ref('');
const branchId = ref('');
const levels = ref<string[]>([]);
const mode = ref<string>('draft');
const preview = ref<GeneratePreview | null>(null);

watch(
  options,
  (o) => {
    if (!o || termId.value) return;
    termId.value = (route.query.term as string) || o.currentTermId || o.terms[0]?.id || '';
    const ctx = o.branches.find((b) => b.name === context.current.branch);
    branchId.value = context.current.branch === 'All branches' ? '' : (ctx?.id ?? '');
  },
  { immediate: true },
);

/** Terms of the current and upcoming sessions, newest last. */
const terms = computed(() =>
  (options.value?.terms ?? []).filter(
    (t) => ['Active', 'Upcoming'].includes(t.status) || t.id === termId.value,
  ),
);
const allLevels = computed(() => options.value?.levels ?? []);
const toggleLevel = (l: string) =>
  (levels.value = levels.value.includes(l)
    ? levels.value.filter((x) => x !== l)
    : [...levels.value, l]);

const payload = computed(() => ({
  termId: termId.value,
  branchId: branchId.value || undefined,
  levels: levels.value.length ? levels.value : undefined,
  issue: mode.value === 'issue',
}));

async function runPreview() {
  try {
    preview.value = await previewMut.mutateAsync(payload.value);
    step.value = 1;
  } catch (e) {
    toast.error((e as Error).message);
  }
}

const discounted = computed(() => preview.value?.total ?? 0);
const before = computed(() => discounted.value + (preview.value?.discounts ?? 0));

function create() {
  const p = preview.value!;
  void confirm({
    title:
      mode.value === 'issue'
        ? `Issue ${p.toCreate} ${p.term.name} invoices?`
        : `Create ${p.toCreate} ${p.term.name} draft invoices?`,
    details: [
      ['Students', `${p.toCreate}`],
      ['Total', formatNaira(p.total)],
      ['Due', fmtDay(p.due)],
      [
        'What happens',
        mode.value === 'issue'
          ? `Fee payers are notified by SMS and email${p.noGuardian ? `; ${p.noGuardian} have no guardian to notify` : ''}.`
          : 'Drafts stay private until you issue them from Invoices.',
      ],
      ['Reversible', 'Invoices can be cancelled one by one, never deleted'],
    ],
    confirmLabel: mode.value === 'issue' ? 'Issue invoices' : 'Create drafts',
    action: async () => {
      const res = await generate.mutateAsync(payload.value);
      toast.success(
        mode.value === 'issue'
          ? `${res.issued} invoices issued · ${res.notified} fee payers notified.`
          : `${res.created} draft invoices created.`,
      );
      await router.push({
        name: r.invoices.name,
        query: { term: p.term.id, ...(mode.value === 'draft' && { status: 'Draft' }) },
      });
    },
  });
}

const branchName = computed(
  () => options.value?.branches.find((b) => b.id === branchId.value)?.name ?? 'All branches',
);
</script>

<template>
  <PageHeader
    title="Generate invoices"
    description="Bill students from the published fee structure. Students who already have an invoice for the term are skipped."
  />
  <StepIndicator :steps="['Choose students', 'Preview and create']" :current="step" />

  <SectionCard v-if="step === 0" title="Who to bill" class="max-w-3xl">
    <div class="flex flex-col gap-4">
      <div class="grid gap-3 sm:grid-cols-2">
        <FieldShell id="gen-term" label="Term" required>
          <select
            id="gen-term"
            v-model="termId"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
          >
            <option v-for="t in terms" :key="t.id" :value="t.id">
              {{ t.session }} · {{ t.name }}{{ t.status === 'Upcoming' ? ' (upcoming)' : '' }}
            </option>
          </select>
        </FieldShell>
        <FieldShell id="gen-branch" label="Branch">
          <select
            id="gen-branch"
            v-model="branchId"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
          >
            <option value="">All branches</option>
            <option v-for="b in options?.branches ?? []" :key="b.id" :value="b.id">
              {{ b.name }}
            </option>
          </select>
        </FieldShell>
      </div>
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-[13px] font-medium">
          Classes
          <span class="font-normal text-muted-foreground">· none ticked means every class</span>
        </legend>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label
            v-for="l in allLevels"
            :key="l"
            class="flex items-center gap-2 rounded-md border px-2.5 py-2 text-[13px]"
          >
            <Checkbox :model-value="levels.includes(l)" @update:model-value="toggleLevel(l)" />
            {{ l }}
          </label>
        </div>
      </fieldset>
      <div class="flex justify-end gap-2">
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: r.invoices.name }">Cancel</RouterLink></Button
        >
        <Button :disabled="!termId || previewMut.isPending.value" @click="runPreview">
          <Spinner v-if="previewMut.isPending.value" /> Preview
        </Button>
      </div>
    </div>
  </SectionCard>

  <template v-else-if="preview">
    <InlineNotice
      v-if="preview.missingStructures.length"
      tone="error"
      title="Some classes have no published fees"
      :description="`${preview.missingStructures.join(', ')}. Their students are skipped until fees are published.`"
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink
            :to="{
              name: r.feeStructure.name,
              query: { term: preview.term.id, branch: branchId || undefined },
            }"
            >Open fee structure</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>
    <InlineNotice
      v-if="preview.noGuardian"
      tone="warning"
      :title="`${preview.noGuardian} student${preview.noGuardian === 1 ? ' has' : 's have'} no guardian linked`"
      description="Their invoices are still created, but nobody is notified until a guardian is linked."
    />
    <InlineNotice
      v-if="!preview.toCreate && !preview.missingStructures.length"
      tone="info"
      title="Nothing to create"
      :description="`Every student in this selection already has a ${preview.term.name} invoice.`"
    />

    <SectionCard
      :title="`${preview.term.session} · ${preview.term.name} · ${branchName}`"
      class="max-w-4xl"
    >
      <dl class="mb-4 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
        <div>
          <dt class="text-faint">Students</dt>
          <dd class="text-lg font-semibold tabular-nums">{{ preview.students }}</dd>
        </div>
        <div>
          <dt class="text-faint">Already invoiced</dt>
          <dd class="text-lg font-semibold tabular-nums">{{ preview.alreadyInvoiced }}</dd>
        </div>
        <div>
          <dt class="text-faint">To create</dt>
          <dd class="text-lg font-semibold tabular-nums">{{ preview.toCreate }}</dd>
        </div>
        <div>
          <dt class="text-faint">Due</dt>
          <dd class="text-lg font-semibold">{{ fmtDay(preview.due) }}</dd>
        </div>
      </dl>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[560px] text-[13px]">
          <thead class="text-left text-xs text-faint">
            <tr class="border-b">
              <th class="py-2 font-medium">Class</th>
              <th class="py-2 font-medium">Branch</th>
              <th class="py-2 text-right font-medium">Students</th>
              <th class="py-2 text-right font-medium">Each (before discounts)</th>
              <th class="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="l in preview.levels"
              :key="`${l.branch}${l.level}`"
              class="border-b border-divider"
            >
              <td class="py-2">{{ l.level }}</td>
              <td class="py-2">{{ l.branch }}</td>
              <td class="py-2 text-right tabular-nums">{{ l.students }}</td>
              <td :class="cn('py-2 text-right tabular-nums', l.missing && 'text-error-strong')">
                {{ l.missing ? 'No published fees' : formatNaira(l.each) }}
              </td>
              <td class="py-2 text-right tabular-nums">
                {{ l.missing ? '—' : formatNaira(l.total) }}
              </td>
            </tr>
          </tbody>
          <tfoot class="font-semibold">
            <tr>
              <td class="py-2" colspan="4">Before discounts</td>
              <td class="py-2 text-right tabular-nums">{{ formatNaira(before) }}</td>
            </tr>
            <tr v-if="preview.discounts" class="text-success-strong">
              <td class="py-1 font-normal" colspan="4">Sibling discounts (automatic)</td>
              <td class="py-1 text-right tabular-nums">−{{ formatNaira(preview.discounts) }}</td>
            </tr>
            <tr>
              <td class="py-2" colspan="4">Total to bill</td>
              <td class="py-2 text-right tabular-nums">{{ formatNaira(preview.total) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </SectionCard>

    <SectionCard v-if="preview.toCreate" title="When saving" class="max-w-4xl">
      <ChoiceCards
        v-model="mode"
        label="When saving"
        :columns="2"
        :choices="[
          {
            value: 'draft',
            label: 'Create as drafts',
            description: 'Review them, then issue from Invoices. Parents see nothing yet.',
          },
          {
            value: 'issue',
            label: 'Issue now and notify fee payers',
            description: 'Sent by SMS and email with the bank details and transfer reference.',
          },
        ]"
      />
    </SectionCard>

    <div class="flex max-w-4xl justify-end gap-2">
      <Button variant="outline" @click="step = 0">Back</Button>
      <Button :disabled="!preview.toCreate || generate.isPending.value" @click="create">
        {{
          mode === 'issue'
            ? `Issue ${preview.toCreate} invoices`
            : `Create ${preview.toCreate} drafts`
        }}
      </Button>
    </div>
  </template>
</template>
