<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Input } from '@edutrack/ui/components/input';
import { Progress } from '@edutrack/ui/components/progress';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { FileSpreadsheetIcon, UploadIcon } from '@lucide/vue';
import { computed, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import StepIndicator from '@edutrack/app-kit/components/common/StepIndicator.vue';
import { downloadCsv } from '@edutrack/app-kit/lib/csv';

import { useCommitImportMutation, useValidateImportMutation } from '@/api/services/students';
import { env } from '@/config/env';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { ImportBatch, ImportIssue, ImportResult } from '@/types';

const STEPS = ['Template', 'Upload', 'Validate', 'Review & fix', 'Confirm', 'Import', 'Complete'];
const COLUMNS = [
  'surname*',
  'first_name*',
  'other_names',
  'gender*',
  'date_of_birth* (DD/MM/YYYY)',
  'class_level*',
  'arm*',
  'guardian_name',
  'guardian_phone',
  'guardian_email',
  'relationship',
  'state_of_origin',
  'previous_school',
];

const context = useContextStore();
const validateFile = useValidateImportMutation();
const commit = useCommitImportMutation();

const step = ref(0);
const progress = ref(0);
const uploadError = ref('');
const batch = ref<ImportBatch | null>(null);
const result = ref<ImportResult | null>(null);
const fixes = reactive<Record<string, string>>({});
const exclude = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

function downloadTemplate() {
  downloadCsv(
    'student-import-template.csv',
    COLUMNS.map((c) => c.replace(/\*.*$/, '').replace(/ \(.+\)$/, '')),
    [
      [
        'Nwosu',
        'Kamsi',
        'Chidinma',
        'Female',
        '12/05/2014',
        'JSS 1',
        'A',
        'Mr. Obinna Nwosu',
        '0806 555 0193',
        '',
        'Father',
        'Anambra',
        'Little Angels School',
      ],
    ],
  );
  toast.success('Template downloaded. Excel opens it directly.');
}

/** Animates a progress bar while the server works, finishing when it answers. */
async function withProgress<T>(work: Promise<T>) {
  progress.value = 0;
  const timer = setInterval(() => (progress.value = Math.min(90, progress.value + 9)), 160);
  try {
    const value = await work;
    progress.value = 100;
    return value;
  } finally {
    clearInterval(timer);
  }
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  uploadError.value = '';
  if (!/\.(xlsx|csv)$/i.test(file.name))
    return void (uploadError.value = `“${file.name}” isn’t an .xlsx or .csv file.`);
  if (file.size > 10 * 1048576)
    return void (uploadError.value = `“${file.name}” is larger than 10 MB.`);
  step.value = 2;
  try {
    batch.value = await withProgress(validateFile.mutateAsync(file.name));
    for (const i of batch.value.issues) {
      if (i.code === 'dob') fixes[i.row] = i.value ?? '';
      if (i.code === 'duplicate') fixes[i.row] = 'new';
      if (i.code === 'no-guardian') fixes[i.row] = 'accept';
      if (i.code === 'guardian-match') fixes[i.row] = 'link';
    }
    step.value = 3;
  } catch (e) {
    step.value = 1;
    uploadError.value = getApiErrorMessage(
      e,
      'We couldn’t read that file. Check it’s the template and try again.',
    );
  }
}

const validDob = (v: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v ?? '');
  if (!m) return false;
  const [day, month, year] = [+m[1]!, +m[2]!, +m[3]!];
  const date = new Date(year, month - 1, day);
  return date.getDate() === day && date.getMonth() === month - 1;
};
const isFixed = (i: ImportIssue) =>
  i.code === 'class'
    ? fixes[i.row] === i.suggestion
    : i.code === 'dob'
      ? validDob(fixes[i.row] ?? '')
      : true;
const errorsLeft = computed(
  () => batch.value?.issues.filter((i) => i.kind === 'error' && !isFixed(i)).length ?? 0,
);
const warnings = computed(
  () => batch.value?.issues.filter((i) => i.kind === 'warning').length ?? 0,
);
const skipped = computed(() => (fixes['7'] === 'skip' ? 1 : 0));
const importable = computed(() => {
  if (!batch.value) return 0;
  if (errorsLeft.value && !exclude.value) return 0;
  return batch.value.rows - errorsLeft.value - skipped.value;
});
const validCount = computed(() =>
  batch.value
    ? batch.value.valid + batch.value.issues.filter((i) => i.kind === 'error' && isFixed(i)).length
    : 0,
);
const linkedExtra = computed(() => (fixes['40'] === 'new' ? 0 : 1));

function downloadErrors() {
  if (!batch.value) return;
  downloadCsv(
    `import-errors-${batch.value.id}.csv`,
    ['Row', 'Student', 'Kind', 'Issue'],
    batch.value.issues.map((i) => [i.row, i.student, i.kind, i.message]),
  );
}

