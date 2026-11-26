<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { ArrowLeftIcon } from '@lucide/vue';
import { useForm } from 'vee-validate';
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormTextarea from '@edutrack/app-kit/components/form/FormTextarea.vue';

import { useMessageContactsQuery, useSendMessageMutation } from '@/api/services/messages';
import ChipPicker from '@/components/common/ChipPicker.vue';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import { fieldErrorsOf, getApiErrorMessage } from '@/lib/api-errors';
import { routesPath } from '@/router/routes-path';
import { newMessageSchema } from '@/schema/messages';

/**
 * A new conversation with the school office or one of a child’s teachers. Children who have left
 * the school can only be written about to the school.
 */
const route = useRoute();
const router = useRouter();
const contacts = useMessageContactsQuery();
const send = useSendMessageMutation();
const data = computed(() => contacts.data.value);

const SCHOOL = 'school';
/** "school", or "<studentId>:<staffId>" for a teacher of that child. */
const one = (v: unknown) => (typeof v === 'string' && v ? v : null);
const staffQ = one(route.query.staff);
const studentQ = one(route.query.student);
/** `?to=school`, or `?staff=<id>&student=<id>` to start with that teacher (e.g. house staff). */
const to = ref(
  route.query.to === SCHOOL ? SCHOOL : staffQ && studentQ ? `${studentQ}:${staffQ}` : '',
);
const toError = ref('');
const problem = ref('');
const about = ref<string | undefined>('');
const aboutOptions = computed(() => [
  { value: '', label: 'General' },
  ...(data.value?.children ?? []).map((c) => ({ value: c.studentId, label: c.name })),
]);

const { handleSubmit, setErrors } = useForm({
  validationSchema: newMessageSchema,
  initialValues: { subject: '', body: '' },
});

const pick = (value: string) => {
  to.value = value;
  toError.value = '';
};

const onSend = handleSubmit(async (form) => {
  problem.value = '';
  if (!to.value) {
    toError.value = 'Choose who to write to.';
    return;
  }
  const [studentId, staffId] = to.value.split(':');
  const target =
    to.value === SCHOOL
      ? { to: 'school' as const, studentId: about.value || undefined }
      : { to: 'teacher' as const, studentId, staffId };
  try {
    const thread = await send.mutateAsync({ ...target, subject: form.subject, body: form.body });
    await router.replace({ name: routesPath.messages.thread.name, params: { id: thread.id } });
  } catch (err) {
    const { to: who, staffId: staff, studentId: student, ...fields } = fieldErrorsOf(err);
    if (who || staff || student) toError.value = who ?? staff ?? student ?? '';
    if (Object.keys(fields).length) setErrors(fields);
    if (!who && !staff && !student && !Object.keys(fields).length)
      problem.value = getApiErrorMessage(err, 'Your message wasn’t sent. Try again.');
  }
});
</script>

<template>
  <RouterLink
    :to="{ name: routesPath.messages.list.name }"
    class="-my-1 flex items-center gap-1.5 self-start py-1 text-[13px] font-medium text-primary hover:underline"
    ><ArrowLeftIcon class="size-4" aria-hidden="true" /> All messages</RouterLink
  >
  <PageTitle
    title="New message"
    sub="The school office or the teacher gets an email, and replies show here."
  />
  <QueryState
    v-if="!data"
    :loading="contacts.isPending.value"
    :error="contacts.error.value"
    :rows="1"
    @retry="contacts.refetch()"
  />
  <form v-else class="flex flex-col gap-3.5" novalidate @submit="onSend">
    <fieldset class="flex flex-col gap-1.5" :aria-invalid="!!toError">
      <legend class="mb-1.5 text-sm font-semibold">To</legend>
      <div
        class="overflow-hidden rounded-lg border bg-card"
        :class="toError && 'border-destructive'"
      >
        <label
          class="flex min-h-13 cursor-pointer items-center gap-3 px-3.5 py-2.5 hover:bg-surface-warm has-checked:bg-brand-tint"
        >
          <input
            type="radio"
            name="to"
            class="size-4 shrink-0 accent-primary"
            :checked="to === SCHOOL"
            @change="pick(SCHOOL)"
          />
          <span class="flex min-w-0 flex-col">
            <span class="text-sm font-medium">The school</span>
            <span class="text-xs text-faint">{{ data.school }} · School office</span>
          </span>
        </label>
      </div>

      <section
        v-for="c in data.children"
        :key="c.studentId"
        class="mt-2 flex flex-col gap-1.5"
        :aria-label="`${c.name}’s teachers`"
      >
        <h2 class="text-[13px] font-semibold">
          {{ c.name
          }}<span v-if="c.className" class="font-normal text-muted-foreground">
            · {{ c.className }}</span
          >
        </h2>
        <p
          v-if="!c.onRoll"
          class="rounded-lg border bg-card px-3.5 py-3 text-[13px] text-muted-foreground"
        >
          {{ c.name }} has left the school. Write to the school about them.
        </p>
        <p
          v-else-if="!c.teachers.length"
          class="rounded-lg border bg-card px-3.5 py-3 text-[13px] text-muted-foreground"
        >
          No teachers are listed for {{ c.name }} this term yet. Write to the school instead.
        </p>
        <div
          v-else
          class="overflow-hidden rounded-lg border bg-card [&>*+*]:border-t [&>*+*]:border-divider"
          :class="toError && 'border-destructive'"
        >
          <label
            v-for="t in c.teachers"
            :key="t.staffId"
            class="flex min-h-13 cursor-pointer items-center gap-3 px-3.5 py-2.5 hover:bg-surface-warm has-checked:bg-brand-tint"
          >
            <input
              type="radio"
              name="to"
              class="size-4 shrink-0 accent-primary"
              :checked="to === `${c.studentId}:${t.staffId}`"
              @change="pick(`${c.studentId}:${t.staffId}`)"
            />
            <span class="flex min-w-0 flex-col">
              <span class="text-sm font-medium">{{ t.name }}</span>
              <span v-if="t.roles.length" class="text-xs text-faint">{{
                t.roles.join(' · ')
              }}</span>
            </span>
          </label>
        </div>
      </section>
      <p v-if="toError" role="alert" class="text-[13px] text-error-strong">{{ toError }}</p>
    </fieldset>

    <div v-if="to === SCHOOL && data.children.length" class="flex flex-col gap-1.5">
      <span class="text-sm font-semibold">About</span>
      <ChipPicker v-model="about" :options="aboutOptions" label="About" />
    </div>

    <FormInput
      name="subject"
      label="Subject"
      placeholder="Question about this week’s homework"
      required
    />
    <FormTextarea
      name="body"
      label="Message"
      placeholder="Good morning. I’d like to ask about…"
      :rows="6"
      hint="Up to 2,000 characters."
      required
    />
    <p v-if="problem" role="alert" class="text-[13px] text-error-strong">{{ problem }}</p>
    <Button type="submit" size="lg" class="h-12" :disabled="send.isPending.value">
      <Spinner v-if="send.isPending.value" /> Send message
    </Button>
  </form>
</template>
