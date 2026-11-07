<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@edutrack/ui/components/dropdown-menu';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { ChevronDownIcon, CopyIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useCopyStructureMutation,
  useFeeStructureQuery,
  usePublishStructureMutation,
  useSaveStructureMutation,
} from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import type { FeeStructureView, StructureLevel } from '@/types';

import { financeTone, fmtDay } from '../finance-tones';

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();

const params = computed(() => ({
  term: (route.query.term as string | undefined) ?? undefined,
  branch: (route.query.branch as string | undefined) ?? undefined,
}));
const { data, isPending, isError, refetch } = useFeeStructureQuery(params);
const save = useSaveStructureMutation();
const publish = usePublishStructureMutation();
const copy = useCopyStructureMutation();

/** Cell text per "level|item": '' = not set, '0' = not charged for that class. */
const cells = ref<Record<string, string>>({});
const original = ref('');
const showErrors = ref(false);
const serverError = ref('');
const key = (level: string, item: string) => `${level}|${item}`;

function load(v: FeeStructureView) {
  const out: Record<string, string> = {};
  for (const s of v.sections)
    for (const l of s.levels)
      for (const i of v.items)
        out[key(l.name, i.id)] = l.amounts[i.id] == null ? '' : String(l.amounts[i.id]);
  cells.value = out;
  original.value = JSON.stringify(out);
  showErrors.value = false;
}
watch(data, (v) => v && load(v), { immediate: true });

const dirty = computed(() => !!data.value && JSON.stringify(cells.value) !== original.value);
useUnsavedChanges(dirty);

const view = computed(() => data.value);
const items = computed(() => view.value?.items ?? []);
/** Compulsory items that count towards every student's bill this term. */
const billed = computed(() =>
  items.value.filter(
    (i) => i.type === 'Compulsory' && i.chargedThisTerm && i.charged !== 'New students only',
  ),
);
const num = (s: string | undefined) => (s && /^\d+$/.test(s.trim()) ? Number(s.trim()) : 0);
const invalid = (s: string | undefined) =>
  !!s && s.trim() !== '' && (!/^\d+$/.test(s.trim()) || Number(s) > 10_000_000);

const rowTotal = (l: StructureLevel) =>
  billed.value.reduce((n, i) => n + num(cells.value[key(l.name, i.id)]), 0);
const optionalTotal = (l: StructureLevel) =>
  items.value
    .filter((i) => i.type === 'Optional')
    .reduce((n, i) => n + num(cells.value[key(l.name, i.id)]), 0);
const missing = (l: StructureLevel) =>
  items.value
    .filter(
      (i) =>
        i.type === 'Compulsory' &&
        i.charged === 'Every term' &&
        (cells.value[key(l.name, i.id)] ?? '').trim() === '',
    )
    .map((i) => i.name);
const levels = computed(() => view.value?.sections.flatMap((s) => s.levels) ?? []);
const students = computed(() => levels.value.reduce((n, l) => n + l.students, 0));
const projected = computed(() => levels.value.reduce((n, l) => n + l.students * rowTotal(l), 0));
const badCells = computed(() =>
  Object.entries(cells.value)
    .filter(([, v]) => invalid(v))
    .map(([k]) => k),
);
const gaps = computed(() =>
  levels.value.filter((l) => l.students > 0 && (missing(l).length || rowTotal(l) === 0)),
);

function payload() {
  const amounts: Record<string, Record<string, number | null>> = {};
  for (const l of levels.value)
    amounts[l.name] = Object.fromEntries(
      items.value.map((i) => {
        const v = (cells.value[key(l.name, i.id)] ?? '').trim();
        return [i.id, v === '' ? null : Number(v)];
      }),
    );
  return { termId: view.value!.term.id, branchId: view.value!.branch.id, amounts };
}

async function saveDraft(silent = false) {
  showErrors.value = true;
  if (badCells.value.length) {
    serverError.value = `${badCells.value.length} amount(s) need fixing: whole naira up to ₦10,000,000.`;
    return false;
  }
  serverError.value = '';
  try {
    const v = await save.mutateAsync(payload());
    load(v);
    if (!silent)
      toast.success(
        v.status === 'Published' ? 'Amounts saved. New invoices use them.' : 'Draft saved.',
      );
    return true;
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
    return false;
  }
}