async function runImport() {
  if (!batch.value) return;
  step.value = 5;
  try {
    result.value = await withProgress(
      commit.mutateAsync({
        id: batch.value.id,
        resolutions: { ...fixes },
        excludeErrors: exclude.value,
      }),
    );
    step.value = 6;
    toast.success(`${result.value.imported} students imported into ${batch.value.target}.`);
  } catch (e) {
    step.value = 4;
    toast.error(getApiErrorMessage(e, 'The import didn’t run. Nothing was imported. Try again.'));
  }
}

function restart() {
  step.value = 0;
  batch.value = null;
  result.value = null;
  exclude.value = false;
  Object.keys(fixes).forEach((k) => delete fixes[k]);
}

const choice = (row: number, value: string) =>
  cn(
    'h-8 rounded-md border px-2.5 text-xs',
    fixes[row] === value
      ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
      : 'bg-card hover:bg-muted',
  );
</script>

<template>
  <PageHeader
    title="Import students"
    :description="`Bulk import into ${context.current.session} · ${context.current.branch}. Validation runs on the server; nothing is imported until you confirm.`"
  />
  <StepIndicator :steps="STEPS" :current="step" />

  <section class="flex flex-col gap-4 rounded-lg border bg-card p-5">
    <template v-if="step === 0">
      <h2 class="text-base font-semibold">1. Download the template</h2>
      <button
        type="button"
        class="flex items-center gap-3 rounded-lg border p-4 text-left hover:border-primary"
        @click="downloadTemplate"
      >
        <FileSpreadsheetIcon class="size-6 text-success-strong" aria-hidden="true" />
        <span class="flex flex-col text-[13px]">
          <span class="font-semibold">Student import template (.csv)</span>
          <span class="text-muted-foreground"
            >Opens in Excel or Google Sheets. Save it as .xlsx or .csv.</span
          >
        </span>
      </button>
      <p class="text-xs text-muted-foreground">Columns: {{ COLUMNS.join(', ') }}.</p>
      <div class="flex justify-end">
        <Button @click="step = 1">I’ve filled the template</Button>
      </div>
    </template>

    <template v-else-if="step === 1">
      <h2 class="text-base font-semibold">2. Upload your file</h2>
      <button
        type="button"
        class="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center hover:border-primary"
        @click="fileInput?.click()"
      >
        <UploadIcon class="size-6 text-muted-foreground" aria-hidden="true" />
        <span class="text-[13px] font-medium">Choose your file</span>
        <span class="text-xs text-muted-foreground">.xlsx or .csv · up to 5,000 rows · 10 MB</span>
      </button>
      <input
        ref="fileInput"
        type="file"
        accept=".xlsx,.csv"
        class="sr-only"
        aria-label="Student import file"
        @change="onFile"
      />
      <p v-if="uploadError" role="alert" class="text-xs text-destructive">{{ uploadError }}</p>
      <p v-if="env.useMocks" class="text-xs text-faint">
        Mock API: any file returns the design’s sample results (48 rows with 5 findings).
      </p>
      <div class="flex justify-between">
        <Button variant="ghost" @click="step = 0">Back</Button>
      </div>
    </template>

    <template v-else-if="step === 2">
      <h2 class="text-base font-semibold">3. Validating</h2>
      <Progress :model-value="progress" class="h-2" aria-label="Validation progress" />
      <p class="text-[13px] text-muted-foreground">
        Checking each row against classes, arms, existing students and guardians · {{ progress }}%
      </p>
    </template>

    <template v-else-if="step === 3 && batch">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-base font-semibold">4. Review and fix · {{ batch.fileName }}</h2>
        <Button variant="outline" size="sm" @click="downloadErrors">Download error report</Button>
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-lg border bg-success-subtle px-3.5 py-2.5">
          <b class="text-lg">{{ validCount }}</b> <span class="text-[13px]">Valid rows</span>
        </div>
        <div class="rounded-lg border bg-warning-subtle px-3.5 py-2.5">
          <b class="text-lg">{{ warnings }}</b>
          <span class="text-[13px]">Warnings · need a decision</span>
        </div>
        <div class="rounded-lg border bg-error-subtle px-3.5 py-2.5">
          <b class="text-lg">{{ errorsLeft }}</b>
          <span class="text-[13px]">Errors · must be fixed or excluded</span>
        </div>
      </div>
      <div class="overflow-x-auto rounded-lg border">
        <table class="w-full min-w-[760px] text-[13px]">
          <thead class="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th class="px-3 py-2 font-medium">Row</th>
              <th class="px-3 py-2 font-medium">Student</th>
              <th class="px-3 py-2 font-medium">Issue</th>
              <th class="px-3 py-2 font-medium">Resolution</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="i in batch.issues" :key="i.row" class="border-t border-divider align-top">
              <td class="px-3 py-2.5 tabular-nums">{{ i.row }}</td>
              <td class="px-3 py-2.5 font-medium">{{ i.student }}</td>
              <td class="px-3 py-2.5">
                <StatusBadge
                  :label="
                    isFixed(i) && i.kind === 'error'
                      ? 'Fixed'
                      : i.kind === 'error'
                        ? 'Error'
                        : 'Warning'
                  "
                  :tone="
                    isFixed(i) && i.kind === 'error'
                      ? 'success'
                      : i.kind === 'error'
                        ? 'error'
                        : 'warning'
                  "
                />
                <span class="mt-1 block">{{
                  i.code === 'class' && isFixed(i)
                    ? `Class set to ${i.suggestion}`
                    : i.code === 'dob' && isFixed(i)
                      ? 'Date fixed'
                      : i.message
                }}</span>
              </td>
              <td class="px-3 py-2.5">
                <Button
                  v-if="i.code === 'class'"
                  size="sm"
                  variant="outline"
                  :disabled="isFixed(i)"
                  @click="fixes[i.row] = i.suggestion!"
                  >Use {{ i.suggestion }}</Button
                >
                <Input
                  v-else-if="i.code === 'dob'"
                  v-model="fixes[i.row]"
                  class="h-8 w-36"
                  :aria-label="`Date of birth for row ${i.row}`"
                  placeholder="DD/MM/YYYY"
                />
                <div v-else class="flex flex-wrap gap-1.5">
                  <template v-if="i.code === 'duplicate'">
                    <button
                      type="button"
                      :class="choice(i.row, 'new')"
                      @click="fixes[i.row] = 'new'"
                    >
                      Import as new student
                    </button>
                    <button
                      type="button"
                      :class="choice(i.row, 'skip')"
                      @click="fixes[i.row] = 'skip'"
                    >
                      Skip row
                    </button>
                  </template>
                  <button
                    v-else-if="i.code === 'no-guardian'"
                    type="button"
                    :class="choice(i.row, 'accept')"
                    @click="fixes[i.row] = 'accept'"
                  >
                    Import without guardian
                  </button>
                  <template v-else>
                    <button
                      type="button"
                      :class="choice(i.row, 'link')"
                      @click="fixes[i.row] = 'link'"
                    >
                      Link existing parent
                    </button>
                    <button
                      type="button"
                      :class="choice(i.row, 'new')"
                      @click="fixes[i.row] = 'new'"
                    >
                      Create new parent
                    </button>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <label v-if="errorsLeft" class="flex items-center gap-2 text-[13px]">
        <Checkbox v-model="exclude" />
        Exclude the {{ errorsLeft }} row{{ errorsLeft === 1 ? '' : 's' }} with errors and import
        {{ batch.rows - errorsLeft - skipped }} students
      </label>
      <div class="flex justify-between gap-2">
        <Button variant="outline" @click="step = 1">Upload a different file</Button>
        <Button :disabled="!importable" @click="step = 4"
          >Continue with {{ importable }} students</Button
        >
      </div>
    </template>

    <template v-else-if="step === 4 && batch">
      <h2 class="text-base font-semibold">5. Confirm import</h2>
      <dl class="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-[13px]">
        <dt class="text-faint">Students</dt>
        <dd>{{ importable }} new students · {{ batch.target }}</dd>
        <dt class="text-faint">Enrollments</dt>
        <dd>{{ importable }} session enrollments and default subject enrollments</dd>
        <dt class="text-faint">Guardians</dt>
        <dd>
          {{ batch.guardiansNew - linkedExtra }} new ·
          {{ batch.guardiansLinked + linkedExtra }} linked to existing parents
        </dd>
        <dt class="text-faint">Invitations</dt>
        <dd>Sent to guardians with a phone or email</dd>
        <dt class="text-faint">Invoices</dt>
        <dd>Not created. Issue them from Finance when ready.</dd>
        <dt class="text-faint">Reversible</dt>
        <dd>
          Imported students can be deactivated, not deleted. The import is logged as one batch.
        </dd>
      </dl>
      <div class="flex justify-between gap-2">
        <Button variant="outline" @click="step = 3">Back</Button>
        <Button @click="runImport">Import {{ importable }} students</Button>
      </div>
    </template>

    <template v-else-if="step === 5">
      <h2 class="text-base font-semibold">6. Importing</h2>
      <Progress :model-value="progress" class="h-2" aria-label="Import progress" />
      <p class="text-[13px] text-muted-foreground">
        {{ progress }}% · Runs in the background. You can leave this page and you’ll be notified
        when it finishes.
      </p>
    </template>

    <template v-else-if="step === 6 && result">
      <InlineNotice
        tone="success"
        :title="`${result.imported} students imported`"
        :description="`Batch ${result.batchId} · ${result.guardiansNew} guardians created · ${result.guardiansLinked} linked · invitations queued.`"
      />
      <div class="flex flex-wrap gap-2">
        <Button as-child
          ><RouterLink :to="{ name: routesPath.students.list.name }"
            >View students</RouterLink
          ></Button
        >
        <Button variant="outline" @click="downloadErrors">Download import report</Button>
        <Button variant="ghost" @click="restart">New import</Button>
      </div>
    </template>
  </section>
</template>
