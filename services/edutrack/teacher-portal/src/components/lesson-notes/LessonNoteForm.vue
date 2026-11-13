<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@edutrack/ui/components/native-select';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { PaperclipIcon, XIcon } from '@lucide/vue';
import { computed, ref, useId, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useSaveLessonNoteMutation } from '@/api/services/lesson-notes';
import { useUnsavedWork } from '@/composables/useUnsavedWork';
import { fieldErrorsOf, getApiErrorMessage } from '@/lib/api-errors';
import { formatWeekday } from '@/lib/dates';
import { routesPath as r } from '@/router/routes-path';
import {
  LESSON_NOTE_LIMITS as LIMITS,
  type LessonNote,
  type LessonNotesList,
  type NoteAttachment,
} from '@/types';

import { fileSize } from './note-status';

/**
 * Writes a new lesson note (`note` empty) or edits a Draft / Returned one. Subject, class level
 * and week are chosen once; editing keeps them.
 */
const props = defineProps<{ list: LessonNotesList; note?: LessonNote | null }>();

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const save = useSaveLessonNoteMutation();
const id = useId();
const isEdit = computed(() => Boolean(props.note));

const slotKey = ref('');
const week = ref('');
const topic = ref('');
const objectives = ref('');
const content = ref('');
const schemeTopic = ref('');
const attachment = ref<NoteAttachment | null>(null);
const errors = ref<Record<string, string>>({});
const serverError = ref('');
const saved = ref('');
const done = ref(false);

const state = () =>
  JSON.stringify([
    slotKey.value,
    week.value,
    topic.value.trim(),
    objectives.value.trim(),
    content.value.trim(),
    schemeTopic.value.trim(),
    attachment.value,
  ]);

function load() {
  const n = props.note;
  if (n) {
    slotKey.value = `${n.subject}|${n.level}`;
    week.value = String(n.week);
    topic.value = n.topic;
    objectives.value = n.objectives.join('\n');
    content.value = n.content;
    schemeTopic.value = n.schemeTopic;
    attachment.value = n.attachment;
  } else {
    const qSlot = typeof route.query.slot === 'string' ? route.query.slot : '';
    const qWeek = typeof route.query.week === 'string' ? route.query.week : '';
    slotKey.value = props.list.slots.some((s) => s.key === qSlot)
      ? qSlot
      : props.list.slots.length === 1
        ? props.list.slots[0]!.key
        : '';
    week.value = props.list.weeks.some((w) => String(w.week) === qWeek)
      ? qWeek
      : String(Math.min(props.list.currentWeek + 1, props.list.weeks.length) || '');
  }
  saved.value = state();
}
watch(() => props.note?.updatedAt, load, { immediate: true });

const dirty = computed(() => state() !== saved.value);
useUnsavedWork(
  () => dirty.value && !done.value,
  () => (isEdit.value ? `Lesson note · ${props.note?.topic}` : 'New lesson note'),
);

const slot = computed(() => props.list.slots.find((s) => s.key === slotKey.value) ?? null);
const chosenWeek = computed(
  () => props.list.weeks.find((w) => String(w.week) === week.value) ?? null,
);
const existing = computed(() =>
  isEdit.value || !slot.value || !chosenWeek.value
    ? null
    : (props.list.rows.find(
        (x) => x.key === `${slot.value!.key}|${chosenWeek.value!.week}` && x.noteId,
      ) ?? null),
);
const objectiveLines = computed(() =>
  objectives.value
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean),
);
const dueLabel = computed(() =>
  chosenWeek.value
    ? `Due ${formatWeekday(chosenWeek.value.due, { year: false })}${chosenWeek.value.due < props.list.today ? ' (passed)' : ''}`
    : undefined,
);

/* ---------- Attachment (the mock keeps only name, type and size) ---------- */

const fileInput = ref<HTMLInputElement | null>(null);
function pick(event: Event) {
  const el = event.target as HTMLInputElement;
  const file = el.files?.[0];
  el.value = '';
  if (!file) return;
  if (file.size > LIMITS.attachmentBytes) {
    errors.value = {
      ...errors.value,
      attachment: `“${file.name}” is ${fileSize(file.size)}. Attach a file up to 10 MB.`,
    };
    return;
  }
  errors.value = Object.fromEntries(
    Object.entries(errors.value).filter(([k]) => k !== 'attachment'),
  );
  attachment.value = { name: file.name, type: file.type, bytes: file.size || 1 };
}

/* ---------- Saving ---------- */

