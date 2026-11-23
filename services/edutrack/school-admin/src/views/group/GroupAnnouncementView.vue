<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Textarea } from '@edutrack/ui/components/textarea';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { refDebounced } from '@vueuse/core';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';

import {
  previewGroupAnnouncement,
  useGroupOverviewQuery,
  useSendGroupAnnouncementMutation,
  type GroupAnnouncementPreview,
  type GroupAnnouncementResult,
  type GroupAudience,
  type GroupChannel,
} from '@/api/services/group';
import { smsLength, smsSafe } from '@/lib/sms';

/**
 * School Admin › Group overview › Announcement: one message sent in several of the group's
 * schools at once. Each school sends its own copy, to its own people, from its own SMS units and
 * sender ID, and it shows in that school's Communication history. Group owner only.
 */
const AUDIENCES: { value: GroupAudience; label: string; description: string }[] = [
  { value: 'parents', label: 'Parents', description: 'Fee payers and guardians' },
  { value: 'everyone', label: 'Everyone', description: 'Parents, students and staff' },
  { value: 'students', label: 'Students', description: 'In the Student Portal only' },
  { value: 'teachers', label: 'Teachers', description: 'Teaching staff' },
  { value: 'staff', label: 'All staff', description: 'Teaching and non-teaching' },
];
const CHANNELS: GroupChannel[] = ['In-app', 'Email', 'SMS'];

const { data: overview, isPending, error } = useGroupOverviewQuery();
const send = useSendGroupAnnouncementMutation();

const form = reactive({
  title: '',
  body: '',
  audience: 'parents' as GroupAudience,
  channels: ['In-app'] as GroupChannel[],
  smsText: '',
  schoolIds: [] as string[],
});
const errors = reactive<Record<string, string>>({});
const result = ref<GroupAnnouncementResult | null>(null);

// Every school is chosen to start with.
watch(
  overview,
  (o) => {
    if (o && !form.schoolIds.length) form.schoolIds = o.schools.map((s) => s.id);
  },
  { immediate: true },
);

const toggle = <T,>(list: T[], v: T, on: boolean) =>
  on ? [...new Set([...list, v])] : list.filter((x) => x !== v);
const sms = computed(() => form.channels.includes('SMS'));
const smsInfo = computed(() => smsLength(smsSafe(form.smsText)));

// Who it reaches, counted as the choices change.
const audienceKey = computed(() =>
  JSON.stringify([form.audience, form.channels, sms.value ? form.smsText : '', form.schoolIds]),
);
const debounced = refDebounced(audienceKey, 400);
const preview = ref<GroupAnnouncementPreview | null>(null);
const counting = ref(false);
watch(
  debounced,
  async () => {
    if (!form.schoolIds.length || !form.channels.length) return void (preview.value = null);
    counting.value = true;
    try {
      preview.value = await previewGroupAnnouncement({
        audience: form.audience,
        channels: form.channels,
        smsText: sms.value ? form.smsText : undefined,
        schoolIds: form.schoolIds,
      });
    } catch {
      preview.value = null;
    } finally {
      counting.value = false;
    }
  },
  { immediate: true },
);

function check() {
  for (const k of Object.keys(errors)) delete errors[k];
  if (!form.title.trim()) errors.title = 'Add a title.';
  if (!form.body.trim()) errors.body = 'Write the message.';
  if (!form.channels.length) errors.channels = 'Choose at least one channel.';
  if (sms.value && !form.smsText.trim()) errors.smsText = 'Write the SMS version of the message.';
  if (!form.schoolIds.length) errors.schoolIds = 'Choose at least one school.';
  return !Object.keys(errors).length;
}

async function submit() {
  if (!check()) return;
  try {
    const r = await send.mutateAsync({
      title: form.title.trim(),
      body: form.body.trim(),
      audience: form.audience,
      channels: form.channels,
      smsText: sms.value ? form.smsText.trim() : undefined,
      schoolIds: form.schoolIds,
    });
    result.value = r;
    if (r.sent === r.results.length)
      toast.success(`Sent in ${r.sent} schools to ${r.recipients.toLocaleString('en-NG')} people.`);
    else toast.warning(`Sent in ${r.sent} of ${r.results.length} schools.`);
  } catch (e) {
    const fields = (e as { response?: { data?: { error?: { fields?: Record<string, string> } } } })
      .response?.data?.error?.fields;
    if (fields) Object.assign(errors, fields);
    toast.error(getApiErrorMessage(e, 'The announcement couldn’t be sent. Try again.'));
  }
}

function again() {
  result.value = null;
  form.title = '';
  form.body = '';
  form.smsText = '';
}
</script>

