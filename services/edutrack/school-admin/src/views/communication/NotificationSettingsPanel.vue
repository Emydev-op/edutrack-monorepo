<script setup lang="ts">
/** Settings → Notifications. CONTRACT: no props; rendered inside the Settings page's Notifications tab. */
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { Switch } from '@edutrack/ui/components/switch';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useCommsSettingsQuery,
  useRequestSenderIdMutation,
  useSaveEventSettingsMutation,
  useSaveQuietHoursMutation,
} from '@/api/services/communication';
import { routesPath } from '@/router/routes-path';
import type { Channel, CommsSettings, EventSettingsPayload } from '@/types';

import { supportLink, useSettingsDirtyGuard } from '../settings/settings-shared';
import { commsTone, fmtCount, fmtStamp } from './comms-tones';

const CHANNELS: Channel[] = ['In-app', 'Email', 'SMS'];

const { data: s, isPending, error } = useCommsSettingsQuery();
const saveEvents = useSaveEventSettingsMutation();
const saveQuiet = useSaveQuietHoursMutation();
const requestSender = useRequestSenderIdMutation();

/* ---------------- Channels per event ---------------- */

const matrix = reactive<EventSettingsPayload>({});
const matrixInitial = ref('');
const quiet = reactive({ enabled: false, start: '21:00', end: '07:00' });
const quietInitial = ref('');
const sender = ref('');
const senderError = ref('');
const matrixError = ref('');

function load(x: CommsSettings) {
  for (const k of Object.keys(matrix)) delete matrix[k];
  for (const e of x.events)
    if (e.key !== 'announcement') matrix[e.key] = { active: e.active, channels: [...e.channels] };
  matrixInitial.value = JSON.stringify(matrix);
  Object.assign(quiet, x.quietHours);
  quietInitial.value = JSON.stringify(quiet);
}
watch(s, (x) => x && !matrixInitial.value && load(x), { immediate: true });

const matrixDirty = computed(
  () => !!matrixInitial.value && JSON.stringify(matrix) !== matrixInitial.value,
);
const quietDirty = computed(
  () => !!quietInitial.value && JSON.stringify(quiet) !== quietInitial.value,
);
useSettingsDirtyGuard(() => matrixDirty.value || quietDirty.value);

const rows = computed(() => (s.value?.events ?? []).filter((e) => e.key !== 'announcement'));
const rowErrors = computed(() => {
  const e: Record<string, string> = {};
  for (const r of rows.value) {
    const m = matrix[r.key];
    if (m?.active && !m.channels.length) e[r.key] = 'Choose a channel, or switch it off.';
  }
  return e;
});

function toggle(key: string, ch: Channel) {
  const m = matrix[key];
  if (!m) return;
  m.channels = m.channels.includes(ch)
    ? m.channels.filter((c) => c !== ch)
    : CHANNELS.filter((c) => c === ch || m.channels.includes(c));
}

async function submitMatrix() {
  if (Object.keys(rowErrors.value).length) return;
  matrixError.value = '';
  try {
    const x = await saveEvents.mutateAsync({ ...matrix });
    load(x);
    toast.success('Notification channels saved. New messages follow them.');
  } catch (e) {
    matrixError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}

/* ---------------- Quiet hours ---------------- */

async function submitQuiet() {
  try {
    const x = await saveQuiet.mutateAsync({ ...quiet });
    Object.assign(quiet, x.quietHours);
    quietInitial.value = JSON.stringify(quiet);
    toast.success(
      quiet.enabled
        ? `SMS quiet hours set to ${quiet.start}–${quiet.end}.`
        : 'SMS quiet hours turned off.',
    );
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'That didn’t save. Try again.'));
  }
}
const quietError = computed(() =>
  quiet.enabled && quiet.start === quiet.end ? 'Start and end must be different times.' : '',
);

/* ---------------- Sender ID ---------------- */

const senderValid = computed(() => /^[A-Za-z][A-Za-z0-9]{2,10}$/.test(sender.value.trim()));
async function submitSender() {
  senderError.value = '';
  if (!senderValid.value) {
    senderError.value = 'Use 3 to 11 letters or numbers, starting with a letter, with no spaces.';
    return;
  }
  try {
    await requestSender.mutateAsync(sender.value.trim());
    toast.success('Sender ID requested. SMS goes out from “EDUTRACK” until networks approve it.');
    sender.value = '';
  } catch (e) {
    senderError.value = getApiErrorMessage(e, 'That didn’t go through. Try again.');
  }
}