function publishNow() {
  const v = view.value!;
  showErrors.value = true;
  if (badCells.value.length) return void saveDraft();
  void confirm({
    title: `Publish ${v.term.name} fees at ${v.branch.name}?`,
    description:
      'Invoices can then be generated from these amounts. Invoices already issued keep their amounts; adjust those one by one.',
    details: [
      ['Classes', `${levels.value.length} · ${students.value.toLocaleString('en-NG')} students`],
      ['Projected billing', `${formatNaira(projected.value)} in compulsory fees, before discounts`],
      ...(gaps.value.length
        ? ([['Blank compulsory fees', gaps.value.map((l) => l.name).join(', ')]] as [
            string,
            string,
          ][])
        : []),
    ],
    confirmLabel: 'Publish fees',
    action: async () => {
      if (dirty.value && !(await saveDraft(true))) throw new Error(serverError.value);
      const r = await publish.mutateAsync({ termId: v.term.id, branchId: v.branch.id });
      load(r);
      toast.success(`${v.term.name} fees published at ${v.branch.name}.`);
    },
  });
}

function copyFrom(source: { termId?: string; branchId?: string; label: string }) {
  const v = view.value!;
  void confirm({
    title: `Copy ${source.label}?`,
    description: `Replaces the amounts on this page with ${source.label}’s, as a draft. Classes this branch doesn’t run are skipped.`,
    confirmLabel: 'Copy amounts',
    action: async () => {
      const r = await copy.mutateAsync({
        fromTermId: source.termId ?? v.term.id,
        toTermId: v.term.id,
        branchId: v.branch.id,
        fromBranchId: source.branchId,
      });
      load(r);
      toast.success(`Copied ${source.label} as draft. Review, then publish.`);
    },
  });
}

/** Fill the rest of a section with its first class's amounts. */
function fillSection(section: { name: string; levels: StructureLevel[] }) {
  const [first, ...rest] = section.levels;
  if (!first) return;
  for (const l of rest)
    for (const i of items.value)
      if (i.chargedThisTerm)
        cells.value[key(l.name, i.id)] = cells.value[key(first.name, i.id)] ?? '';
  toast.success(`${first.name}’s amounts copied to the rest of ${section.name}.`);
}

async function pick(next: { term?: string; branch?: string }) {
  if (dirty.value) {
    const ok = await confirm({
      title: 'You have unsaved changes',
      description: 'Your changes will be lost if you switch.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Stay',
      tone: 'destructive',
    });
    if (!ok) return;
    original.value = JSON.stringify(cells.value);
  }
  await router.replace({ query: { ...route.query, ...next } });
}

const copySources = computed(() => {
  const v = view.value;
  if (!v) return { terms: [], branches: [] };
  return {
    terms: v.terms.filter((t) => t.id !== v.term.id && v.statuses[t.id] !== 'Not created'),
    branches: v.otherBranches.filter((b) => b.status !== 'Not created'),
  };
});
const canCopy = computed(
  () =>
    view.value?.status !== 'Published' &&
    (copySources.value.terms.length || copySources.value.branches.length),
);
</script>

