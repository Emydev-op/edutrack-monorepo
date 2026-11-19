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
import {
  getApiErrorCode,
  getApiErrorFields,
  getApiErrorMessage,
  messageOf,
} from '@edutrack/web-core/http';
import { DownloadIcon, Trash2Icon, UploadIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import StepIndicator from '@edutrack/app-kit/components/common/StepIndicator.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  downloadSubjectTemplate,
  useSubjectImportCommitMutation,
  useSubjectImportPreviewMutation,
} from '@/api/services/academics';
import type { CurriculumView, SubjectImportField, SubjectImportRow } from '@/types';

import { CATEGORIES } from './subject-categories';

/**
 * Bulk upload: download the template, upload it filled in, then fix any rows in the preview and
 * import. Nothing is saved until the last step, and then all rows or none.
 */
const props = defineProps<{ view: CurriculumView }>();
const open = defineModel<boolean>('open', { required: true });

const confirm = useConfirm();
const preview = useSubjectImportPreviewMutation();
const commit = useSubjectImportCommitMutation();

const MAX_ROWS = 300;
const MAX_BYTES = 4 * 1024 * 1024;
const STATUSES = ['Active', 'Inactive'];
type Field = Exclude<SubjectImportField, 'row'>;

const step = ref(0);
const downloading = ref(false);
const fileError = ref('');
const serverError = ref('');
const rows = ref<SubjectImportRow[]>([]);
/** The API's messages, keyed "<row>.<field>"; a cell's message clears when it's edited. */
const serverIssues = ref<Record<string, string>>({});
const fileInput = ref<HTMLInputElement>();

watch(open, (o) => {
  if (!o) return;
  step.value = 0;
  fileError.value = '';
  serverError.value = '';
  rows.value = [];
  serverIssues.value = {};
});

/** Section admins only add to their own sections; whole-school admins can add shared ones. */
const sectionOptions = computed(() => {
  const mine = props.view.mySections;
  return [
    ...props.view.levels
      .map((l) => l.section)
      .filter((n) => !mine || mine.includes(n))
      .map((n) => ({ value: n, label: n })),
    ...(mine ? [] : [{ value: '', label: 'Shared' }]),
  ];
});

async function getTemplate() {
  downloading.value = true;
  try {
    await downloadSubjectTemplate();
    if (step.value === 0) step.value = 1;
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'We couldn’t download the template. Try again.'));
  } finally {
    downloading.value = false;
  }
}

/** .xlsx goes as base64 (no data: prefix); .csv as its text. */
function readFile(file: File, asText: boolean) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(asText ? result : result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('We couldn’t read that file. Try again.'));
    if (asText) reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

async function upload(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  fileError.value = '';
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'xlsx' && ext !== 'csv')
    return void (fileError.value =
      'Upload the template as .xlsx, or a .csv with the same columns.');
  if (file.size > MAX_BYTES)
    return void (fileError.value = 'That file is too large. Use up to 4 MB.');
  try {
    const content = await readFile(file, ext === 'csv');
    const res = await preview.mutateAsync({ fileName: file.name, content });
    if (!res.rows.length)
      return void (fileError.value = 'That file has no subjects. Fill in one row per subject.');
    rows.value = res.rows.map((r) => ({
      row: r.row,
      name: r.name,
      code: r.code,
      section: r.section ?? '',
      category: r.category,
      periods: r.periods,
      status: r.status,
    }));
    serverIssues.value = Object.fromEntries(
      res.rows.flatMap((r) => r.issues.map((i) => [`${r.row}.${i.field}`, i.message])),
    );
    serverError.value = '';
    step.value = 2;
  } catch (err) {
    fileError.value = getApiErrorMessage(err, 'We couldn’t read that file. Try again.');
  }
}

