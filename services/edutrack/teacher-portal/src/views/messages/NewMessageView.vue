<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Label } from '@edutrack/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@edutrack/ui/components/native-select';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorFields } from '@edutrack/web-core/http';
import { CheckIcon, XIcon } from '@lucide/vue';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useMessageContactsQuery, useStartConversationMutation } from '@/api/services/messages';
import { useUnsavedWork } from '@/composables/useUnsavedWork';
import { getApiErrorMessage } from '@/lib/api-errors';
import { routesPath as r } from '@/router/routes-path';
import { MESSAGE_LIMITS, type MessageContactStudent } from '@/types';

/** How many matching students to list before asking for a narrower search. */
const SHOWN = 30;

const route = useRoute();
const router = useRouter();
const { data, isPending, error } = useMessageContactsQuery();
const start = useStartConversationMutation();

const search = ref('');
const classFilter = ref('');
const studentId = ref(typeof route.query.student === 'string' ? route.query.student : '');
const guardianId = ref('');
const subject = ref('');
const body = ref('');
const errors = reactive<Record<string, string>>({});
const serverError = ref('');
const sent = ref(false);

useUnsavedWork(
  () => !sent.value && Boolean(subject.value.trim() || body.value.trim()),
  'New message',
);

const students = computed(() => data.value?.students ?? []);
const classes = computed(() =>
  [...new Set(students.value.map((s) => s.className))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  ),
);
const matches = computed(() => {
  const q = search.value.trim().toLowerCase();
  return students.value.filter(
    (s) =>
      (!classFilter.value || s.className === classFilter.value) &&
      (!q || s.name.toLowerCase().includes(q)),
  );
});
const student = computed(() => students.value.find((s) => s.studentId === studentId.value));
const parent = computed(() =>
  student.value?.parents.find((p) => p.guardianId === guardianId.value),
);

function pick(s: MessageContactStudent) {
  studentId.value = s.studentId;
  delete errors.studentId;
}
function pickParent(id: string) {
  guardianId.value = id;
  delete errors.guardianId;
}
function clearStudent() {
  studentId.value = '';
  guardianId.value = '';
}
// Linked with `?student=<id>&guardian=<id>` (e.g. from My hostel): preselect that parent once.
let linkedGuardian = typeof route.query.guardian === 'string' ? route.query.guardian : '';
// A new student: preselect the linked or only parent, else ask.
watch(
  student,
  (s) => {
    const linked = linkedGuardian && s?.parents.find((p) => p.guardianId === linkedGuardian);
    if (s) linkedGuardian = '';
    guardianId.value = linked
      ? linked.guardianId
      : s?.parents.length === 1
        ? s.parents[0]!.guardianId
        : '';
  },
  { immediate: true },
);

function validate() {
  for (const key of Object.keys(errors)) delete errors[key];
  if (!student.value) errors.studentId = 'Choose the student.';
  else if (!parent.value) errors.guardianId = 'Choose the parent to write to.';
  const s = subject.value.trim();
  if (!s) errors.subject = 'Enter a subject.';
  else if (s.length > MESSAGE_LIMITS.subject)
    errors.subject = `Keep the subject to ${MESSAGE_LIMITS.subject} characters.`;
  const b = body.value.trim();
  if (!b) errors.body = 'Write your message.';
  else if (b.length > MESSAGE_LIMITS.body)
    errors.body = `Keep the message to ${MESSAGE_LIMITS.body} characters.`;
  return !Object.keys(errors).length;
}

async function send() {
  serverError.value = '';
  if (!validate()) return;
  try {
    const thread = await start.mutateAsync({
      guardianId: guardianId.value,
      studentId: studentId.value,
      subject: subject.value.trim(),
      body: body.value.trim(),
    });
    sent.value = true;
    toast.success(`Message sent to ${parent.value?.name ?? 'the parent'}.`);
    await router.replace({ name: r.messages.thread.name, params: { id: thread.id } });
  } catch (e) {
    const fields = getApiErrorFields(e);
    Object.assign(errors, fields);
    if (fields.to) errors.guardianId = fields.to;
    if (!Object.keys(fields).length)
      serverError.value = getApiErrorMessage(e, 'Your message wasn’t sent. Try again.');
  }
}
</script>

