<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { PaperclipIcon, XIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import { messageOf } from '@edutrack/web-core/http';

import {
  useHandInMutation,
  useHomeworkQuery,
  useOverviewQuery,
  useUploadMutation,
} from '@/api/services/student';
import AlertCard from '@/components/common/AlertCard.vue';
import ListRow from '@/components/common/ListRow.vue';
import ListSection from '@/components/common/ListSection.vue';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import { formatDateTime, formatDeadline } from '@/lib/dates';
import { getApiErrorMessage } from '@/lib/api-errors';
import { homeworkTone } from '@/lib/summaries';
import { routesPath } from '@/router/routes-path';
import type { FileRef } from '@/types';

/**
 * One assignment: instructions, attachments, status and the teacher's feedback once returned.
 * The student hands in their own work here (photos, PDF or Word) while it is open, and can
 * replace it until the teacher grades it.
 */
const route = useRoute();
const overview = useOverviewQuery();
const q = useHomeworkQuery();
const upload = useUploadMutation();
const handIn = useHandInMutation();
const readOnly = computed(() => overview.data.value?.student.access === 'read-only');
const a = computed(() =>
  q.data.value?.assignments.find((x) => x.id === String(route.params.assignmentId)),
);
const files = ref<FileRef[]>([]);
const note = ref('');
const problem = ref('');

const sizeText = (bytes: number) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });

async function pick(event: Event) {
  const input = event.target as HTMLInputElement;
  const list = [...(input.files ?? [])];
  input.value = '';
  problem.value = '';
  for (const file of list) {
    if (files.value.length >= 5) {
      problem.value = 'Attach up to 5 files.';
      break;
    }
    try {
      files.value.push(
        await upload.mutateAsync({ name: file.name, dataUrl: await readAsDataUrl(file) }),
      );
    } catch (err) {
      problem.value = getApiErrorMessage(err, `“${file.name}” didn’t upload. Try again.`);
    }
  }
}

async function send() {
  if (!a.value || !files.value.length) return;
  problem.value = '';
  try {
    const res = await handIn.mutateAsync({
      assignmentId: a.value.id,
      files: files.value.map((f) => ({ id: f.id })),
      note: note.value.trim() || undefined,
    });
    toast.success(messageOf(res, 'Work handed in.'));
    files.value = [];
    note.value = '';
  } catch (err) {
    problem.value = getApiErrorMessage(err, 'The work wasn’t handed in. Try again.');
  }
}
</script>

<template>
  <QueryState
    v-if="!q.data.value"
    :loading="q.isPending.value"
    :error="q.error.value"
    @retry="q.refetch()"
  />
  <EmptyState
    v-else-if="!a"
    title="Assignment not found"
    description="This assignment isn’t on your list. It may be for another class or another term."
  >
    <Button as-child variant="outline" size="sm"
      ><RouterLink :to="{ name: routesPath.assignments.list.name }"
        >All assignments</RouterLink
      ></Button
    >
  </EmptyState>
  <template v-else>
    <PageTitle
      :title="a.title"
      :sub="`${a.subjectName} · ${a.teacherName} · due ${formatDeadline(a.dueAt)} · max ${a.maxScore}`"
    />
    <ListSection title="Instructions">
      <p class="px-3.5 py-3 text-sm whitespace-pre-line">{{ a.instructions }}</p>
      <ListRow
        v-for="f in a.attachments"
        :key="f.id"
        :title="f.name"
        :sub="f.type === 'link' ? 'Link' : sizeText(f.bytes)"
        right="Open"
        :href="f.url"
      />
    </ListSection>

    <ListSection title="Status">
      <ListRow
        title="Submission"
        :sub="
          a.submittedAt
            ? `Handed in ${formatDateTime(a.submittedAt)}${a.late ? ' (late)' : ''}${a.submittedByGuardian ? ` by ${a.submittedByGuardian}` : ''}`
            : a.pastDue
              ? 'The due date has passed'
              : 'Not handed in yet'
        "
        :badge="a.status"
        :tone="homeworkTone(a.status, a.pastDue)"
      />
      <ListRow
        v-for="f in a.files"
        :key="f.id"
        :title="f.name"
        :sub="sizeText(f.bytes)"
        right="Open"
        :href="f.url"
      />
      <ListRow
        v-if="a.status === 'Returned'"
        :title="`Feedback from ${a.teacherName}`"
        :sub="a.feedback || 'No written feedback.'"
        :right="a.score !== null ? `${a.score} / ${a.maxScore}` : null"
      />
      <ListRow v-if="a.excuseReason" title="Excused" :sub="a.excuseReason" />
    </ListSection>

    <AlertCard
      v-if="!a.canSubmit && !readOnly && a.status === 'Not submitted'"
      tone="neutral"
      :title="
        a.assignmentStatus === 'Closed'
          ? 'Your teacher has closed submissions'
          : a.pastDue
            ? 'The due date has passed'
            : 'This can’t be handed in here'
      "
      :text="
        a.assignmentStatus === 'Closed' || a.pastDue
          ? 'This assignment doesn’t take work any more. Speak to your teacher if you need help.'
          : q.data.value.handsInThrough === 'guardian'
            ? 'Your class hands in work through a parent or guardian.'
            : null
      "
    />

    <div v-if="a.canSubmit" class="flex flex-col gap-2.5 rounded-lg border bg-card p-3.5">
      <span class="font-semibold">
        {{
          a.status === 'Not submitted'
            ? a.pastDue
              ? 'Hand in your work (it will be marked late)'
              : 'Hand in your work'
            : 'Replace the work you handed in'
        }}
      </span>
      <label
        class="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-[1.5px] border-dashed border-[#D9CBB5] bg-[#FCF8F1] p-5 text-center"
      >
        <input
          type="file"
          class="sr-only"
          multiple
          accept="image/*,application/pdf,.doc,.docx"
          @change="pick"
        />
        <Spinner v-if="upload.isPending.value" />
        <PaperclipIcon v-else class="size-5 text-primary" aria-hidden="true" />
        <span class="font-medium">Take a photo or choose a file</span>
        <span class="text-xs text-muted-foreground">Up to 5 files · photos, PDF or Word</span>
      </label>
      <ul v-if="files.length" class="flex flex-col gap-1">
        <li v-for="(f, i) in files" :key="f.id" class="flex items-center gap-2 text-[13px]">
          <span class="flex-1 truncate">{{ f.name }} · {{ sizeText(f.bytes) }}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="`Remove ${f.name}`"
            @click="files.splice(i, 1)"
            ><XIcon
          /></Button>
        </li>
      </ul>
      <textarea
        v-model="note"
        maxlength="1000"
        rows="2"
        class="rounded-md border bg-card px-3 py-2 text-sm"
        placeholder="Note for the teacher (optional)"
        aria-label="Note for the teacher"
      />
      <p v-if="problem" role="alert" class="text-[13px] text-error-strong">{{ problem }}</p>
      <Button
        size="lg"
        class="h-12"
        :disabled="!files.length || handIn.isPending.value || upload.isPending.value"
        @click="send"
      >
        <Spinner v-if="handIn.isPending.value" /> Hand in
      </Button>
    </div>
    <StatusBadge v-else-if="readOnly" label="Read-only" tone="neutral" class="self-start" />
  </template>
</template>
