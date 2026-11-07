<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { refDebounced } from '@vueuse/core';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useAnnouncementQuery,
  useAudiencePreviewQuery,
  useCommsOptionsQuery,
  useSaveAnnouncementMutation,
  type PreviewInput,
} from '@/api/services/communication';
import { smsLength, smsSafe } from '@/lib/sms';
import { routesPath } from '@/router/routes-path';
import type { AnnouncementPayload, AudienceKind, Channel } from '@/types';

import { fmtCount, fmtStamp, localStamp } from './comms-tones';

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const editId = computed(() => (route.params.id ? String(route.params.id) : null));
const { data: existing, error: loadError } = useAnnouncementQuery(editId);
const { data: options } = useCommsOptionsQuery();
const save = useSaveAnnouncementMutation();

const AUDIENCES: { value: AudienceKind; label: string; description: string }[] = [
  { value: 'parents', label: 'Parents', description: 'Fee payers and guardians' },
  { value: 'everyone', label: 'Entire school', description: 'Parents, students and staff' },
  { value: 'students', label: 'Students', description: 'In the Student Portal only' },
  { value: 'teachers', label: 'Teachers', description: 'Teaching staff' },
  { value: 'staff', label: 'All staff', description: 'Teaching and non-teaching' },
  {
    value: 'classes',
    label: 'Specific classes',
    description: 'Parents and students of chosen arms',
  },
];
const CHANNELS: { value: Channel; hint: string }[] = [
  { value: 'In-app', hint: 'Portals and the app. Free.' },
  { value: 'Email', hint: 'Free.' },
  { value: 'SMS', hint: 'Uses SMS credit per page.' },
];

const blank = () => ({
  title: '',
  body: '',
  smsText: '',
  kind: 'parents' as AudienceKind,
  classes: [] as string[],
  branchId: '',
  channels: ['In-app', 'Email'] as Channel[],
  when: 'now' as 'now' | 'later',
  scheduledFor: '',
  expiresOn: '',
});
const form = reactive(blank());
const initial = ref(JSON.stringify(form));
const loaded = ref(!editId.value);
const showErrors = ref(false);
const serverError = ref('');
const done = ref(false);

watch(
  existing,
  (a) => {
    if (!a || loaded.value) return;
    if (!a.canEdit) {
      toast.error('Only drafts and scheduled announcements can be edited.');
      void router.replace({
        name: routesPath.communication.announcementDetail.name,
        params: { id: a.id },
      });
      return;
    }
    Object.assign(form, {
      title: a.title,
      body: a.body,
      smsText: a.smsText,
      kind: a.audience.kind,
      classes: [...a.audience.classes],
      branchId: a.audience.branchId ?? '',
      channels: [...a.channels],
      when: a.status === 'Scheduled' ? 'later' : 'now',
      scheduledFor: a.scheduledFor ?? '',
      expiresOn: a.expiresOn ?? '',
    });
    initial.value = JSON.stringify(form);
    loaded.value = true;
  },
  { immediate: true },
);

const dirty = computed(() => !done.value && JSON.stringify(form) !== initial.value);
useUnsavedChanges(dirty);

const branchName = computed(
  () => options.value?.branches.find((b) => b.id === form.branchId)?.name ?? 'All branches',
);
const classGroups = computed(() => {
  const groups = new Map<string, { label: string; students: number }[]>();
  for (const c of options.value?.classes ?? []) {
    if (form.branchId && c.branchId !== form.branchId) continue;
    const list = groups.get(c.level) ?? [];
    const same = list.find((x) => x.label === c.label);
    if (same) same.students += c.students;
    else list.push({ label: c.label, students: c.students });
    groups.set(c.level, list);
  }
  return [...groups.entries()].map(([level, arms]) => ({
    level,
    arms: arms.sort((a, b) => a.label.localeCompare(b.label)),
  }));
});
// Classes that aren't in the chosen branch drop out of the selection.
watch(classGroups, (groups) => {
  if (!options.value) return;
  const ok = new Set(groups.flatMap((g) => g.arms.map((a) => a.label)));
  const kept = form.classes.filter((c) => ok.has(c));
  if (kept.length !== form.classes.length) form.classes = kept;
});