<template>
  <PageHeader
    title="New message"
    description="Write to a parent of a student you teach or look after in your hostel. They get an email and can reply in the Parent Portal."
  />
  <InlineNotice
    v-if="error"
    tone="error"
    title="Your students couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <Skeleton v-else-if="isPending" class="h-[480px] w-full max-w-2xl" />
  <EmptyState
    v-else-if="data && !students.length"
    illustrated
    title="No students to write about"
    description="You can message the parents of students you teach this term. The academic office assigns your classes; they appear here once they do."
  />
  <form v-else-if="data" class="flex max-w-2xl flex-col gap-5" novalidate @submit.prevent="send">
    <SectionCard title="To">
      <div class="flex flex-col gap-4.5">
        <!-- 1. The student -->
        <div class="flex flex-col gap-1.5">
          <span id="student-label" class="text-sm font-medium">Student</span>
          <div
            v-if="student"
            class="flex items-center justify-between gap-2 rounded-md border bg-muted px-3 py-2 text-[13px]"
          >
            <span class="min-w-0 truncate"
              ><span class="font-medium">{{ student.name }}</span>
              <span class="text-muted-foreground"> · {{ student.className }}</span></span
            >
            <Button type="button" variant="ghost" size="sm" @click="clearStudent"
              ><XIcon class="size-3.5" /> Change</Button
            >
          </div>
          <template v-else>
            <div class="flex flex-wrap items-center gap-2">
              <SearchInput v-model="search" placeholder="Search your students by name" />
              <NativeSelect
                v-if="classes.length > 1"
                v-model="classFilter"
                aria-label="Class"
                class="min-w-40"
              >
                <NativeSelectOption value="">All classes</NativeSelectOption>
                <NativeSelectOption v-for="c in classes" :key="c" :value="c">{{
                  c
                }}</NativeSelectOption>
              </NativeSelect>
            </div>
            <ul
              aria-labelledby="student-label"
              class="flex max-h-72 flex-col divide-y divide-divider overflow-y-auto rounded-md border"
            >
              <li v-for="s in matches.slice(0, SHOWN)" :key="s.studentId">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] hover:bg-surface-warm"
                  @click="pick(s)"
                >
                  <span class="truncate font-medium">{{ s.name }}</span>
                  <span class="shrink-0 text-xs text-muted-foreground">{{ s.className }}</span>
                </button>
              </li>
              <li v-if="!matches.length" class="px-3 py-4 text-center text-[13px] text-faint">
                No students match.
              </li>
              <li
                v-else-if="matches.length > SHOWN"
                class="px-3 py-2 text-center text-xs text-faint"
              >
                Showing {{ SHOWN }} of {{ matches.length }}. Search or pick a class to narrow it
                down.
              </li>
            </ul>
          </template>
          <span v-if="errors.studentId" role="alert" class="text-xs text-error-strong">{{
            errors.studentId
          }}</span>
        </div>

        <!-- 2. One of their parents -->
        <fieldset v-if="student" class="flex flex-col gap-1.5">
          <legend class="mb-1.5 text-sm font-medium">Parent</legend>
          <p v-if="!student.parents.length" class="text-[13px] text-muted-foreground">
            {{ student.name }} has no parent with a login. Ask the school office to invite one.
          </p>
          <div v-else role="radiogroup" aria-label="Parent" class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="p in student.parents"
              :key="p.guardianId"
              type="button"
              role="radio"
              :aria-checked="guardianId === p.guardianId"
              :class="
                cn(
                  'flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-[13px] hover:bg-surface-warm',
                  guardianId === p.guardianId && 'border-primary bg-brand-subtle',
                )
              "
              @click="pickParent(p.guardianId)"
            >
              <span class="flex min-w-0 flex-col">
                <span class="truncate font-medium">{{ p.name }}</span>
                <span class="text-xs text-muted-foreground">{{ p.relationship }}</span>
              </span>
              <CheckIcon v-if="guardianId === p.guardianId" class="size-4 shrink-0 text-primary" />
            </button>
          </div>
          <span v-if="errors.guardianId" role="alert" class="text-xs text-error-strong">{{
            errors.guardianId
          }}</span>
        </fieldset>
      </div>
    </SectionCard>

    <SectionCard title="Message">
      <div class="flex flex-col gap-4.5">
        <div class="flex flex-col gap-1.5">
          <Label for="subject">Subject</Label>
          <Input
            id="subject"
            v-model="subject"
            :maxlength="MESSAGE_LIMITS.subject"
            placeholder="e.g. Chidi’s maths homework"
            :aria-invalid="Boolean(errors.subject)"
          />
          <span v-if="errors.subject" role="alert" class="text-xs text-error-strong">{{
            errors.subject
          }}</span>
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="body">Message</Label>
          <Textarea id="body" v-model="body" :rows="6" :aria-invalid="Boolean(errors.body)" />
          <span v-if="errors.body" role="alert" class="text-xs text-error-strong">{{
            errors.body
          }}</span>
          <span
            v-else
            :class="
              cn('text-xs', body.length > MESSAGE_LIMITS.body ? 'text-error-strong' : 'text-faint')
            "
            >{{ body.length }} / {{ MESSAGE_LIMITS.body }}</span
          >
        </div>
      </div>
    </SectionCard>

    <p
      v-if="serverError"
      role="alert"
      class="rounded-md bg-error-subtle px-3 py-2.5 text-[13px] text-error-strong"
    >
      {{ serverError }}
    </p>
    <div class="flex flex-wrap gap-2">
      <Button type="submit" :disabled="start.isPending.value">
        <Spinner v-if="start.isPending.value" />Send message
      </Button>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: r.messages.list.name }">Cancel</RouterLink></Button
      >
    </div>
  </form>
</template>