<template>
  <div class="flex flex-col gap-5">
    <div v-if="isPending" class="flex flex-col gap-3">
      <Skeleton class="h-12 w-1/2" />
      <Skeleton class="h-80 w-full" />
    </div>
    <InlineNotice
      v-else-if="isError || !view"
      tone="error"
      title="The fee structure couldn’t load"
      description="Check your connection and try again."
    >
      <template #action
        ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
      >
    </InlineNotice>
    <template v-else>
      <PageHeader
        :title="`${view.term.name} fees · ${view.branch.name}`"
        :description="`${view.term.session} · ${fmtDay(view.term.start)} – ${fmtDay(view.term.end)} · amounts per student in naira`"
        :meta="
          view.publishedOn ? [{ label: 'Published', value: fmtDay(view.publishedOn) }] : undefined
        "
      >
        <template #actions>
          <DropdownMenu v-if="canCopy">
            <DropdownMenuTrigger as-child>
              <Button variant="outline"
                ><CopyIcon class="size-4" /> Copy from <ChevronDownIcon class="size-4"
              /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <template v-if="copySources.terms.length">
                <DropdownMenuLabel>Another term at {{ view.branch.name }}</DropdownMenuLabel>
                <DropdownMenuItem
                  v-for="t in copySources.terms"
                  :key="t.id"
                  @select="copyFrom({ termId: t.id, label: `${t.name} ${t.session}` })"
                  >{{ t.name }} · {{ t.session }}</DropdownMenuItem
                >
              </template>
              <DropdownMenuSeparator
                v-if="copySources.terms.length && copySources.branches.length"
              />
              <template v-if="copySources.branches.length">
                <DropdownMenuLabel>{{ view.term.name }} at another branch</DropdownMenuLabel>
                <DropdownMenuItem
                  v-for="b in copySources.branches"
                  :key="b.id"
                  @select="
                    copyFrom({ branchId: b.id, label: `${b.name}’s ${view.term.name} amounts` })
                  "
                  >{{ b.name }}</DropdownMenuItem
                >
              </template>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" :disabled="!dirty || save.isPending.value" @click="saveDraft()"
            ><Spinner v-if="save.isPending.value" />{{
              view.status === 'Published' ? 'Save changes' : 'Save draft'
            }}</Button
          >
          <Button
            v-if="view.status !== 'Published'"
            :disabled="publish.isPending.value"
            @click="publishNow"
            >Publish</Button
          >
        </template>
      </PageHeader>

      <div class="flex flex-wrap items-end gap-4">
        <FieldShell id="fs-term" label="Term">
          <select
            id="fs-term"
            :value="view.term.id"
            class="h-9 min-w-[220px] rounded-md border bg-card px-2.5 text-sm"
            @change="pick({ term: ($event.target as HTMLSelectElement).value })"
          >
            <option v-for="t in view.terms" :key="t.id" :value="t.id">
              {{ t.name }} · {{ t.session }} — {{ view.statuses[t.id] }}
            </option>
          </select>
        </FieldShell>
        <FieldShell v-if="view.branches.length > 1" id="fs-branch" label="Branch">
          <select
            id="fs-branch"
            :value="view.branch.id"
            class="h-9 min-w-[180px] rounded-md border bg-card px-2.5 text-sm"
            @change="pick({ branch: ($event.target as HTMLSelectElement).value })"
          >
            <option v-for="b in view.branches" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </FieldShell>
        <StatusBadge class="mb-2" :label="view.status" :tone="financeTone(view.status)" />
      </div>

      <InlineNotice
        v-for="n in view.notices"
        :key="n.title"
        :tone="n.tone"
        :title="n.title"
        :description="n.description"
      />
      <InlineNotice
        v-if="serverError"
        tone="error"
        title="Not saved"
        :description="serverError"
        role="alert"
      />
      <InlineNotice
        v-if="!items.length"
        tone="warning"
        title="No fee items"
        description="Add fee items first, then enter their amounts here."
      >
        <template #action>
          <Button as-child variant="outline" size="sm"
            ><RouterLink :to="{ name: routesPath.finance.fees.name, query: { tab: 'items' } }"
              >Fee items</RouterLink
            ></Button
          >
        </template>
      </InlineNotice>
      <InlineNotice
        v-else-if="showErrors && gaps.length"
        tone="warning"
        :title="`${gaps.length} class${gaps.length === 1 ? '' : 'es'} with students ${gaps.length === 1 ? 'has' : 'have'} blank compulsory fees`"
        :description="`${gaps.map((l) => l.name).join(', ')}. Enter 0 for an item a class isn’t charged.`"
      />

      <SectionCard
        v-for="section in view.sections"
        :key="section.name"
        :title="section.name"
        description="Leave optional fees blank where they aren’t offered; 0 means not charged."
        flush
      >
        <template #actions>
          <Button
            v-if="section.levels.length > 1"
            variant="ghost"
            size="sm"
            @click="fillSection(section)"
            >Copy {{ section.levels[0]!.name }} to all</Button
          >
        </template>
        <div class="overflow-x-auto">
          <table class="w-full min-w-max border-collapse text-[13px]">
            <thead>
              <tr class="border-b border-divider text-left text-xs text-muted-foreground">
                <th class="sticky left-0 z-10 bg-card px-4 py-2.5 font-medium">Class</th>
                <th v-for="i in items" :key="i.id" class="min-w-[124px] px-2 py-2.5 font-medium">
                  <span class="flex flex-col">
                    <span class="text-foreground">{{ i.name }}</span>
                    <span
                      >{{ i.type
                      }}{{
                        i.charged !== 'Every term' ? ` · ${i.charged.toLowerCase()}` : ''
                      }}</span
                    >
                  </span>
                </th>
                <th class="px-4 py-2.5 text-right font-medium">Compulsory total</th>
                <th class="px-4 py-2.5 text-right font-medium">Optional</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="l in section.levels"
                :key="l.name"
                class="border-b border-divider last:border-0"
              >
                <th scope="row" class="sticky left-0 z-10 bg-card px-4 py-2 text-left font-medium">
                  <span class="flex flex-col">
                    {{ l.name }}
                    <span class="text-xs font-normal text-muted-foreground"
                      >{{ l.students.toLocaleString('en-NG') }} students</span
                    >
                  </span>
                </th>
                <td v-for="i in items" :key="i.id" class="px-2 py-2">
                  <span v-if="!i.chargedThisTerm" class="text-xs text-faint"
                    >Charged in first term</span
                  >
                  <input
                    v-else
                    v-model="cells[key(l.name, i.id)]"
                    inputmode="numeric"
                    :aria-label="`${i.name} for ${l.name}`"
                    :placeholder="i.type === 'Compulsory' ? 'Required' : 'Not offered'"
                    :aria-invalid="invalid(cells[key(l.name, i.id)]) || undefined"
                    :class="
                      cn(
                        'h-8 w-full rounded-md border bg-card px-2 text-right tabular-nums placeholder:text-faint',
                        invalid(cells[key(l.name, i.id)]) && 'border-destructive',
                        showErrors &&
                          l.students > 0 &&
                          i.type === 'Compulsory' &&
                          i.charged === 'Every term' &&
                          !(cells[key(l.name, i.id)] ?? '').trim() &&
                          'border-warning bg-highlight-subtle',
                      )
                    "
                  />
                </td>
                <td
                  class="px-4 py-2 text-right font-semibold tabular-nums"
                  :class="l.students > 0 && rowTotal(l) === 0 && 'text-error-strong'"
                >
                  {{ formatNaira(rowTotal(l)) }}
                  <span
                    v-if="l.students > 0 && missing(l).length"
                    class="block text-xs font-normal text-error-strong"
                    >{{ missing(l).length }} blank</span
                  >
                </td>
                <td class="px-4 py-2 text-right tabular-nums text-muted-foreground">
                  {{ optionalTotal(l) ? formatNaira(optionalTotal(l)) : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div
        class="flex flex-wrap justify-between gap-3 rounded-lg border bg-muted px-4 py-3 text-[13px]"
      >
        <span>
          <span class="text-muted-foreground">Students</span>
          <strong class="ml-1.5 tabular-nums">{{ students.toLocaleString('en-NG') }}</strong>
        </span>
        <span>
          <span class="text-muted-foreground"
            >Projected billing (compulsory, before discounts)</span
          >
          <strong class="ml-1.5 tabular-nums">{{ formatNaira(projected) }}</strong>
        </span>
        <span v-if="view.invoicesIssued">
          <span class="text-muted-foreground">Invoices issued</span>
          <strong class="ml-1.5 tabular-nums">{{
            view.invoicesIssued.toLocaleString('en-NG')
          }}</strong>
        </span>
      </div>
    </template>
  </div>
</template>
