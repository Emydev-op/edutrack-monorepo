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
import { Textarea } from '@edutrack/ui/components/textarea';
import { getApiErrorCode, getApiErrorFields, getApiErrorMessage } from '@edutrack/web-core/http';
import { useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';

import { useMoveApplicationMutation } from '@/api/services/students';
import { queryKeys } from '@/api/query-keys';
import type { ApplicationDetail, ApplicationStage, ApplicationStagePayload } from '@/types';

import { todayIso } from './application-format';

/** Moves an application to another stage, asking only for what that stage records. */
const props = defineProps<{
  application: ApplicationDetail;
  stage: ApplicationStage;
  /** The button that opened it, e.g. "Send offer". */
  label: string;
}>();
const open = defineModel<boolean>('open', { required: true });

const qc = useQueryClient();
const move = useMoveApplicationMutation();

const form = reactive({ note: '', assessmentOn: '', assessmentResult: '', offerExpiresOn: '' });
const fields = ref<Record<string, string>>({});
const serverError = ref('');
const showErrors = ref(false);

const needsReason = computed(() => props.stage === 'Rejected' || props.stage === 'Declined');
const name = computed(() => props.application.firstName || props.application.applicant);

const copy = computed(() => {
  const a = props.application;
  switch (props.stage) {
    case 'Under review':
      return {
        title: `${props.label} · ${a.applicant}`,
        description: 'Record the assessment or interview if there is one. You can add it later.',
        confirm: props.label,
      };
    case 'Offer sent':
      return {
        title: `Send an offer to ${a.guardianName || 'the family'}`,
        description: `Offers ${name.value} a place in ${a.level} at ${a.branch}. Set a date the family should accept by.`,
        confirm: 'Send offer',
      };
    case 'Offer accepted':
      return {
        title: 'Mark the offer accepted?',
        description: `${a.guardianName || 'The family'} accepted the place. You can then admit ${name.value}.`,
        confirm: 'Mark accepted',
      };
    case 'Rejected':
      return {
        title: `Reject ${a.applicant}’s application?`,
        description: 'The reason is kept on the application. You can reopen it later.',
        confirm: 'Reject application',
      };
    case 'Declined':
      return {
        title: 'Record that the family declined?',
        description: `${a.guardianName || 'The family'} turned the offer down. The reason is kept on the application.`,
        confirm: 'Record decline',
      };
    default:
      return {
        title: `${props.label} · ${a.applicant}`,
        description: `Moves the application to ${props.stage}.`,
        confirm: props.label,
      };
  }
});

watch(
  open,
  (o) => {
    if (!o) return;
    const a = props.application;
    Object.assign(form, {
      note: '',
      assessmentOn: a.assessmentOn ?? '',
      assessmentResult: a.assessmentResult ?? '',
      offerExpiresOn: '',
    });
    fields.value = {};
    serverError.value = '';
    showErrors.value = false;
  },
  { immediate: true },
);
watch(form, () => (fields.value = {}));

const errors = computed(() => {
  const e: Record<string, string> = { ...fields.value };
  if (needsReason.value && !form.note.trim())
    e.note ??=
      props.stage === 'Rejected'
        ? 'Say why the application is rejected'
        : 'Say why the family declined';
  if (props.stage === 'Offer sent' && form.offerExpiresOn && form.offerExpiresOn < todayIso())
    e.offerExpiresOn ??= 'Choose today or a later date';
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);

async function submit() {
  showErrors.value = true;
  serverError.value = '';
  if (Object.keys(errors.value).length) return;
  const payload: ApplicationStagePayload = { stage: props.stage };
  if (form.note.trim()) payload.note = form.note.trim();
  if (props.stage === 'Under review') {
    if (form.assessmentOn) payload.assessmentOn = form.assessmentOn;
    if (form.assessmentResult.trim()) payload.assessmentResult = form.assessmentResult.trim();
  }
  if (props.stage === 'Offer sent' && form.offerExpiresOn)
    payload.offerExpiresOn = form.offerExpiresOn;
  try {
    await move.mutateAsync({ id: props.application.id, ...payload });
    toast.success(`${props.application.applicant}’s application moved to ${props.stage}.`);
    open.value = false;
  } catch (e) {
    const fe = getApiErrorFields(e);
    if (Object.keys(fe).length) {
      fields.value = fe;
      return;
    }
    const code = getApiErrorCode(e);
    if (code === 'APPLICATION_CHANGED' || code === 'STAGE_NOT_ALLOWED') {
      void qc.invalidateQueries({ queryKey: queryKeys.admissions.all });
      serverError.value = getApiErrorMessage(
        e,
        'Someone else changed this application. It’s been refreshed. Check it and try again.',
      );
      return;
    }
    serverError.value = getApiErrorMessage(
      e,
      'The server didn’t respond. Nothing was changed. Try again.',
    );
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[480px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">{{ copy.title }}</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">{{
          copy.description
        }}</DialogDescription>
      </div>

      <form class="flex min-h-0 flex-col gap-4 overflow-y-auto" novalidate @submit.prevent="submit">
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="We couldn’t move this application"
          :description="serverError"
          role="alert"
        />

        <div v-if="stage === 'Under review'" class="grid gap-4 sm:grid-cols-2">
          <FieldShell id="st-assess-on" label="Assessment date" :error="err('assessmentOn')">
            <Input
              id="st-assess-on"
              v-model="form.assessmentOn"
              type="date"
              :aria-invalid="!!err('assessmentOn')"
            />
          </FieldShell>
          <FieldShell id="st-assess-result" label="Result" :error="err('assessmentResult')">
            <Input
              id="st-assess-result"
              v-model="form.assessmentResult"
              maxlength="60"
              placeholder="e.g. 68% or Passed"
              :aria-invalid="!!err('assessmentResult')"
            />
          </FieldShell>
        </div>

        <FieldShell
          v-if="stage === 'Offer sent'"
          id="st-offer-by"
          label="Accept by"
          :error="err('offerExpiresOn')"
          hint="Leave empty if the offer stays open."
        >
          <Input
            id="st-offer-by"
            v-model="form.offerExpiresOn"
            type="date"
            :min="todayIso()"
            :aria-invalid="!!err('offerExpiresOn')"
          />
        </FieldShell>

        <FieldShell
          id="st-note"
          :label="needsReason ? 'Reason' : 'Note'"
          :required="needsReason"
          :error="err('note')"
          :hint="needsReason ? 'Kept on the application’s history.' : 'Optional.'"
        >
          <Textarea
            id="st-note"
            v-model="form.note"
            rows="3"
            maxlength="500"
            :placeholder="
              stage === 'Rejected'
                ? 'e.g. No space in JSS 1 for Second Term'
                : stage === 'Declined'
                  ? 'e.g. Family chose another school'
                  : undefined
            "
            :aria-invalid="!!err('note')"
          />
        </FieldShell>

        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button
            type="submit"
            :variant="stage === 'Rejected' ? 'destructive' : 'default'"
            :disabled="move.isPending.value"
          >
            <Spinner v-if="move.isPending.value" />
            {{ copy.confirm }}
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
