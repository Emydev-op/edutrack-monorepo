<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { FileSpreadsheetIcon, UploadIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import StepIndicator from '@edutrack/app-kit/components/common/StepIndicator.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { downloadCsv } from '@edutrack/app-kit/lib/csv';

import {
  previewStaffImport,
  useCommitStaffImportMutation,
  useStaffFormOptionsQuery,
} from '@/api/services/staff';
import { routesPath } from '@/router/routes-path';
import type { StaffImportBatch, StaffImportRow } from '@/types';

const STEPS = ['Template', 'Upload', 'Review', 'Import'];
const HEADERS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'type',
  'position',
  'branch',
  'portal_access',
  'role',
];

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const commit = useCommitStaffImportMutation();
const { data: options } = useStaffFormOptionsQuery();

const step = ref(0);
const reading = ref(false);
const uploadError = ref('');
const batch = ref<StaffImportBatch | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const directory = computed(() => ({
  name: routesPath.staff.directory.name,
  query: route.query.from === 'setup' ? { from: 'setup' } : {},
}));

function downloadTemplate() {
  const branch = options.value?.branches[0]?.name ?? 'Main Campus';
  downloadCsv('staff-template.csv', HEADERS, [
    [
      'Grace',
      'Okafor',
      'g.okafor@school.ng',
      '08035550161',
      'Teaching',
      'Teacher',
      branch,
      'yes',
      'Teacher',
    ],
    ['Samuel', 'Ade', '', '08025550199', 'Non-teaching', 'Driver', branch, 'no', ''],
  ]);
  toast.success('Template downloaded. Excel opens it directly.');
}

function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  uploadError.value = '';
  if (!/\.csv$/i.test(file.name))
    return void (uploadError.value = `“${file.name}” isn’t a CSV file. Save your sheet as CSV and try again.`);
  if (file.size > 1048576) return void (uploadError.value = `“${file.name}” is larger than 1 MB.`);
  const reader = new FileReader();
  reading.value = true;
  reader.onload = async () => {
    try {
      batch.value = await previewStaffImport({ fileName: file.name, text: String(reader.result) });
      step.value = 2;
    } catch (e) {
      uploadError.value = getApiErrorMessage(
        e,
        'We couldn’t read that file. Check it uses the template’s columns and try again.',
      );
    } finally {
      reading.value = false;
    }
  };
  reader.onerror = () => {
    reading.value = false;
    uploadError.value = 'We couldn’t open that file. Try again.';
  };
  reader.readAsText(file);
}

const rows = computed(() => batch.value?.rows ?? []);
const valid = computed(() => rows.value.filter((r) => !r.errors.length));
const invalid = computed(() => rows.value.length - valid.value.length);
const invites = computed(() => valid.value.filter((r) => r.access).length);

const rowStatus = (r: StaffImportRow) =>
  r.errors.length
    ? { label: 'Error', tone: 'error' as const, text: r.errors.join('; ') }
    : r.warnings.length
      ? { label: 'Warning', tone: 'warning' as const, text: r.warnings.join('; ') }
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
    title: `Import ${valid.value.length} staff member${valid.value.length === 1 ? '' : 's'}?`,
    details: [
      ['File', b.fileName],
      ['Valid rows', String(valid.value.length)],
      ['Skipped', invalid.value ? `${invalid.value} with errors` : 'None'],
      ['Invitations', invites.value ? `${invites.value} sent by email after import` : 'None'],
    ],
    confirmLabel: `Import ${valid.value.length} row${valid.value.length === 1 ? '' : 's'}`,
    action: async () => {
      step.value = 3;
      try {
        const r = await commit.mutateAsync(b.id);
        toast.success(
          `${r.imported} staff imported.${r.invites ? ` ${r.invites} invitation${r.invites === 1 ? '' : 's'} sent.` : ''}`,
        );
        await router.push(directory.value);
      } catch (e) {
        step.value = 2;
        toast.error(getApiErrorMessage(e, 'The import didn’t finish. Try again.'));
      }
    },
  });
}

const columns: Column[] = [
  { key: 'line', label: 'Line', width: '60px' },
  { key: 'name', label: 'Name', width: 'minmax(160px,1.3fr)' },
  { key: 'kind', label: 'Type', width: '110px' },
  { key: 'position', label: 'Position', width: 'minmax(130px,1fr)' },
  { key: 'branch', label: 'Branch', width: 'minmax(120px,1fr)' },
  { key: 'access', label: 'Portal access', width: '110px' },
  { key: 'status', label: 'Status', width: 'minmax(220px,1.8fr)' },
];
</script>

<template>
  <PageHeader
    title="Import staff"
    description="One row per person. Rows with portal access get an invitation by email after import."
  >
    <template #actions>
      <Button as-child variant="ghost"><RouterLink :to="directory">Cancel</RouterLink></Button>
    </template>
  </PageHeader>

  <StepIndicator :steps="STEPS" :current="step" />

  <section class="flex flex-col gap-4 rounded-lg border bg-card p-5">
    <template v-if="step === 0">
      <h2 class="text-base font-semibold">1. Download the template</h2>
      <p class="text-[13px] text-body">
        Columns: first_name, last_name, email, phone, type (Teaching or Non-teaching), position,
        branch, portal_access (yes or no) and role. Email is needed for portal access.
      </p>
      <div class="flex items-center gap-3 rounded-md border bg-muted px-4 py-3">
        <FileSpreadsheetIcon class="size-5 text-primary" aria-hidden="true" />
        <span class="flex flex-1 flex-col">
          <span class="font-semibold">Staff import template (.csv)</span>
          <span class="text-xs text-muted-foreground">Two example rows to copy</span>
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
          reading ? 'Checking your file…' : 'Choose a CSV file'
        }}</span>
        <span class="text-xs text-muted-foreground">CSV · up to 1 MB</span>
      </button>
      <input
        ref="fileInput"
        type="file"
        accept=".csv,text/csv"
        class="sr-only"
        aria-label="Staff list CSV"
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
          { label: 'Invitations', value: `${invites} will be sent` },
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
        min-width="960px"
        empty-text="The file has no rows."
      >
        <template #cell-kind="{ row }">{{ row.kind || '—' }}</template>
        <template #cell-access="{ row }">{{ row.access ? 'Yes' : 'No' }}</template>
        <template #cell-status="{ row }">
          <span class="flex flex-col gap-0.5">
            <StatusBadge :label="rowStatus(row).label" :tone="rowStatus(row).tone" />
            <span
              v-if="rowStatus(row).text"
              class="text-xs"
              :class="row.errors.length ? 'text-error-strong' : 'text-warning-strong'"
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