<template>
  <PageHeader
    title="Group announcement"
    description="One message to every chosen school. Each school sends its own copy, from its own SMS units."
  />
  <Skeleton v-if="isPending" class="h-80" />
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="Group announcements can’t be shown"
    :description="getApiErrorMessage(error)"
  />
  <template v-else-if="overview">
    <InlineNotice
      v-if="overview.role !== 'Group owner'"
      tone="info"
      title="Only the group owner can send to every school"
      description="Ask the group owner, or send from each school’s Communication page."
    />
    <SectionCard v-else-if="result" title="Sent">
      <ul class="flex flex-col divide-y">
        <li v-for="r in result.results" :key="r.schoolId" class="flex justify-between gap-3 py-2">
          <span class="font-medium">{{ r.school }}</span>
          <span v-if="r.sent" class="text-sm text-success-strong"
            >Sent to {{ r.recipients.toLocaleString('en-NG') }}</span
          >
          <span v-else class="text-sm text-destructive">{{ r.error }}</span>
        </li>
      </ul>
      <div class="mt-4">
        <Button variant="outline" @click="again">Send another</Button>
      </div>
    </SectionCard>
    <div v-else class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div class="flex flex-col gap-4">
        <SectionCard title="Message">
          <div class="flex flex-col gap-4">
            <FieldShell id="ga-title" label="Title" required :error="errors.title">
              <Input id="ga-title" v-model="form.title" maxlength="120" />
            </FieldShell>
            <FieldShell
              id="ga-body"
              label="Message"
              required
              :error="errors.body"
              :hint="`${form.body.length} of 2,000 characters`"
            >
              <Textarea id="ga-body" v-model="form.body" rows="5" maxlength="2000" />
            </FieldShell>
          </div>
        </SectionCard>
        <SectionCard title="Audience">
          <div class="flex flex-col gap-4">
            <ChoiceCards
              :model-value="form.audience"
              :choices="AUDIENCES"
              label="Who it’s for, in each school"
              :columns="3"
              @update:model-value="form.audience = $event as GroupAudience"
            />
            <FieldShell id="ga-schools" label="Schools" required :error="errors.schoolIds">
              <div id="ga-schools" class="flex flex-wrap gap-3">
                <label
                  v-for="s in overview.schools"
                  :key="s.id"
                  class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <Checkbox
                    :model-value="form.schoolIds.includes(s.id)"
                    @update:model-value="
                      (v) => (form.schoolIds = toggle(form.schoolIds, s.id, v === true))
                    "
                  />
                  {{ s.name }}
                </label>
              </div>
            </FieldShell>
          </div>
        </SectionCard>
        <SectionCard title="Channels">
          <div class="flex flex-col gap-4">
            <div class="flex flex-wrap gap-3">
              <label
                v-for="c in CHANNELS"
                :key="c"
                class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <Checkbox
                  :model-value="form.channels.includes(c)"
                  @update:model-value="
                    (v) => (form.channels = toggle(form.channels, c, v === true))
                  "
                />
                {{ c }}
              </label>
            </div>
            <p v-if="errors.channels" class="text-sm text-destructive">{{ errors.channels }}</p>
            <FieldShell
              v-if="sms"
              id="ga-sms"
              label="SMS text"
              required
              :error="errors.smsText"
              :hint="`${smsInfo.length} characters · ${smsInfo.pages} SMS page${smsInfo.pages === 1 ? '' : 's'}`"
            >
              <Textarea id="ga-sms" v-model="form.smsText" rows="3" />
            </FieldShell>
          </div>
        </SectionCard>
      </div>
      <div class="flex flex-col gap-3">
        <SectionCard title="Summary">
          <p v-if="!preview" class="text-sm text-muted-foreground">
            {{ counting ? 'Counting…' : 'Choose schools and a channel to count recipients.' }}
          </p>
          <div v-else class="flex flex-col gap-3 text-sm">
            <p>
              <span class="text-lg font-semibold tabular-nums">{{
                preview.recipients.toLocaleString('en-NG')
              }}</span>
              recipients
              <template v-if="sms">
                · {{ preview.smsUnits.toLocaleString('en-NG') }} SMS units</template
              >
            </p>
            <ul class="flex flex-col gap-2">
              <li v-for="s in preview.schools" :key="s.schoolId" class="rounded-md border p-2">
                <div class="flex justify-between gap-2">
                  <span class="font-medium">{{ s.school }}</span>
                  <span class="tabular-nums">{{ s.recipients.toLocaleString('en-NG') }}</span>
                </div>
                <p v-if="s.error" class="text-xs text-destructive">{{ s.error }}</p>
                <p v-else-if="sms && !s.enough" class="text-xs text-warning-strong">
                  Needs {{ s.smsUnits }} SMS units, has {{ s.credit }}.
                </p>
                <p v-for="n in s.notes" :key="n" class="text-xs text-muted-foreground">{{ n }}</p>
              </li>
            </ul>
          </div>
        </SectionCard>
        <Button :disabled="send.isPending.value" @click="submit">{{
          send.isPending.value ? 'Sending…' : 'Send now'
        }}</Button>
      </div>
    </div>
  </template>
</template>
