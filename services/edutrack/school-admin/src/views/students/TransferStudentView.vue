<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Textarea } from '@edutrack/ui/components/textarea';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import { useStudentQuery, useTransferMutation } from '@/api/services/students';
import FileUpload from '@/components/school/FileUpload.vue';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';
import { useLayoutStore } from '@/stores/layout';
import type { FileRef } from '@/types';

const REASONS = [
  'Family relocation',
  'Financial reasons',
  'Change of school',
  'Medical',
  'Disciplinary',
  'Other',
];

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const auth = useAuthStore();
const context = useContextStore();
const layout = useLayoutStore();
const id = computed(() => String(route.params.id));
const { data: student, isPending } = useStudentQuery(id);
const transfer = useTransferMutation(id);
watch(student, (s) => layout.setRecordLabel(s ? `${s.name} · Transfer or withdraw` : null), {
  immediate: true,
});

const today = new Date().toISOString().slice(0, 10);
const form = reactive({
  kind: 'Transfer',
  date: today,
  reason: REASONS[0]!,
  destination: '',
  notes: '',
});
const letter = ref<FileRef | null>(null);
const showErrors = ref(false);
const done = ref(false);
useUnsavedChanges(() => !done.value && (!!form.destination || !!form.notes || !!letter.value));

const isTransfer = computed(() => form.kind === 'Transfer');
const errors = computed(() => ({
  date: form.date ? '' : 'Choose the effective date.',
  destination: isTransfer.value && !form.destination.trim() ? 'Enter the destination school' : '',
  letter:
    isTransfer.value && !letter.value
      ? 'A transfer letter is required by your school settings.'
      : '',
}));
const err = (k: keyof typeof errors.value) => (showErrors.value ? errors.value[k] : '');

function submit() {
  showErrors.value = true;
  if (Object.values(errors.value).some(Boolean)) return;
  const s = student.value!;
  const kind = form.kind.toLowerCase();
  void confirm({
    title: `Record ${kind} for ${s.name}?`,
    details: [
      [
        'Effective',
        new Date(form.date).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
      ],
      ['Enrollment', `${context.current.session} · ${s.className} ends on the effective date`],
      [
        'Status',
        `Changes to ${isTransfer.value ? 'Transferred' : 'Withdrawn'}. Nothing is deleted.`,
      ],
      ['Notifications', 'Guardian and class teacher are notified'],
      ['Authorised by', `${auth.fullName} · students.edit`],
    ],
    confirmLabel: `Record ${kind}`,
    action: async () => {
      await transfer.mutateAsync({
        kind: form.kind as 'Transfer' | 'Withdrawal',
        date: form.date,
        reason: form.reason,
        destination: form.destination,
        notes: form.notes,
        document: letter.value?.name ?? null,
      });
      done.value = true;
      toast.success(`${form.kind} recorded for ${s.name}.`);
      await router.push({ name: routesPath.students.detail.name, params: { id: s.id } });
    },
  });
}
</script>

<template>
  <Skeleton v-if="isPending" class="h-96" />
  <template v-else-if="student">
    <PageHeader
      :title="`Transfer or withdraw ${student.name}`"
      :description="`Ends the current enrollment (${context.current.session} · ${student.className}). The student record, results and payments stay on file.`"
    />
    <InlineNotice
      v-if="student.exit"
      tone="neutral"
      :title="`${student.exit.kind} already recorded`"
      :description="`Effective ${student.exit.date}.`"
    />
    <div v-else class="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <SectionCard>
        <div class="flex flex-col gap-4.5">
          <ChoiceCards
            v-model="form.kind"
            label="Type"
            :columns="2"
            :choices="[
              { value: 'Transfer', label: 'Transfer', description: 'Moving to another school' },
              {
                value: 'Withdrawal',
                label: 'Withdrawal',
                description: 'Leaving without a destination school',
              },
            ]"
          />
          <div class="grid gap-4 sm:grid-cols-2">
            <FieldShell id="tr-date" label="Effective date" required :error="err('date')">
              <Input id="tr-date" v-model="form.date" type="date" />
            </FieldShell>
            <FieldShell id="tr-reason" label="Reason">
              <select
                id="tr-reason"
                v-model="form.reason"
                class="h-9 rounded-md border bg-card px-2.5 text-sm"
              >
                <option v-for="r in REASONS" :key="r">{{ r }}</option>
              </select>
            </FieldShell>
            <FieldShell
              v-if="isTransfer"
              id="tr-dest"
              label="Destination school"
              required
              class="sm:col-span-2"
              :error="err('destination')"
            >
              <Input
                id="tr-dest"
                v-model="form.destination"
                placeholder="e.g. Loyola Jesuit College, Abuja"
                :aria-invalid="!!err('destination')"
              />
            </FieldShell>
            <FieldShell id="tr-notes" label="Notes" class="sm:col-span-2">
              <Textarea
                id="tr-notes"
                v-model="form.notes"
                rows="3"
                placeholder="Anything the class teacher or finance should know"
              />
            </FieldShell>
          </div>
          <FileUpload
            v-model="letter"
            title="Supporting document"
            :hint="
              isTransfer
                ? 'Transfer letter · PDF, JPG or PNG up to 5 MB · required'
                : 'Optional · PDF, JPG or PNG up to 5 MB'
            "
            accept="application/pdf,image/png,image/jpeg"
            type-label="PDF, JPG or PNG"
            :max-bytes="5242880"
          />
          <p v-if="err('letter')" role="alert" class="-mt-2 text-xs text-destructive">
            {{ err('letter') }}
          </p>
          <div class="flex justify-end gap-2 border-t border-divider pt-4">
            <Button as-child variant="ghost"
              ><RouterLink
                :to="{ name: routesPath.students.detail.name, params: { id: student.id } }"
                >Cancel</RouterLink
              ></Button
            >
            <Button @click="submit">Review and record</Button>
          </div>
        </div>
      </SectionCard>
      <aside class="flex flex-col gap-2 rounded-lg border bg-muted px-4 py-3.5 text-[13px]">
        <span class="font-semibold">What happens</span>
        <p>
          The {{ context.current.session }} enrollment ends on the effective date and the student’s
          status changes. Nothing is deleted. Results, invoices, payments and documents stay on the
          student’s record.
        </p>
        <p>
          {{
            student.balance
              ? `Outstanding balance ${formatNaira(student.balance)} stays on the account. It does not block the transfer unless your school turns that rule on.`
              : 'No outstanding balance.'
          }}
        </p>
        <p class="text-muted-foreground">
          Recorded by {{ auth.fullName }} and written to the audit log.
        </p>
      </aside>
    </div>
  </template>
</template>