/** Checks the preview can do without the API: required fields, formats and repeats in the file. */
function clientIssue(r: SubjectImportRow, field: Field): string | undefined {
  const name = r.name.trim();
  switch (field) {
    case 'name':
      if (!name) return 'Name the subject.';
      if (
        rows.value.some(
          (x) =>
            x !== r &&
            x.section === r.section &&
            x.name.trim().toLowerCase() === name.toLowerCase(),
        )
      )
        return `${name} is in the file twice${r.section ? ` for ${r.section}` : ''}.`;
      return;
    case 'code':
      if (!/^[A-Z]{2,4}\d?$/.test(r.code)) return '2–4 capitals, e.g. MTH.';
      if (rows.value.some((x) => x !== r && x.code === r.code))
        return `${r.code} is in the file twice.`;
      return;
    case 'section':
      if (!sectionOptions.value.some((o) => o.value === r.section))
        return 'Choose one of the sections you manage.';
      return;
    case 'category':
      if (!CATEGORIES.includes(r.category as (typeof CATEGORIES)[number]))
        return 'Choose a category.';
      return;
    case 'periods': {
      const p = Number(r.periods);
      if (String(r.periods).trim() === '' || !Number.isInteger(p) || p < 1 || p > 10)
        return 'Between 1 and 10.';
      return;
    }
    case 'status':
      if (!STATUSES.includes(r.status)) return 'Active or Inactive.';
  }
}
const issue = (r: SubjectImportRow, field: SubjectImportField) =>
  (field === 'row' ? undefined : clientIssue(r, field)) ?? serverIssues.value[`${r.row}.${field}`];

/** Editing a cell clears the API's message for it, and the row's own message. */
function edited(r: SubjectImportRow, field: Field) {
  const next = { ...serverIssues.value };
  delete next[`${r.row}.${field}`];
  delete next[`${r.row}.row`];
  serverIssues.value = next;
}

const FIELDS: Field[] = ['name', 'code', 'section', 'category', 'periods', 'status'];
const rowHasIssue = (r: SubjectImportRow) => [...FIELDS, 'row' as const].some((f) => !!issue(r, f));
const needFixing = computed(() => rows.value.filter(rowHasIssue).length);
const ready = computed(() => rows.value.length - needFixing.value);

function removeRow(r: SubjectImportRow) {
  rows.value = rows.value.filter((x) => x !== r);
}

async function submit() {
  if (needFixing.value || !rows.value.length) return;
  serverError.value = '';
  try {
    const res = await commit.mutateAsync(
      rows.value.map((r) => ({ ...r, name: r.name.trim(), periods: Number(r.periods) })),
    );
    toast.success(messageOf(res, `${res.imported} subjects imported.`));
    open.value = false;
  } catch (e) {
    if (getApiErrorCode(e) === 'IMPORT_HAS_ISSUES') {
      serverIssues.value = getApiErrorFields(e);
      serverError.value = 'Some rows still need fixing. Nothing was imported.';
    } else serverError.value = getApiErrorMessage(e, 'We couldn’t import the subjects. Try again.');
  }
}

async function requestClose(next: boolean) {
  if (next) return void (open.value = true);
  if (step.value === 2 && rows.value.length) {
    const discard = await confirm({
      title: 'Discard this upload?',
      description: 'Nothing has been imported yet. Your fixes in the preview will be lost.',
      confirmLabel: 'Discard upload',
      cancelLabel: 'Stay',
      tone: 'destructive',
    });
    if (!discard) return;
  }
  open.value = false;
}

const cellClass = (bad: boolean) =>
  `h-8 w-full rounded-md border bg-card px-2 text-xs ${bad ? 'border-destructive' : ''}`;
</script>

