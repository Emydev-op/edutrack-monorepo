<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { PaperclipIcon, XIcon } from '@lucide/vue';
import { useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { messageOf } from '@edutrack/web-core/http';
import { toast } from 'vue-sonner';

import { useSchoolsQuery } from '@/api/services/schools';
import { useCreateIssueMutation, useSupportAgentsQuery } from '@/api/services/support';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormSelect from '@edutrack/app-kit/components/form/FormSelect.vue';
import FormTextarea from '@edutrack/app-kit/components/form/FormTextarea.vue';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';
import { routesPath } from '@/router/routes-path';
import { createIssueSchema } from '@/schema/support';
import { ISSUE_CATEGORIES, ISSUE_PRIORITIES } from '@/types';

const MAX_ATTACHMENT = 10 * 1024 * 1024;

const route = useRoute();
const router = useRouter();
const { data: schools } = useSchoolsQuery({ pageSize: 100 });
const create = useCreateIssueMutation();
const { data: agents } = useSupportAgentsQuery();
const ownerOptions = computed(() => [
  { value: 'Unassigned', label: 'Unassigned · goes to the team’s queue' },
  ...(agents.value ?? []).map((a) => ({
    value: a.id,
    label: `${a.name} · ${a.team ?? 'No team'} · ${a.open} open`,
  })),
]);

const preselected = (route.query.school as string | undefined) ?? '';
const { handleSubmit, setFieldValue, values, meta } = useForm({
  validationSchema: createIssueSchema,
  initialValues: {
    schoolId: preselected,
    requester: '',
    subject: '',
    category: 'Technical' as const,
    priority: 'Normal' as const,
    assignee: 'Unassigned',
    description: '',
  },
});

const schoolOptions = computed(() =>
  (schools.value?.data ?? []).map((s) => ({ value: s.id, label: s.name })),
);
watch(
  () => values.schoolId,
  (id) => {
    const school = schools.value?.data.find((s) => s.id === id);
    if (school && !values.requester)
      setFieldValue('requester', `${school.admin.replace(/ \(.*\)$/, '')} · School Admin`);
  },
);
watch(
  schoolOptions,
  (options) => !values.schoolId && options[0] && setFieldValue('schoolId', options[0].value),
  { immediate: true },
);

const attachment = ref<File | null>(null);
const attachmentError = ref('');
function pickFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  attachmentError.value = '';
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'application/pdf'].includes(file.type)) {
    attachmentError.value = `“${file.name}” isn’t a PNG, JPG or PDF.`;
    return;
  }
  if (file.size > MAX_ATTACHMENT) {
    attachmentError.value = `“${file.name}” is ${(file.size / 1048576).toFixed(1)} MB. The limit is 10 MB.`;
    return;
  }
  attachment.value = file;
}

/** The API takes the file as a data URL. */
const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Couldn’t read the file.'));
    reader.readAsDataURL(file);
  });

const submitted = ref(false);
useUnsavedChanges(() => meta.value.dirty && !submitted.value);

const submit = handleSubmit(async (v) => {
  const issue = await create.mutateAsync({
    schoolId: v.schoolId,
    requester: v.requester,
    subject: v.subject,
    description: v.description,
    category: v.category,
    priority: v.priority,
    assignee: v.assignee === 'Unassigned' ? null : (v.assignee ?? null),
    attachment: attachment.value ? await readAsDataUrl(attachment.value) : null,
    attachmentName: attachment.value?.name,
  });
  submitted.value = true;
  toast.success(messageOf(issue, `${issue.id} created.`));
  await router.push({ name: routesPath.support.detail.name, params: { id: issue.id } });
});
</script>

<template>
  <PageHeader
    title="Create support issue"
    description="For issues reported by phone, email or WhatsApp. Issues raised inside a school arrive here automatically."
  />
  <form
    class="flex max-w-[820px] flex-col gap-3.5 rounded-lg border bg-card p-5"
    novalidate
    @submit="submit"
  >
    <h2 class="text-[15px] font-semibold">Issue details</h2>
    <div class="grid gap-3.5 sm:grid-cols-2">
      <FormSelect name="schoolId" label="School" :options="schoolOptions" required />
      <FormInput
        name="requester"
        label="Requester"
        required
        hint="The person at the school who raised it"
        placeholder="Mrs. Adaeze Okonkwo · School Admin"
      />
      <FormInput
        name="subject"
        label="Subject"
        required
        placeholder="e.g. Unable to publish results for JSS 2A"
        class="sm:col-span-2"
      />
      <FormSelect name="category" label="Category" :options="ISSUE_CATEGORIES" />
      <FormSelect
        name="priority"
        label="Priority"
        :options="ISSUE_PRIORITIES"
        hint="Urgent: a school-wide outage or a deadline today"
      />
      <FormSelect name="assignee" label="Owner" :options="ownerOptions" />
      <FormTextarea
        name="description"
        label="Description"
        required
        placeholder="What happened, what the school expected, and any steps already tried"
        class="sm:col-span-2"
      />
    </div>
    <div
      class="flex items-center gap-3 rounded-md border border-dashed border-[#E0D9CE] px-3.5 py-3 text-[13px]"
    >
      <PaperclipIcon class="size-4 text-faint" />
      <span class="flex-1 text-muted-foreground">
        {{
          attachment
            ? `${attachment.name} · ${Math.max(1, Math.round(attachment.size / 1024))} KB`
            : 'Attach one screenshot or PDF · PNG, JPG or PDF up to 10 MB'
        }}
      </span>
      <Button
        v-if="attachment"
        variant="ghost"
        size="icon-sm"
        aria-label="Remove attachment"
        @click="attachment = null"
        ><XIcon
      /></Button>
      <Button v-else as-child variant="outline" size="sm">
        <label class="cursor-pointer"
          >Attach<input
            type="file"
            class="sr-only"
            accept="image/png,image/jpeg,application/pdf"
            @change="pickFile"
        /></label>
      </Button>
    </div>
    <p v-if="attachmentError" role="alert" class="text-xs text-destructive">
      {{ attachmentError }}
    </p>
    <div class="flex justify-end gap-2">
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.support.list.name }">Cancel</RouterLink></Button
      >
      <Button type="submit" :disabled="create.isPending.value"
        ><Spinner v-if="create.isPending.value" />{{
          create.isPending.value ? 'Creating…' : 'Create issue'
        }}</Button
      >
    </div>
  </form>
</template>