const buyCredit = computed(() =>
  supportLink(
    'Account & billing',
    'Buy SMS credit',
    `We’d like to top up our SMS credit. Current balance: ${fmtCount(s.value?.credit.units ?? 0)} units. Units needed: `,
  ),
);
const timeClass = 'h-9 w-full rounded-md border bg-card px-2.5 text-sm';
</script>

<template>
  <p v-if="error" class="text-sm text-error-strong">
    {{ getApiErrorMessage(error, 'Notification settings couldn’t load. Refresh to try again.') }}
  </p>
  <p v-else-if="isPending || !s" class="text-sm text-muted-foreground">Loading…</p>
  <div v-else class="flex flex-col gap-4">
    <div class="grid items-start gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <SectionCard title="SMS sender ID" description="The name parents see SMS come from.">
        <template #actions
          ><StatusBadge :label="s.senderId.status" :tone="commsTone(s.senderId.status)"
        /></template>
        <div class="flex flex-col gap-3 text-[13px]">
          <p>
            <template v-if="s.senderId.name"
              >“{{ s.senderId.name }}”<template v-if="s.senderId.requestedAt">
                · requested {{ fmtStamp(s.senderId.requestedAt) }}</template
              >.
            </template>
            SMS currently goes out from <strong>{{ s.sender }}</strong
            >.
          </p>
          <p v-if="s.senderId.note" class="text-xs text-muted-foreground">{{ s.senderId.note }}</p>
          <FieldShell
            id="sender-id"
            :label="s.senderId.name ? 'Request a different sender ID' : 'Request a sender ID'"
            :error="senderError"
            hint="3 to 11 letters or numbers, starting with a letter. Networks review it."
          >
            <div class="flex gap-2">
              <Input
                id="sender-id"
                v-model="sender"
                maxlength="11"
                class="uppercase"
                placeholder="e.g. GREENFIELD"
              />
              <Button
                variant="outline"
                :disabled="!sender.trim() || requestSender.isPending.value"
                @click="submitSender"
                >Request</Button
              >
            </div>
          </FieldShell>
        </div>
      </SectionCard>

      <SectionCard title="SMS credit" description="Used by SMS only. In-app and email are free.">
        <div class="flex flex-col gap-3 text-[13px]">
          <div class="flex items-baseline gap-2">
            <span class="text-2xl font-semibold tabular-nums">{{ fmtCount(s.credit.units) }}</span>
            <span class="text-muted-foreground"
              >units · about {{ formatNaira(s.credit.units * s.credit.unitPrice) }}</span
            >
          </div>
          <p class="text-muted-foreground">
            {{ fmtCount(s.credit.usedThisTerm) }} units used this term. One unit sends one SMS page
            to one person.
          </p>
          <InlineNotice
            v-if="s.credit.low"
            tone="warning"
            :title="s.credit.units ? 'Credit is running low' : 'No SMS credit'"
            description="SMS waits in the queue until there’s credit. EduTrack support can top it up."
          />
          <Button as-child variant="outline" class="self-start">
            <RouterLink :to="buyCredit">Buy SMS credit</RouterLink>
          </Button>
        </div>
      </SectionCard>
    </div>

    <SectionCard
      title="Channels per event"
      description="Which automatic messages go out, and how. Announcements use the channels picked when writing them."
    >
      <template #actions>
        <RouterLink
          :to="{ name: routesPath.communication.delivery.name, query: { tab: 'templates' } }"
          class="text-[13px] font-medium text-primary hover:underline"
          >Edit wording</RouterLink
        >
      </template>
      <InlineNotice
        v-if="matrixError"
        tone="error"
        title="Couldn’t save"
        :description="matrixError"
        role="alert"
        class="mb-3"
      />
      <div class="overflow-x-auto">
        <table class="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr class="border-b text-left text-xs text-muted-foreground">
              <th class="py-2 pr-3 font-medium">Event</th>
              <th class="w-20 py-2 font-medium">On</th>
              <th v-for="ch in CHANNELS" :key="ch" class="w-20 py-2 text-center font-medium">
                {{ ch }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.key" class="border-b border-divider align-top">
              <td class="py-2.5 pr-3">
                <p class="font-medium">{{ r.label }}</p>
                <p class="text-xs text-faint">{{ r.who }} · {{ r.trigger }}</p>
                <p v-if="r.locked" class="text-xs text-muted-foreground">{{ r.locked }}</p>
                <p v-if="rowErrors[r.key]" class="text-xs text-error-strong" role="alert">
                  {{ rowErrors[r.key] }}
                </p>
              </td>
              <td class="py-2.5">
                <Switch
                  v-if="matrix[r.key]"
                  v-model="matrix[r.key]!.active"
                  :disabled="!!r.locked"
                  :aria-label="`${r.label} notifications`"
                />
              </td>
              <td v-for="ch in CHANNELS" :key="ch" class="py-2.5 text-center">
                <span
                  v-if="!r.available.includes(ch)"
                  class="text-faint"
                  :title="`${r.label} can’t go by ${ch}`"
                  >—</span
                >
                <input
                  v-else-if="matrix[r.key]"
                  type="checkbox"
                  class="size-4 accent-primary"
                  :checked="matrix[r.key]!.channels.includes(ch)"
                  :disabled="!matrix[r.key]!.active"
                  :aria-label="`${r.label} by ${ch}`"
                  @change="toggle(r.key, ch)"
                />
              </td>
            </tr>
            <tr class="align-top">
              <td class="py-2.5 pr-3">
                <p class="font-medium">Announcement</p>
                <p class="text-xs text-faint">Selected audience · Communication → Announcements</p>
              </td>
              <td class="py-2.5 text-xs text-muted-foreground">Always</td>
              <td
                v-for="ch in CHANNELS"
                :key="ch"
                class="py-2.5 text-center text-xs text-muted-foreground"
              >
                Per message
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <Button
          :disabled="!matrixDirty || saveEvents.isPending.value || !!Object.keys(rowErrors).length"
          @click="submitMatrix"
        >
          <Spinner v-if="saveEvents.isPending.value" class="size-4" /> Save channels
        </Button>
        <Button v-if="matrixDirty" variant="outline" @click="load(s)">Discard changes</Button>
      </div>
    </SectionCard>

    <div class="grid items-start gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <SectionCard
        title="SMS quiet hours"
        description="Announcements, reminders and other non-urgent SMS wait until quiet hours end. Receipts and invitations still go straight away."
      >
        <div class="flex flex-col gap-3">
          <label class="flex items-center gap-2 text-[13px]">
            <Switch v-model="quiet.enabled" aria-label="Quiet hours" /> Hold non-urgent SMS
            overnight
          </label>
          <div :class="cn('grid grid-cols-2 gap-3', !quiet.enabled && 'opacity-50')">
            <FieldShell id="quiet-start" label="From" :error="quietError">
              <input
                id="quiet-start"
                v-model="quiet.start"
                type="time"
                :disabled="!quiet.enabled"
                :class="timeClass"
              />
            </FieldShell>
            <FieldShell id="quiet-end" label="Until">
              <input
                id="quiet-end"
                v-model="quiet.end"
                type="time"
                :disabled="!quiet.enabled"
                :class="timeClass"
              />
            </FieldShell>
          </div>
          <Button
            class="self-start"
            :disabled="
              !quietDirty || !!quietError || !quiet.start || !quiet.end || saveQuiet.isPending.value
            "
            @click="submitQuiet"
            >Save quiet hours</Button
          >
        </div>
      </SectionCard>

      <SectionCard
        title="Change history"
        description="Every change to these settings, newest first."
      >
        <p v-if="!s.history.length" class="text-sm text-muted-foreground">No changes yet.</p>
        <ul v-else class="flex flex-col gap-2.5 text-[13px]">
          <li v-for="h in s.history.slice(0, 12)" :key="h.id" class="flex flex-col">
            <span class="font-medium">{{ h.what }}</span>
            <span class="text-xs text-faint"
              >{{ h.by }} · {{ h.atLabel }}{{ h.detail ? ` · ${h.detail}` : '' }}</span
            >
          </li>
        </ul>
      </SectionCard>
    </div>
  </div>
</template>