<template>
  <Dialog :open="open" @update:open="requestClose">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[min(1100px,95vw)]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">Bulk upload subjects</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          Nothing is saved until you import, and then every row or none.
        </DialogDescription>
      </div>
      <StepIndicator
        :steps="['Download the template', 'Upload it', 'Check and import']"
        :current="step"
        size="sm"
      />

      <template v-if="step < 2">
        <div class="flex flex-col gap-3 rounded-md border bg-muted px-4 py-3.5 text-[13px]">
          <p class="font-semibold">1. Download the template</p>
          <ul class="list-disc pl-5 text-body">
            <li>Fill in one row per subject, up to {{ MAX_ROWS }}.</li>
            <li>Leave Section blank for a subject shared by every section.</li>
            <li>Leave Code blank and we’ll suggest one.</li>
            <li>Section, Category and Status have dropdowns in Excel.</li>
          </ul>
          <div>
            <Button variant="outline" size="sm" :disabled="downloading" @click="getTemplate">
              <Spinner v-if="downloading" /><DownloadIcon v-else />Download the template
            </Button>
          </div>
        </div>
        <div class="flex flex-col gap-3 rounded-md border px-4 py-3.5 text-[13px]">
          <p class="font-semibold">2. Upload the filled-in file</p>
          <p class="text-muted-foreground">.xlsx, or a .csv with the same columns.</p>
          <InlineNotice
            v-if="fileError"
            tone="error"
            title="That file didn’t upload"
            :description="fileError"
            role="alert"
          />
          <input
            ref="fileInput"
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            class="sr-only"
            aria-label="Choose a file"
            @change="upload"
          />
          <div>
            <Button size="sm" :disabled="preview.isPending.value" @click="fileInput?.click()">
              <Spinner v-if="preview.isPending.value" /><UploadIcon v-else />{{
                preview.isPending.value ? 'Checking…' : 'Choose file'
              }}
            </Button>
          </div>
        </div>
      </template>

      <template v-else>
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Not imported"
          :description="serverError"
          role="alert"
        />
        <p class="text-[13px]" aria-live="polite">
          <span class="font-medium text-success-strong">{{ ready }} ready</span> ·
          <span :class="needFixing ? 'font-medium text-error-strong' : 'text-muted-foreground'"
            >{{ needFixing }} need fixing</span
          >
        </p>
        <div class="min-h-0 flex-1 overflow-auto rounded-md border">
          <table class="w-full min-w-[960px] border-collapse text-[13px]">
            <thead class="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th class="w-12 px-2 py-2 font-medium">Row</th>
                <th class="px-2 py-2 font-medium">Subject name</th>
                <th class="w-24 px-2 py-2 font-medium">Code</th>
                <th class="w-44 px-2 py-2 font-medium">Section</th>
                <th class="w-36 px-2 py-2 font-medium">Category</th>
                <th class="w-24 px-2 py-2 font-medium">Lessons / wk</th>
                <th class="w-28 px-2 py-2 font-medium">Status</th>
                <th class="w-10" />
              </tr>
            </thead>
            <tbody>
              <template v-for="r in rows" :key="r.row">
                <tr class="border-t border-divider align-top">
                  <td class="px-2 py-1.5 text-xs text-muted-foreground tabular-nums">
                    {{ r.row }}
                  </td>
                  <td class="px-1.5 py-1">
                    <Input
                      v-model="r.name"
                      class="h-8 text-xs"
                      :aria-label="`Row ${r.row} subject name`"
                      :aria-invalid="!!issue(r, 'name')"
                      @update:model-value="edited(r, 'name')"
                    />
                    <p v-if="issue(r, 'name')" class="mt-0.5 text-xs text-error-strong">
                      {{ issue(r, 'name') }}
                    </p>
                  </td>
                  <td class="px-1.5 py-1">
                    <Input
                      v-model="r.code"
                      class="h-8 font-mono text-xs"
                      maxlength="5"
                      :aria-label="`Row ${r.row} code`"
                      :aria-invalid="!!issue(r, 'code')"
                      @update:model-value="
                        r.code = String($event).toUpperCase();
                        edited(r, 'code');
                      "
                    />
                    <p v-if="issue(r, 'code')" class="mt-0.5 text-xs text-error-strong">
                      {{ issue(r, 'code') }}
                    </p>
                  </td>
                  <td class="px-1.5 py-1">
                    <select
                      v-model="r.section"
                      :class="cellClass(!!issue(r, 'section'))"
                      :aria-label="`Row ${r.row} section`"
                      :aria-invalid="!!issue(r, 'section')"
                      @change="edited(r, 'section')"
                    >
                      <option
                        v-if="!sectionOptions.some((o) => o.value === r.section)"
                        :value="r.section"
                      >
                        {{ r.section || 'Shared' }}
                      </option>
                      <option v-for="o in sectionOptions" :key="o.value" :value="o.value">
                        {{ o.label }}
                      </option>
                    </select>
                    <p v-if="issue(r, 'section')" class="mt-0.5 text-xs text-error-strong">
                      {{ issue(r, 'section') }}
                    </p>
                  </td>
                  <td class="px-1.5 py-1">
                    <select
                      v-model="r.category"
                      :class="cellClass(!!issue(r, 'category'))"
                      :aria-label="`Row ${r.row} category`"
                      :aria-invalid="!!issue(r, 'category')"
                      @change="edited(r, 'category')"
                    >
                      <option v-if="!CATEGORIES.some((c) => c === r.category)" :value="r.category">
                        {{ r.category || 'Choose…' }}
                      </option>
                      <option v-for="c in CATEGORIES" :key="c">{{ c }}</option>
                    </select>
                    <p v-if="issue(r, 'category')" class="mt-0.5 text-xs text-error-strong">
                      {{ issue(r, 'category') }}
                    </p>
                  </td>
                  <td class="px-1.5 py-1">
                    <Input
                      v-model="r.periods"
                      class="h-8 text-xs"
                      inputmode="numeric"
                      :aria-label="`Row ${r.row} lessons per week`"
                      :aria-invalid="!!issue(r, 'periods')"
                      @update:model-value="edited(r, 'periods')"
                    />
                    <p v-if="issue(r, 'periods')" class="mt-0.5 text-xs text-error-strong">
                      {{ issue(r, 'periods') }}
                    </p>
                  </td>
                  <td class="px-1.5 py-1">
                    <select
                      v-model="r.status"
                      :class="cellClass(!!issue(r, 'status'))"
                      :aria-label="`Row ${r.row} status`"
                      :aria-invalid="!!issue(r, 'status')"
                      @change="edited(r, 'status')"
                    >
                      <option v-if="!STATUSES.includes(r.status)" :value="r.status">
                        {{ r.status || 'Choose…' }}
                      </option>
                      <option v-for="st in STATUSES" :key="st">{{ st }}</option>
                    </select>
                    <p v-if="issue(r, 'status')" class="mt-0.5 text-xs text-error-strong">
                      {{ issue(r, 'status') }}
                    </p>
                  </td>
                  <td class="px-1 py-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      class="text-muted-foreground"
                      :aria-label="`Remove row ${r.row}`"
                      @click="removeRow(r)"
                    >
                      <Trash2Icon />
                    </Button>
                  </td>
                </tr>
                <tr v-if="issue(r, 'row')">
                  <td />
                  <td colspan="7" class="px-1.5 pb-1.5 text-xs text-error-strong">
                    {{ issue(r, 'row') }}
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
          <p v-if="!rows.length" class="p-6 text-center text-sm text-muted-foreground">
            Every row was removed. Upload the file again to start over.
          </p>
        </div>
      </template>

      <div class="flex items-center gap-2 border-t border-divider pt-3">
        <Button v-if="step === 2" variant="ghost" @click="step = 0">Upload another file</Button>
        <span class="flex-1" />
        <Button variant="outline" @click="requestClose(false)">Cancel</Button>
        <Button
          v-if="step === 2"
          :disabled="commit.isPending.value || !!needFixing || !rows.length"
          @click="submit"
        >
          <Spinner v-if="commit.isPending.value" />
          {{
            commit.isPending.value
              ? 'Importing…'
              : `Import ${rows.length} subject${rows.length === 1 ? '' : 's'}`
          }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
