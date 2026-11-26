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
import { pluralize } from '@edutrack/app-kit/lib/format';

import {
  previewRoomImport,
  ROOM_TEMPLATE_URL,
  useCommitRoomImportMutation,
} from '@/api/services/boarding';
import { downloadFile } from '@/api/helpers';
import { readImportFile } from '@/lib/import-file';
import type { RoomImportBatch, RoomImportRow } from '@/types';

import { bedSummary } from './boarding-format';

/**
 * Bulk upload of hostel rooms: download the template, upload it, review each row, import. A
 * hostel or floor that doesn't exist yet is added.
 */
const STEPS = ['Template', 'Upload', 'Review', 'Import'];
const emit = defineEmits<{ done: [] }>();
const confirm = useConfirm();
const commit = useCommitRoomImportMutation();

const step = ref(0);
const reading = ref(false);
const uploadError = ref('');
const batch = ref<RoomImportBatch | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

async function downloadTemplate() {
  try {
    await downloadFile(ROOM_TEMPLATE_URL, 'edutrack-hostel-rooms-template.xlsx');
    toast.success('Template downloaded. Choose the campus and gender from the dropdowns.');
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
    batch.value = await previewRoomImport({
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
const newHostels = computed(
  () => new Set(valid.value.filter((r) => r.newHostel).map((r) => `${r.campus}|${r.hostel}`)).size,
);
const newFloors = computed(
  () =>
    new Set(valid.value.filter((r) => r.newFloor).map((r) => `${r.campus}|${r.hostel}|${r.floor}`))
      .size,
);
const places = computed(() => valid.value.reduce((n, r) => n + r.capacity, 0));

const rowStatus = (r: RoomImportRow) =>
  r.errors.length
    ? { label: 'Error', tone: 'error' as const, text: r.errors.join('; ') }
    : r.warnings.length
      ? { label: 'Check', tone: 'warning' as const, text: r.warnings.join('; ') }
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
    title: `Import ${pluralize(valid.value.length, 'room')}?`,
    details: [
      ['File', b.fileName],
      ['Rooms', String(valid.value.length)],
      ['Places', String(places.value)],
      ['New hostels', newHostels.value ? String(newHostels.value) : 'None'],
      ['New floors', newFloors.value ? String(newFloors.value) : 'None'],
      ['Skipped', invalid.value ? `${invalid.value} with errors` : 'None'],
    ],
    confirmLabel: `Import ${pluralize(valid.value.length, 'room')}`,
    action: async () => {
      step.value = 3;
      try {
        const r = await commit.mutateAsync(b.id);
        if (r.problems.length)
          toast.warning(
            `${pluralize(r.problems.length, 'row')} couldn’t be added: ${r.problems.slice(0, 3).join(' · ')}`,
          );
        toast.success(
          messageOf(
            r,
            `${pluralize(r.imported, 'room')} imported${r.hostels ? `, with ${pluralize(r.hostels, 'new hostel')}` : ''}.`,
          ),
        );
        emit('done');
      } catch (e) {
        step.value = 2;
        toast.error(getApiErrorMessage(e, 'The import didn’t finish. Try again.'));
      }
    },
  });
}

const columns: Column[] = [
  { key: 'line', label: 'Line', width: '56px' },
  { key: 'campus', label: 'Campus', width: 'minmax(110px,1fr)' },
  { key: 'hostel', label: 'Hostel', width: 'minmax(150px,1.2fr)' },
  { key: 'floor', label: 'Floor', width: 'minmax(110px,0.9fr)' },
  { key: 'room', label: 'Room', width: 'minmax(110px,0.9fr)' },
  { key: 'capacity', label: 'Places', width: 'minmax(110px,0.8fr)' },
  { key: 'status', label: 'Status', width: 'minmax(200px,1.6fr)' },
];
</script>

<template>
  <StepIndicator :steps="STEPS" :current="step" />

  <section class="flex flex-col gap-4 rounded-lg border bg-card p-5">
    <template v-if="step === 0">
      <h2 class="text-base font-semibold">1. Download the template</h2>
      <p class="text-[13px] text-body">
        One row per room: campus, hostel, gender (Boys, Girls or Mixed), floor (optional, e.g.
        Ground floor or East wing), room, places and beds (optional: “numbers”, “letters”, or one
        label per place separated by commas). A hostel or floor that doesn’t exist yet is added.
      </p>
      <div class="flex items-center gap-3 rounded-md border bg-muted px-4 py-3">
        <FileSpreadsheetIcon class="size-5 text-primary" aria-hidden="true" />
        <span class="flex flex-1 flex-col">
          <span class="font-semibold">Hostel rooms template (.xlsx)</span>
          <span class="text-xs text-muted-foreground">Campus and gender dropdowns</span>
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
        aria-label="Hostel rooms file"
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
          { label: 'Places', value: String(places) },
          { label: 'New hostels', value: String(newHostels) },
          { label: 'New floors', value: String(newFloors) },
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
        min-width="880px"
        empty-text="The file has no rows."
      >
        <template #cell-hostel="{ row }">
          <span class="flex flex-col gap-0.5">
            <span>{{ row.hostel }}</span>
            <span class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {{ row.gender }}
              <StatusBadge v-if="row.newHostel" label="New hostel" tone="info" />
            </span>
          </span>
        </template>
        <template #cell-floor="{ row }">
          <span class="flex flex-col gap-0.5">
            <span>{{ row.floor || '—' }}</span>
            <StatusBadge v-if="row.newFloor" label="New floor" tone="info" />
          </span>
        </template>
        <template #cell-capacity="{ row }">
          <span class="flex flex-col">
            <span class="tabular-nums">{{ row.capacity }}</span>
            <span v-if="row.beds.length" class="text-xs text-muted-foreground">{{
              bedSummary(row.beds)
            }}</span>
          </span>
        </template>
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