function validate(submit: boolean) {
  const e: Record<string, string> = {};
  if (!isEdit.value) {
    if (!slot.value) e.slot = 'Choose one of your subjects and class levels.';
    if (!chosenWeek.value) e.week = 'Choose the week this note covers.';
  }
  const t = topic.value.trim();
  if (t.length < LIMITS.topic.min)
    e.topic = t ? 'Give the topic a few more words.' : 'Enter the week’s topic.';
  else if (t.length > LIMITS.topic.max)
    e.topic = `Keep the topic to ${LIMITS.topic.max} characters.`;
  const lines = objectiveLines.value;
  if (lines.length > LIMITS.objectives.max)
    e.objectives = `List up to ${LIMITS.objectives.max} objectives (${lines.length} now).`;
  else if (lines.some((l) => l.length > LIMITS.objectives.each))
    e.objectives = `Keep each objective under ${LIMITS.objectives.each} characters.`;
  else if (submit && !lines.length) e.objectives = 'List at least one objective, one per line.';
  const c = content.value.trim();
  if (c.length > LIMITS.content.max)
    e.content = `Keep the summary to ${LIMITS.content.max} characters.`;
  else if (submit && c.length < LIMITS.content.min)
    e.content = `Write at least ${LIMITS.content.min} characters (${c.length} so far).`;
  if (schemeTopic.value.trim().length > LIMITS.schemeTopic)
    e.schemeTopic = `Keep it to ${LIMITS.schemeTopic} characters.`;
  if (errors.value.attachment) e.attachment = errors.value.attachment;
  errors.value = e;
  return !Object.keys(e).length;
}

async function run(submit: boolean) {
  serverError.value = '';
  if (existing.value || !validate(submit)) return;
  const noReview = slot.value?.noReview ?? props.note?.noReview ?? false;
  const reviewer =
    props.note?.status === 'Returned'
      ? props.note.reviewer
      : (slot.value?.reviewer ?? props.note?.reviewer ?? '');
  const label = slot.value?.label ?? `${props.note?.level} · ${props.note?.subjectName}`;
  const payload = {
    topic: topic.value.trim(),
    objectives: objectiveLines.value,
    content: content.value.trim(),
    attachment: attachment.value,
    schemeTopic: schemeTopic.value.trim(),
    submit,
  };
  const go = async () => {
    try {
      const saved_ = await save.mutateAsync(
        isEdit.value
          ? { id: props.note!.id, payload }
          : {
              payload: {
                ...payload,
                subject: slot.value!.subject,
                level: slot.value!.level,
                week: chosenWeek.value!.week,
              },
            },
      );
      done.value = true;
      saved.value = state();
      toast.success(
        !submit
          ? 'Draft saved.'
          : noReview
            ? 'Filed as approved. As Academic Head, your notes need no review.'
            : `Submitted to ${reviewer}.`,
      );
      if (!isEdit.value)
        await router.push({ name: r.lessonNotes.detail.name, params: { noteId: saved_.id } });
      else done.value = false;
    } catch (e) {
      const fields = fieldErrorsOf(e);
      errors.value = fields;
      if (!Object.keys(fields).length)
        serverError.value = getApiErrorMessage(e, 'The note wasn’t saved. Try again.');
      if (submit) throw new Error(getApiErrorMessage(e, 'The note wasn’t submitted.'));
    }
  };
  if (!submit) return go();
  await confirm({
    title: noReview
      ? 'File this lesson note?'
      : `${props.note?.status === 'Returned' ? 'Resubmit' : 'Submit'} this lesson note?`,
    description: noReview
      ? 'As Academic Head, your own notes need no review: it’s filed as Approved straight away and can’t be changed after.'
      : `It goes to ${reviewer} for review and can’t be changed unless it’s returned.`,
    details: [
      ['Class', label],
      ['Week', chosenWeek.value?.label ?? props.note?.weekLabel ?? ''],
      ['Topic', payload.topic],
      ['Notifies', noReview ? 'No one' : reviewer],
    ],
    confirmLabel: noReview
      ? 'File note'
      : props.note?.status === 'Returned'
        ? 'Resubmit'
        : 'Submit for review',
    action: go,
  });
}
</script>