function toggleClass(label: string) {
  form.classes = form.classes.includes(label)
    ? form.classes.filter((c) => c !== label)
    : [...form.classes, label];
}
function toggleLevel(arms: { label: string }[]) {
  const all = arms.every((a) => form.classes.includes(a.label));
  const labels = arms.map((a) => a.label);
  form.classes = all
    ? form.classes.filter((c) => !labels.includes(c))
    : [...new Set([...form.classes, ...labels])];
}
function toggleChannel(ch: Channel) {
  form.channels = form.channels.includes(ch)
    ? form.channels.filter((c) => c !== ch)
    : CHANNELS.map((c) => c.value).filter((c) => c === ch || form.channels.includes(c));
}

const hasSms = computed(() => form.channels.includes('SMS'));
const sms = computed(() => smsLength(smsSafe(form.smsText)));
const studentsOnly = computed(() => form.kind === 'students');

function copyToSms() {
  const text = [form.title.trim(), form.body.trim()].filter(Boolean).join(': ');
  let out = '';
  for (const word of text.split(/\s+/)) {
    const next = out ? `${out} ${word}` : word;
    if (smsLength(smsSafe(next)).pages > 1) break;
    out = next;
  }
  form.smsText = out;
}

const audience = computed(() => ({
  kind: form.kind,
  classes: form.kind === 'classes' ? form.classes : [],
  branchId: form.branchId || null,
}));
const previewInput = computed<PreviewInput | null>(() =>
  form.kind === 'classes' && !form.classes.length
    ? null
    : {
        audience: audience.value,
        channels: form.channels,
        smsText: hasSms.value ? form.smsText : '',
      },
);
const debouncedInput = refDebounced(previewInput, 350);
const {
  data: pv,
  isFetching: previewing,
  error: previewError,
} = useAudiencePreviewQuery(debouncedInput);

