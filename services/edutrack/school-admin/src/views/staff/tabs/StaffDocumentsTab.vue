<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';

import {
  useUploadStaffDocumentMutation,
  useVerifyStaffDocumentMutation,
} from '@/api/services/staff';
import FileUpload from '@/components/school/FileUpload.vue';
import type { FileRef, StaffDetail } from '@/types';

import { staffTone } from '../staff-tones';

const KINDS = [
  'Employment letter',
  'Teaching certificate (TRCN)',
  'Guarantor form',
  'CV',
  'ID card',
  'Other',
];

const props = defineProps<{ staff: StaffDetail }>();
const id = computed(() => props.staff.id);
const upload = useUploadStaffDocumentMutation(id);
const verify = useVerifyStaffDocumentMutation(id);

const kind = ref(KINDS[0]!);
const file = ref<FileRef | null>(null);

const columns: Column[] = [
  { key: 'kind', label: 'Document', width: 'minmax(200px,1.4fr)' },
  { key: 'name', label: 'File', width: 'minmax(180px,1.2fr)' },
  { key: 'uploaded', label: 'Uploaded', width: '120px' },
  { key: 'status', label: 'Status', width: '120px' },
  { key: 'action', label: '', width: '100px', align: 'right' },
];

/* Uploading happens as soon as a file is picked, for the chosen document type. */
watch(file, async (f) => {
  if (!f) return;
  try {
    await upload.mutateAsync({ kind: kind.value, name: f.name });
    toast.success(`${kind.value} uploaded. Verify it once you’ve checked it.`);
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'We couldn’t upload the document. Try again.'));
  } finally {
    file.value = null;
  }
});

async function onVerify(docId: string, label: string) {
  try {
    await verify.mutateAsync(docId);
    toast.success(`${label} verified.`);
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'We couldn’t verify the document. Try again.'));
  }
}
</script>

<template>
  <DataTable
    title="Documents"
    description="Employment records kept on file. Uploads stay Pending until someone checks them."
    :columns="columns"
    :rows="staff.documents"
    :row-key="(d) => d.id"
    empty-text="No documents on file yet."
  >
    <template #cell-kind="{ row }"
      ><span class="font-medium">{{ row.kind }}</span></template
    >
    <template #cell-name="{ row }"
      ><span :class="row.name ? '' : 'text-faint'">{{ row.name || 'Not uploaded' }}</span></template
    >
    <template #cell-status="{ row }"
      ><StatusBadge :label="row.status" :tone="staffTone(row.status)"
    /></template>
    <template #cell-action="{ row }">
      <Button
        v-if="row.status === 'Pending'"
        variant="outline"
        size="sm"
        :disabled="verify.isPending.value"
        @click="onVerify(row.id, row.kind)"
        >Verify</Button
      >
    </template>
  </DataTable>

  <SectionCard
    v-if="staff.status === 'Active'"
    title="Upload a document"
    description="A new upload replaces the file for the same document type."
  >
    <div class="grid items-start gap-4 sm:grid-cols-[240px_1fr]">
      <FieldShell id="doc-kind" label="Document type">
        <select id="doc-kind" v-model="kind" class="h-9 rounded-md border bg-card px-2.5 text-sm">
          <option v-for="k in KINDS" :key="k">{{ k }}</option>
        </select>
      </FieldShell>
      <FileUpload
        v-model="file"
        :title="kind"
        hint="PDF, JPG or PNG up to 5 MB"
        accept="application/pdf,image/png,image/jpeg"
        type-label="PDF, JPG or PNG"
        :max-bytes="5242880"
      />
    </div>
  </SectionCard>
</template>
