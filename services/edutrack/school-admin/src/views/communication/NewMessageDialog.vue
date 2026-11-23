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
import { getApiErrorFields, getApiErrorMessage } from '@edutrack/web-core/http';
import { refDebounced } from '@vueuse/core';
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';

import {
  isForbidden,
  useMessageContactsQuery,
  useSendMessageMutation,
} from '@/api/services/messages';
import { routesPath } from '@/router/routes-path';
import type { MessageContacts } from '@/types';

import { fmtCount } from './comms-tones';

/**
 * Start a conversation with a parent: find them by name, optionally say which child it's about,
 * then write. Sending opens the new thread.
 */
const open = defineModel<boolean>('open', { required: true });

type Parent = MessageContacts['parents'][number];

const router = useRouter();
const send = useSendMessageMutation();

const search = ref('');
const debounced = refDebounced(search, 300);
const term = computed(() => debounced.value.trim());
const contacts = useMessageContactsQuery(term);
const results = computed(() =>
  term.value.length >= 2 ? (contacts.data.value?.parents ?? []) : [],
);

const parent = ref<Parent | null>(null);
const form = reactive({ studentId: '', subject: '', body: '' });
const fields = ref<Record<string, string>>({});
const showErrors = ref(false);

const errors = computed(() => {
  const e: Record<string, string> = { ...fields.value };
  if (!parent.value) e.guardianId ??= 'Choose the parent to write to.';
  if (!form.subject.trim()) e.subject ??= 'Add a subject.';
  if (!form.body.trim()) e.body ??= 'Write your message.';
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);

watch([() => form.subject, () => form.body, () => form.studentId, parent], () => {
  fields.value = {};
});

function reset() {
  search.value = '';
  parent.value = null;
  Object.assign(form, { studentId: '', subject: '', body: '' });
  fields.value = {};
  showErrors.value = false;
}
watch(open, (o) => o && reset());

function choose(p: Parent) {
  parent.value = p;
  // One child: it's almost certainly about them, but the office can still clear it.
  form.studentId = p.children.length === 1 ? p.children[0]!.studentId : '';
}

async function submit() {
  showErrors.value = true;
  if (Object.keys(errors.value).length || !parent.value) return;
  try {
    const thread = await send.mutateAsync({
      guardianId: parent.value.guardianId,
      studentId: form.studentId || undefined,
      subject: form.subject.trim(),
      body: form.body.trim(),
    });
    toast.success(`Sent to ${parent.value.name}.`);
    open.value = false;
    void router.push({
      name: routesPath.communication.messageThread.name,
      params: { id: thread.id },
    });
  } catch (e) {
    const f = getApiErrorFields(e);
    if (Object.keys(f).length) fields.value = f;
    else
      toast.error(
        isForbidden(e)
          ? 'Only staff with school-wide messaging can write from the school.'
          : getApiErrorMessage(e, 'The message didn’t send. Try again.'),
      );
  }
}

const selectClass = 'h-9 w-full rounded-md border bg-card px-2.5 text-sm';
const childList = (p: Parent) => p.children.map((c) => c.name).join(', ') || 'No children on roll';
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[560px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">New message</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          Goes to the parent’s portal and email. Their reply comes back here for everyone with
          school-wide messaging.
        </DialogDescription>
      </div>

      <form class="flex min-h-0 flex-col gap-4 overflow-y-auto" @submit.prevent="submit">
        <FieldShell id="nm-parent" label="To" required :error="err('guardianId')">
          <div
            v-if="parent"
            class="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2"
          >
            <span class="flex min-w-0 flex-col">
              <span class="truncate text-sm font-medium">{{ parent.name }}</span>
              <span class="truncate text-xs text-muted-foreground">{{ childList(parent) }}</span>
            </span>
            <Button type="button" variant="outline" size="sm" @click="parent = null">Change</Button>
          </div>
          <div v-else id="nm-parent" class="flex flex-col gap-2">
            <SearchInput v-model="search" placeholder="Parent or child’s name" />
            <p v-if="search.trim().length < 2" class="text-xs text-faint">
              Type at least two letters.
            </p>
            <p v-else-if="contacts.isFetching.value && !results.length" class="text-xs text-faint">
              Searching…
            </p>
            <p v-else-if="contacts.error.value" class="text-xs text-error-strong">
              {{
                isForbidden(contacts.error.value)
                  ? 'Only staff with school-wide messaging can read the school’s messages.'
                  : getApiErrorMessage(contacts.error.value, 'Search didn’t work. Try again.')
              }}
            </p>
            <p v-else-if="term.length >= 2 && !results.length" class="text-xs text-faint">
              No parents match “{{ term }}”.
            </p>
            <ul
              v-if="results.length"
              class="flex max-h-60 flex-col divide-y divide-divider overflow-y-auto rounded-md border"
              aria-label="Matching parents"
            >
              <li v-for="p in results" :key="p.guardianId">
                <button
                  type="button"
                  class="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  @click="choose(p)"
                >
                  <span class="text-sm font-medium">{{ p.name }}</span>
                  <span class="text-xs text-muted-foreground">{{ childList(p) }}</span>
                </button>
              </li>
            </ul>
          </div>
        </FieldShell>

        <FieldShell
          v-if="parent && parent.children.length"
          id="nm-about"
          label="About"
          hint="Optional. Shown to the parent and in the inbox."
          :error="err('studentId')"
        >
          <select id="nm-about" v-model="form.studentId" :class="selectClass">
            <option value="">No particular child</option>
            <option v-for="c in parent.children" :key="c.studentId" :value="c.studentId">
              {{ c.name }}
            </option>
          </select>
        </FieldShell>

        <FieldShell id="nm-subject" label="Subject" required :error="err('subject')">
          <Input
            id="nm-subject"
            v-model="form.subject"
            maxlength="120"
            placeholder="e.g. Second term fees"
          />
        </FieldShell>

        <FieldShell
          id="nm-body"
          label="Message"
          required
          :error="err('body')"
          :hint="`${fmtCount(form.body.length)} of 2,000 characters`"
        >
          <Textarea id="nm-body" v-model="form.body" rows="6" maxlength="2000" />
        </FieldShell>

        <InlineNotice
          v-if="err('to')"
          tone="error"
          title="This parent can’t be messaged"
          :description="err('to')"
        />

        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="send.isPending.value">
            <Spinner v-if="send.isPending.value" />
            Send message
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
