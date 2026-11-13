<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { toTypedSchema } from '@vee-validate/yup';
import { useForm } from 'vee-validate';
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import * as yup from 'yup';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormSelect from '@edutrack/app-kit/components/form/FormSelect.vue';
import FormTextarea from '@edutrack/app-kit/components/form/FormTextarea.vue';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import { useCreateTicketMutation } from '@/api/services/support';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import {
  TICKET_CATEGORIES,
  TICKET_LIMITS,
  TICKET_PRIORITIES,
  type TicketAttachment,
  type TicketCategory,
  type TicketPriority,
} from '@/types';

import AttachmentPicker from './AttachmentPicker.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const create = useCreateTicketMutation();

/** Other pages link here with the ticket pre-filled, e.g. Settings → "Buy SMS credit". */
const q = (key: string) => {
  const raw = route.query[key];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
};
const pick = <T extends string>(value: string, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;
const followUpOf = /^SUP-\d+$/.test(q('followUp')) ? q('followUp') : '';

const initial = {
  category: pick<TicketCategory>(q('category'), TICKET_CATEGORIES, 'Something else'),
  priority: pick<TicketPriority>(q('priority'), TICKET_PRIORITIES, 'Normal'),
  subject: q('subject').slice(0, TICKET_LIMITS.subject),
  description: q('description').slice(0, TICKET_LIMITS.text),
};

const schema = toTypedSchema(
  yup.object({
    category: yup
      .mixed<TicketCategory>()
      .oneOf([...TICKET_CATEGORIES], 'Choose a category.')
      .required('Choose a category.'),
    priority: yup
      .mixed<TicketPriority>()
      .oneOf([...TICKET_PRIORITIES], 'Choose a priority.')
      .required('Choose a priority.'),
    subject: yup
      .string()
      .trim()
      .required('Add a short subject.')
      .max(TICKET_LIMITS.subject, `Keep the subject to ${TICKET_LIMITS.subject} characters.`),
    description: yup
      .string()
      .trim()
      .required('Describe the problem.')
      .min(
        TICKET_LIMITS.descriptionMin,
        `Describe the problem in at least ${TICKET_LIMITS.descriptionMin} characters so support can act on it.`,
      )
      .max(TICKET_LIMITS.text, `Keep the description to ${TICKET_LIMITS.text} characters.`),
  }),
);

const { handleSubmit, meta, values } = useForm({
  validationSchema: schema,
  initialValues: initial,
});
const attachments = ref<TicketAttachment[]>([]);
const serverError = ref('');
const submitted = ref(false);

useUnsavedChanges(() => !submitted.value && (meta.value.dirty || attachments.value.length > 0));

const priorityOptions = [
  { value: 'Normal', label: 'Normal' },
  { value: 'High', label: 'High: something important is affected' },
  { value: 'Urgent', label: 'Urgent: the school can’t operate' },
];
const descriptionCount = computed(() => (values.description ?? '').trim().length);

const submit = handleSubmit(async (v) => {
  serverError.value = '';
  try {
    const ticket = await create.mutateAsync({
      category: v.category,
      priority: v.priority,
      subject: v.subject,
      description: v.description,
      attachments: attachments.value,
      ...(followUpOf && { followUpOf }),
    });
    submitted.value = true;
    toast.success(`${ticket.id} created. Support will reply on the ticket.`);
    await router.replace({ name: routesPath.supportTicket.name, params: { id: ticket.id } });
  } catch (e) {
    serverError.value = `${getApiErrorMessage(e)} Your text is kept, so you can try again.`;
  }
});
</script>

<template>
  <PageHeader
    title="New support ticket"
    description="Goes to the EduTrack platform support team. Include what you expected and what happened."
  />

  <form class="flex max-w-[760px] flex-col gap-4" novalidate @submit.prevent="submit">
    <InlineNotice
      v-if="followUpOf"
      tone="info"
      :title="`Follow-up to ${followUpOf}`"
      description="Support will see the earlier conversation alongside this ticket."
    />
    <InlineNotice
      v-if="serverError"
      tone="error"
      title="We couldn’t submit your ticket"
      :description="serverError"
      role="alert"
    />

    <SectionCard title="Ticket">
      <div class="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <FormSelect name="category" label="Category" required :options="TICKET_CATEGORIES" />
        <FormSelect name="priority" label="Priority" required :options="priorityOptions" />
        <FormInput
          name="subject"
          label="Subject"
          required
          class="sm:col-span-2"
          placeholder="e.g. Parents not receiving payment receipts"
          :hint="`Up to ${TICKET_LIMITS.subject} characters`"
        />
        <FormTextarea
          name="description"
          label="Description"
          required
          class="sm:col-span-2"
          :rows="7"
          placeholder="Steps you took, the classes or students affected, and any error message"
          :hint="`${descriptionCount} characters · at least ${TICKET_LIMITS.descriptionMin}`"
        />
      </div>
      <div class="mt-4 flex flex-col gap-1.5">
        <span class="text-[13px] font-medium">Attachments</span>
        <AttachmentPicker v-model="attachments" :disabled="create.isPending.value" />
      </div>
    </SectionCard>

    <p class="text-xs text-muted-foreground">
      Raised by {{ auth.fullName }} for {{ auth.school?.name }}. Replies appear on the ticket and in
      your notifications.
    </p>

    <div class="flex flex-wrap gap-2">
      <Button type="submit" :disabled="create.isPending.value">{{
        create.isPending.value ? 'Submitting…' : 'Submit ticket'
      }}</Button>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.support.name }">Cancel</RouterLink></Button
      >
    </div>
  </form>
</template>