const minSchedule = computed(() => localStamp(10));
const errors = computed(() => {
  const e: Record<string, string> = {};
  if (!form.title.trim()) e.title = 'Add a title.';
  else if (form.title.trim().length > 120) e.title = 'Keep the title to 120 characters.';
  if (!form.body.trim()) e.body = 'Write the message.';
  else if (form.body.trim().length > 2000) e.body = 'Keep the message to 2,000 characters.';
  if (!form.channels.length) e.channels = 'Choose at least one channel.';
  else if (studentsOnly.value && !form.channels.includes('In-app'))
    e.channels = 'Students only receive In-app messages. Add In-app.';
  if (form.kind === 'classes' && !form.classes.length) e.classes = 'Choose at least one class.';
  if (hasSms.value) {
    if (!form.smsText.trim()) e.smsText = 'Write the SMS version.';
    else if (sms.value.pages > 3) e.smsText = 'Keep the SMS to 3 pages.';
  }
  if (form.when === 'later') {
    if (!form.scheduledFor) e.scheduledFor = 'Choose when to send it.';
    else if (form.scheduledFor < localStamp(5))
      e.scheduledFor = 'Choose a time at least 5 minutes from now.';
    else if (form.scheduledFor > localStamp(90 * 24 * 60))
      e.scheduledFor = 'You can schedule up to 90 days ahead.';
  }
  const sendDay = (
    form.when === 'later' && form.scheduledFor ? form.scheduledFor : localStamp()
  ).slice(0, 10);
  if (form.expiresOn && form.expiresOn < sendDay)
    e.expiresOn = 'It can’t expire before it goes out.';
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);
const draftErrors = computed(() => (errors.value.title ? { title: errors.value.title } : {}));

const payload = (action: AnnouncementPayload['action']): AnnouncementPayload => ({
  title: form.title.trim(),
  body: form.body.trim(),
  smsText: hasSms.value ? form.smsText.trim() : '',
  audience: audience.value,
  channels: form.channels,
  scheduledFor: action === 'schedule' ? form.scheduledFor : null,
  expiresOn: form.expiresOn || null,
  action,
});

/** Saves and moves on; throws so the confirm dialog can show a server error. */
async function persist(action: AnnouncementPayload['action']) {
  const saved = await save.mutateAsync({ ...payload(action), id: editId.value ?? undefined });
  done.value = true;
  toast.success(
    action === 'draft'
      ? 'Saved as a draft.'
      : action === 'schedule'
        ? `Scheduled for ${fmtStamp(saved.scheduledFor)}.`
        : `Sent to ${fmtCount(saved.recipients ?? 0)} recipients.`,
  );
  void router.push({
    name: routesPath.communication.announcementDetail.name,
    params: { id: saved.id },
  });
}

async function submit(action: AnnouncementPayload['action']) {
  serverError.value = '';
  try {
    await persist(action);
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}

function saveDraft() {
  showErrors.value = true;
  if (Object.keys(draftErrors.value).length) return;
  void submit('draft');
}

function send() {
  showErrors.value = true;
  if (Object.keys(errors.value).length) return;
  const p = pv.value;
  if (!p) {
    serverError.value = 'Still counting recipients. Try again in a moment.';
    return;
  }
  if (!p.recipients) {
    serverError.value = 'Nobody is in this audience yet. Choose another audience or branch.';
    return;
  }
  if (!p.enough) {
    serverError.value = `This needs ${fmtCount(p.smsUnits)} SMS units but your school has ${fmtCount(p.credit)}.`;
    return;
  }
  const later = form.when === 'later';
  const details: [string, string][] = [
    ['Audience', p.label],
    ['Channels', form.channels.join(', ')],
    ['Reach', form.channels.map((ch) => `${ch} ${fmtCount(p.reach[ch])}`).join(' · ')],
    [
      'SMS cost',
      hasSms.value ? `${fmtCount(p.smsUnits)} units (about ${formatNaira(p.smsCost)})` : 'None',
    ],
    ['Expires', form.expiresOn ? fmtStamp(form.expiresOn) : 'Stays until withdrawn'],
    [
      'Reversible',
      form.channels.includes('In-app')
        ? 'In-app posts can be withdrawn. Sent SMS and email can’t be recalled.'
        : 'Sent SMS and email can’t be recalled.',
    ],
  ];
  if (later) details.unshift(['Sends', fmtStamp(form.scheduledFor)]);
  void confirm({
    title: `${later ? 'Schedule' : 'Send'} to ${fmtCount(p.recipients)} recipients?`,
    details,
    confirmLabel: later ? 'Schedule announcement' : 'Send announcement',
    action: () => persist(later ? 'schedule' : 'send'),
  });
}

const selectClass = 'h-9 w-full rounded-md border bg-card px-2.5 text-sm';
</script>

<template>
  <EmptyState
    v-if="loadError"
    title="Announcement not found"
    description="It may have been deleted, or the link is wrong."
  >
    <Button as-child variant="outline">
      <RouterLink :to="{ name: routesPath.communication.announcements.name }"
        >Back to announcements</RouterLink
      >
    </Button>
  </EmptyState>
  <p v-else-if="!loaded" class="text-sm text-muted-foreground">Loading…</p>
  <template v-else>
    <PageHeader
      :title="editId ? 'Edit announcement' : 'New announcement'"
      description="Shows in the parent, student and staff portals, and goes out by email or SMS if you choose."
    />

    <InlineNotice
      v-if="serverError"
      tone="error"
      title="Couldn’t send"
      :description="serverError"
      role="alert"
    />

    <div class="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr] [&>*]:min-w-0">
      <div class="flex flex-col gap-4">
        <SectionCard title="Message">
          <div class="flex flex-col gap-4">
            <FieldShell id="an-title" label="Title" required :error="err('title')">
              <Input
                id="an-title"
                v-model="form.title"
                maxlength="120"
                placeholder="e.g. PTA meeting & open day"
              />
            </FieldShell>
            <FieldShell
              id="an-body"
              label="Message"
              required
              :error="err('body')"
              :hint="`${fmtCount(form.body.length)} of 2,000 characters · shown in the portals and email`"
            >
              <Textarea id="an-body" v-model="form.body" rows="7" maxlength="2000" />
            </FieldShell>
          </div>
        </SectionCard>

        <SectionCard title="Audience">
          <div class="flex flex-col gap-4">
            <ChoiceCards
              :model-value="form.kind"
              :choices="AUDIENCES"
              label="Who it’s for"
              :columns="3"
              @update:model-value="form.kind = $event as AudienceKind"
            />
            <FieldShell id="an-branch" label="Branch">
              <select id="an-branch" v-model="form.branchId" :class="selectClass">
                <option value="">All branches</option>
                <option v-for="b in options?.branches ?? []" :key="b.id" :value="b.id">
                  {{ b.name }}
                </option>
              </select>
            </FieldShell>
            <FieldShell
              v-if="form.kind === 'classes'"
              id="an-classes"
              label="Classes"
              required
              :error="err('classes')"
              :hint="`${form.classes.length} selected in ${branchName}`"
            >
              <p v-if="!classGroups.length" class="text-sm text-muted-foreground">
                No classes with active students in {{ branchName }}.
              </p>
              <div
                v-else
                id="an-classes"
                class="flex max-h-72 flex-col gap-3 overflow-y-auto rounded-md border p-3"
              >
                <div v-for="g in classGroups" :key="g.level" class="flex flex-col gap-1.5">
                  <button
                    type="button"
                    class="self-start text-xs font-semibold text-muted-foreground hover:text-foreground"
                    @click="toggleLevel(g.arms)"
                  >
                    {{ g.level }} ·
                    {{
                      g.arms.every((a) => form.classes.includes(a.label)) ? 'clear' : 'select all'
                    }}
                  </button>
                  <div class="flex flex-wrap gap-1.5">
                    <label
                      v-for="a in g.arms"
                      :key="a.label"
                      :class="
                        cn(
                          'flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
                          form.classes.includes(a.label)
                            ? 'border-primary bg-brand-subtle'
                            : 'bg-card',
                        )
                      "
                    >
                      <input
                        type="checkbox"
                        class="accent-primary"
                        :checked="form.classes.includes(a.label)"
                        @change="toggleClass(a.label)"
                      />
                      {{ a.label }} <span class="text-faint">{{ a.students }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </FieldShell>
          </div>
        </SectionCard>

        <SectionCard title="Channels">
          <div class="flex flex-col gap-4">
            <div class="grid gap-2 sm:grid-cols-3" role="group" aria-label="Channels">
              <label
                v-for="ch in CHANNELS"
                :key="ch.value"
                :class="
                  cn(
                    'flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2.5 text-sm',
                    form.channels.includes(ch.value) ? 'border-primary bg-brand-subtle' : 'bg-card',
                  )
                "
              >
                <span class="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    class="accent-primary"
                    :checked="form.channels.includes(ch.value)"
                    @change="toggleChannel(ch.value)"
                  />
                  {{ ch.value }}
                </span>
                <span class="text-xs text-muted-foreground">
                  {{ pv ? `Reaches ${fmtCount(pv.reach[ch.value])}` : ch.hint }}
                </span>
              </label>
            </div>
            <p v-if="err('channels')" class="text-xs text-error-strong" role="alert">
              {{ err('channels') }}
            </p>
            <FieldShell
              v-if="hasSms"
              id="an-sms"
              label="SMS text"
              required
              :error="err('smsText')"
              :hint="`${fmtCount(sms.length)} characters · ${sms.pages || 0} page${sms.pages === 1 ? '' : 's'} (${sms.perPage} per page) · ₦ goes out as N`"
              :hint-tone="sms.pages > 1 ? 'warning' : 'muted'"
            >
              <Textarea
                id="an-sms"
                v-model="form.smsText"
                rows="3"
                placeholder="Short version for SMS"
              />
              <button
                type="button"
                class="mt-1 self-start text-xs font-medium text-primary hover:underline"
                @click="copyToSms"
              >
                Fill from the title and message
              </button>
            </FieldShell>
          </div>
        </SectionCard>

        <SectionCard title="Delivery">
          <div class="flex flex-col gap-4">
            <ChoiceCards
              :model-value="form.when"
              :choices="[
                { value: 'now', label: 'Send now' },
                { value: 'later', label: 'Schedule', description: 'Up to 90 days ahead' },
              ]"
              label="When"
              :columns="2"
              @update:model-value="form.when = $event as 'now' | 'later'"
            />
            <div class="grid gap-4 sm:grid-cols-2">
              <FieldShell
                v-if="form.when === 'later'"
                id="an-when"
                label="Send at"
                required
                :error="err('scheduledFor')"
              >
                <Input
                  id="an-when"
                  v-model="form.scheduledFor"
                  type="datetime-local"
                  :min="minSchedule"
                />
              </FieldShell>
              <FieldShell
                id="an-expiry"
                label="Expires on"
                :error="err('expiresOn')"
                hint="Optional. It leaves the portals after this day."
              >
                <Input
                  id="an-expiry"
                  v-model="form.expiresOn"
                  type="date"
                  :min="localStamp().slice(0, 10)"
                />
              </FieldShell>
            </div>
          </div>
        </SectionCard>
      </div>

      <div class="flex flex-col gap-4 lg:sticky lg:top-4">
        <SectionCard title="Summary">
          <p v-if="!previewInput" class="text-sm text-muted-foreground">
            Choose at least one class to count recipients.
          </p>
          <p v-else-if="previewError" class="text-sm text-error-strong">
            {{ getApiErrorMessage(previewError, 'Couldn’t count recipients.') }}
          </p>
          <div
            v-else-if="pv"
            :class="cn('flex flex-col gap-3 text-sm', previewing && 'opacity-60')"
          >
            <div>
              <p class="text-2xl font-semibold tabular-nums">{{ fmtCount(pv.recipients) }}</p>
              <p class="text-xs text-muted-foreground">recipients · {{ pv.label }}</p>
            </div>
            <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13px]">
              <template v-for="b in pv.byRole" :key="b.role">
                <dt class="text-muted-foreground">{{ b.role }}s</dt>
                <dd class="text-right tabular-nums">{{ fmtCount(b.count) }}</dd>
              </template>
              <template v-for="ch in form.channels" :key="ch">
                <dt class="text-muted-foreground">Reached by {{ ch }}</dt>
                <dd class="text-right tabular-nums">{{ fmtCount(pv.reach[ch]) }}</dd>
              </template>
              <template v-if="hasSms">
                <dt class="text-muted-foreground">SMS units</dt>
                <dd class="text-right tabular-nums">{{ fmtCount(pv.smsUnits) }}</dd>
                <dt class="text-muted-foreground">Estimated cost</dt>
                <dd class="text-right tabular-nums">{{ formatNaira(pv.smsCost) }}</dd>
                <dt class="text-muted-foreground">Credit left after</dt>
                <dd
                  :class="
                    cn('text-right tabular-nums', !pv.enough && 'font-medium text-error-strong')
                  "
                >
                  {{ fmtCount(pv.credit - pv.smsUnits) }}
                </dd>
                <dt class="text-muted-foreground">Sender</dt>
                <dd class="text-right">{{ pv.sender }}</dd>
              </template>
            </dl>
            <InlineNotice
              v-if="hasSms && !pv.enough"
              tone="error"
              title="Not enough SMS credit"
              :description="`This needs ${fmtCount(pv.smsUnits)} units and your school has ${fmtCount(pv.credit)}. Remove SMS, shorten the text, narrow the audience, or ask EduTrack support to top up.`"
            />
            <InlineNotice
              v-if="hasSms && pv.senderNote"
              tone="info"
              title="Sender ID"
              :description="pv.senderNote"
            />
            <InlineNotice
              v-if="hasSms && pv.quietHoursNote"
              tone="neutral"
              title="Quiet hours"
              :description="pv.quietHoursNote"
            />
            <ul
              v-if="pv.gaps.length"
              class="flex list-disc flex-col gap-1 pl-4 text-xs text-muted-foreground"
            >
              <li v-for="g in pv.gaps" :key="g">{{ g }}</li>
            </ul>
          </div>
          <p v-else class="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner class="size-4" /> Counting recipients…
          </p>
        </SectionCard>

        <div class="flex flex-wrap gap-2">
          <Button :disabled="save.isPending.value" @click="send">
            <Spinner v-if="save.isPending.value" class="size-4" />
            {{ form.when === 'later' ? 'Schedule…' : 'Send…' }}
          </Button>
          <Button variant="outline" :disabled="save.isPending.value" @click="saveDraft"
            >Save draft</Button
          >
          <Button as-child variant="ghost">
            <RouterLink :to="{ name: routesPath.communication.announcements.name }"
              >Cancel</RouterLink
            >
          </Button>
        </div>
      </div>
    </div>
  </template>
</template>