<template>
  <form class="flex max-w-3xl flex-col gap-5" novalidate @submit.prevent="run(true)">
    <fieldset :disabled="save.isPending.value" class="contents">
      <SectionCard title="Class and week">
        <div class="grid grid-cols-2 gap-4.5 max-sm:grid-cols-1">
          <FieldShell
            :id="`${id}-slot`"
            label="Subject and class level"
            required
            :error="errors.slot"
            :hint="
              slot
                ? slot.noReview
                  ? 'Filed as Approved on submit: as Academic Head, your notes need no review'
                  : `Reviewed by ${slot.reviewer}`
                : 'Only the subjects and levels you teach.'
            "
          >
            <NativeSelect
              :id="`${id}-slot`"
              v-model="slotKey"
              :disabled="isEdit"
              :aria-invalid="Boolean(errors.slot)"
              class="w-full bg-card font-normal"
            >
              <NativeSelectOption value="">Choose…</NativeSelectOption>
              <NativeSelectOption v-for="s in list.slots" :key="s.key" :value="s.key">{{
                s.label
              }}</NativeSelectOption>
            </NativeSelect>
          </FieldShell>
          <FieldShell
            :id="`${id}-week`"
            label="Week"
            required
            :error="errors.week"
            :hint="[dueLabel, chosenWeek?.note].filter(Boolean).join(' · ') || undefined"
            :hint-tone="chosenWeek?.midterm ? 'warning' : 'muted'"
          >
            <NativeSelect
              :id="`${id}-week`"
              v-model="week"
              :disabled="isEdit"
              :aria-invalid="Boolean(errors.week)"
              class="w-full bg-card font-normal"
            >
              <NativeSelectOption value="">Choose…</NativeSelectOption>
              <NativeSelectOption v-for="w in list.weeks" :key="w.week" :value="String(w.week)"
                >{{ w.label }}{{ w.midterm ? ' · mid-term' : '' }}</NativeSelectOption
              >
            </NativeSelect>
          </FieldShell>
        </div>
        <InlineNotice
          v-if="existing"
          class="mt-4"
          tone="warning"
          title="You already have a note for this week"
          :description="`${existing.label}, week ${existing.week} is ${existing.status}. Open it to make changes.`"
        >
          <template #action>
            <Button as-child variant="outline" size="sm"
              ><RouterLink
                :to="{ name: r.lessonNotes.detail.name, params: { noteId: existing.noteId } }"
                >Open it</RouterLink
              ></Button
            >
          </template>
        </InlineNotice>
      </SectionCard>

      <SectionCard title="The lesson">
        <div class="flex flex-col gap-4.5">
          <FieldShell
            :id="`${id}-topic`"
            label="Topic"
            required
            :error="errors.topic"
            :hint="`${topic.trim().length} / ${LIMITS.topic.max}`"
          >
            <Input
              :id="`${id}-topic`"
              v-model="topic"
              :aria-invalid="Boolean(errors.topic)"
              placeholder="e.g. Simultaneous equations"
              class="bg-card font-normal"
            />
          </FieldShell>
          <FieldShell
            :id="`${id}-objectives`"
            label="Objectives"
            required
            :error="errors.objectives"
            :hint="`One per line, 1 to 5 · ${objectiveLines.length} listed`"
          >
            <Textarea
              :id="`${id}-objectives`"
              v-model="objectives"
              :rows="4"
              :aria-invalid="Boolean(errors.objectives)"
              placeholder="Solve two equations by elimination&#10;Check answers by substitution"
              class="min-h-24 resize-y bg-card font-normal"
            />
          </FieldShell>
          <FieldShell
            :id="`${id}-content`"
            label="Content summary"
            required
            :error="errors.content"
            :hint="`${content.trim().length} characters · at least ${LIMITS.content.min}`"
          >
            <Textarea
              :id="`${id}-content`"
              v-model="content"
              :rows="6"
              :aria-invalid="Boolean(errors.content)"
              placeholder="How the lesson runs: starter, teaching, practice, assessment and homework."
              class="min-h-32 resize-y bg-card font-normal"
            />
          </FieldShell>
          <FieldShell
            :id="`${id}-scheme`"
            label="Scheme of work topic"
            :error="errors.schemeTopic"
            hint="Optional. The topic in the school’s scheme of work this note covers."
          >
            <Input
              :id="`${id}-scheme`"
              v-model="schemeTopic"
              :aria-invalid="Boolean(errors.schemeTopic)"
              placeholder="e.g. Algebra · Unit 4"
              class="bg-card font-normal"
            />
          </FieldShell>
          <div class="flex flex-col gap-1.5">
            <span class="text-[13px] font-medium">Attachment</span>
            <div
              v-if="attachment"
              class="flex min-w-0 items-center gap-2.5 rounded-md border bg-card px-3 py-2 text-[13px]"
            >
              <PaperclipIcon class="size-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate">{{ attachment.name }}</span>
              <span class="shrink-0 text-xs text-faint">{{ fileSize(attachment.bytes) }}</span>
              <button
                type="button"
                class="shrink-0 text-muted-foreground hover:text-foreground"
                :aria-label="`Remove ${attachment.name}`"
                @click="attachment = null"
              >
                <XIcon class="size-4" />
              </button>
            </div>
            <div v-else class="flex flex-wrap items-center gap-2.5">
              <Button type="button" variant="outline" size="sm" @click="fileInput?.click()"
                ><PaperclipIcon class="size-4" /> Attach a file</Button
              >
              <span class="text-xs text-faint">Optional · one file up to 10 MB</span>
            </div>
            <input
              ref="fileInput"
              type="file"
              class="sr-only"
              tabindex="-1"
              aria-hidden="true"
              @change="pick"
            />
            <p v-if="errors.attachment" role="alert" class="text-xs text-destructive">
              {{ errors.attachment }}
            </p>
          </div>
        </div>
      </SectionCard>
    </fieldset>

    <InlineNotice v-if="serverError" tone="error" title="Not saved" :description="serverError" />

    <div class="flex flex-wrap gap-2">
      <Button type="submit" :disabled="save.isPending.value || Boolean(existing)">
        <Spinner v-if="save.isPending.value" />
        {{
          (slot?.noReview ?? note?.noReview)
            ? 'File note'
            : note?.status === 'Returned'
              ? 'Resubmit for review'
              : 'Submit for review'
        }}
      </Button>
      <Button
        type="button"
        variant="outline"
        :disabled="save.isPending.value || Boolean(existing)"
        @click="run(false)"
        >Save draft</Button
      >
      <Button as-child variant="ghost"
        ><RouterLink :to="{ name: r.lessonNotes.list.name }">Cancel</RouterLink></Button
      >
    </div>
  </form>
</template>
