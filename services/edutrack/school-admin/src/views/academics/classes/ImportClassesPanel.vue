<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { FileSpreadsheetIcon, UploadIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { toast } from 'vue-sonner';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import StepIndicator from '@edutrack/app-kit/components/common/StepIndicator.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  previewClassImport,
  useCommitClassImportMutation,
  type ClassImportBatch,
  type ClassImportRow,
} from '@/api/services/academics';
import { downloadFile } from '@/api/helpers';
import { readImportFile } from '@/lib/import-file';

/**
 * Bulk upload of classes and arms (the Classes page's Add › Bulk upload): download the template,
 * upload it, review each row, import. A class level new to a branch is added with its arms.
 */
const STEPS = ['Template', 'Upload', 'Review', 'Import'];
const emit = defineEmits<{ done: [] }>();
const confirm = useConfirm();
const commit = useCommitClassImportMutation();

const step = ref(0);
const reading = ref(false);
const uploadError = ref('');
const batch = ref<ClassImportBatch | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

async function downloadTemplate() {
  try {
    await downloadFile('/v1/academics/classes/import/template', 'edutrack-classes-template.xlsx');
    toast.success('Template downloaded. Choose the branch and section from the dropdowns.');
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'The template couldn’t be downloaded. Try again.'));
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
  if (file.size > 2 * 1048576)
    return void (uploadError.value = `“${file.name}” is larger than 2 MB.`);
  reading.value = true;
  try {
    batch.value = await previewClassImport({
      fileName: file.name,
      text: await readImportFile(file),
    });
    step.value = 2;
  } catch (e) {
    uploadError.value = getApiErrorMessage(
      e,
      'We couldn’t read that file. Check it uses the template’s columns and try again.',
    );
  } finally {
    reading.value = false;
  }
}

const rows = computed(() => batch.value?.rows ?? []);
const valid = computed(() => rows.value.filter((r) => !r.errors.length));
const invalid = computed(() => rows.value.length - valid.value.length);
const newLevels = computed(
  () => new Set(valid.value.filter((r) => r.newLevel).map((r) => `${r.branch}|${r.level}`)).size,
);

const rowStatus = (r: ClassImportRow) =>
  r.errors.length
    ? { label: 'Error', tone: 'error' as const, text: r.errors.join('; ') }
    : r.warnings.length
      ? { label: 'New level', tone: 'info' as const, text: r.warnings.join('; ') }
      : { label: 'Ready', tone: 'success' as const, text: '' };

function restart() {
  batch.value = null;
  uploadError.value = '';
  step.value = 1;
}

function importRows() {
  const b = batch.value!;
  if (!valid.value.length)
    return void confirm({
      title: 'Nothing to import',
      description: 'Every row has an error. Fix the file and upload it again.',
      confirmLabel: 'OK',
    });
  void confirm({
    title: `Import ${valid.value.length} arm${valid.value.length === 1 ? '' : 's'}?`,
    details: [
      ['File', b.fileName],
      ['Arms', String(valid.value.length)],
      ['New class levels', newLevels.value ? String(newLevels.value) : 'None'],
      ['Skipped', invalid.value ? `${invalid.value} with errors` : 'None'],
    ],
    confirmLabel: `Import ${valid.value.length} row${valid.value.length === 1 ? '' : 's'}`,
    action: async () => {
      step.value = 3;
      try {
        const r = await commit.mutateAsync(b.id);
        if (r.problems.length)
          toast.warning(
            `${r.problems.length} row${r.problems.length === 1 ? '' : 's'} couldn’t be added: ${r.problems
              .slice(0, 3)
              .map((p) => `line ${p.line}, ${p.reason}`)
              .join(' · ')}`,
          );
        toast.success(messageOf(r, `${r.imported} arms imported.`));
        emit('done');
      } catch (e) {
        step.value = 2;
        toast.error(getApiErrorMessage(e, 'The import didn’t finish. Try again.'));
      }
    },
  });
}

const columns: Column[] = [
  { key: 'line', label: 'Line', width: '60px' },
  { key: 'branch', label: 'Branch', width: 'minmax(120px,1fr)' },
  { key: 'section', label: 'Section', width: 'minmax(130px,1fr)' },
  { key: 'class', label: 'Class', width: 'minmax(110px,1fr)' },
  { key: 'capacity', label: 'Places', width: '80px' },
  { key: 'classTeacher', label: 'Class teacher', width: 'minmax(140px,1fr)' },
  { key: 'status', label: 'Status', width: 'minmax(220px,1.8fr)' },
];
</script>

<template>
  <StepIndicator :steps="STEPS" :current="step" />

  <section class="flex flex-col gap-4 rounded-lg border bg-card p-5">
    <template v-if="step === 0">
      <h2 class="text-base font-semibold">1. Download the template</h2>
      <p class="text-[13px] text-body">
        One row per arm: branch, section, class_level (e.g. JSS 1), arm (e.g. A), capacity, room and
        class_teacher (their email or staff number). A class level the branch doesn’t have yet is
        added.
      </p>
      <div class="flex items-center gap-3 rounded-md border bg-muted px-4 py-3">
        <FileSpreadsheetIcon class="size-5 text-primary" aria-hidden="true" />
        <span class="flex flex-1 flex-col">
          <span class="font-semibold">Classes and arms template (.xlsx)</span>
          <span class="text-xs text-muted-foreground">Branch and section dropdowns</span>
        </span>
        <Button variant="outline" size="sm" @click="downloadTemplate">Download template</Button>
      </div>
      <div class="flex justify-end">
        <Button @click="step = 1">I’ve filled the template</Button>
      </div>
    </template>

    <template v-else-if="step === 1">
      <h2 class="text-base font-semibold">2. Upload your file</h2>
      <button
        type="button"
        class="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors hover:border-primary disabled:opacity-60"
        :disabled="reading"
        @click="fileInput?.click()"
      >
        <UploadIcon class="size-6 text-primary" aria-hidden="true" />
        <span class="font-semibold">{{
          reading ? 'Checking your file…' : 'Choose the filled template'
        }}</span>
        <span class="text-xs text-muted-foreground">.xlsx or .csv · up to 2 MB</span>
      </button>
      <input
        ref="fileInput"
        type="file"
        accept=".xlsx,.csv"
        class="sr-only"
        aria-label="Classes and arms file"
        @change="onFile"
      />
      <p v-if="uploadError" role="alert" class="text-xs text-destructive">{{ uploadError }}</p>
      <div class="flex justify-between">
        <Button variant="ghost" @click="step = 0">Back</Button>
      </div>
    </template>

    <template v-else-if="batch">
      <h2 class="text-base font-semibold">3. Review</h2>
      <KeyValueCard
        title="Summary"
        :rows="[
          { label: 'File', value: batch.fileName },
          { label: 'Rows', value: String(rows.length) },
          { label: 'Valid', value: String(valid.length) },
          { label: 'With errors', value: String(invalid) },
          { label: 'New class levels', value: String(newLevels) },
        ]"
      />
      <InlineNotice
        v-if="invalid"
        tone="error"
        :title="`${invalid} row${invalid > 1 ? 's have' : ' has'} errors`"
        description="Rows with errors are skipped. Fix them in your file and upload it again, or import the valid rows now."
      />
      <DataTable
        :columns="columns"
        :rows="rows"
        :row-key="(r) => String(r.line)"
        min-width="900px"
        empty-text="The file has no rows."
      >
        <template #cell-class="{ row }">{{ row.level }} {{ row.arm }}</template>
        <template #cell-classTeacher="{ row }">{{ row.classTeacher || '—' }}</template>
        <template #cell-status="{ row }">
          <span class="flex flex-col gap-0.5">
            <StatusBadge :label="rowStatus(row).label" :tone="rowStatus(row).tone" />
            <span
              v-if="rowStatus(row).text"
              class="text-xs"
              :class="row.errors.length ? 'text-error-strong' : 'text-muted-foreground'"
              >{{ rowStatus(row).text }}</span
            >
          </span>
        </template>
      </DataTable>
      <div class="flex justify-between gap-2 border-t border-divider pt-4">
        <Button variant="ghost" @click="restart">Upload a different file</Button>
        <Button :disabled="commit.isPending.value || step === 3" @click="importRows">
          Import {{ valid.length }} valid row{{ valid.length === 1 ? '' : 's' }}
        </Button>
      </div>
    </template>
  </section>
</template>
