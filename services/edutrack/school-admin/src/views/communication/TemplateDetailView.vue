<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { Textarea } from '@edutrack/ui/components/textarea';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import {
  useResetTemplateMutation,
  useSaveTemplateMutation,
  useTemplateQuery,
} from '@/api/services/communication';
import { smsLength, smsSafe } from '@/lib/sms';
import { routesPath } from '@/router/routes-path';
import type { Channel, ChannelTemplate, TemplateDetail } from '@/types';

import { fmtStamp } from './comms-tones';

const route = useRoute();
const confirm = useConfirm();
const event = computed(() => String(route.params.id));
const { data: t, isPending, error } = useTemplateQuery(event);
const save = useSaveTemplateMutation();
const reset = useResetTemplateMutation();

const form = reactive<Partial<Record<Channel, ChannelTemplate>>>({});
const initial = ref('');
const serverError = ref('');

function load(d: TemplateDetail) {
  for (const ch of ['In-app', 'Email', 'SMS'] as Channel[]) delete form[ch];
  for (const ch of d.available) form[ch] = { ...(d.templates[ch] ?? { subject: '', body: '' }) };
  initial.value = JSON.stringify(form);
}
watch(t, (d) => d && !initial.value && load(d), { immediate: true });

const dirty = computed(() => !!initial.value && JSON.stringify(form) !== initial.value);
useUnsavedChanges(dirty);

const VAR = /\[([a-z_]+)\]/g;
const known = computed(() => new Set(t.value?.variables.map((v) => v.name) ?? []));
const sample = computed(() =>
  Object.fromEntries(t.value?.variables.map((v) => [v.name, v.sample]) ?? []),
);
const render = (text: string) => text.replace(VAR, (_m, n: string) => sample.value[n] ?? `[${n}]`);
const unknownIn = (text: string) =>
  [...text.matchAll(VAR)].map((m) => m[1]!).filter((x) => !known.value.has(x));

const errors = computed(() => {
  const e: Record<string, string> = {};
  for (const ch of t.value?.available ?? []) {
    const f = form[ch];
    if (!f) continue;
    if (!f.body.trim()) e[`${ch}.body`] = `Write the ${ch} message.`;
    if (ch !== 'SMS' && !f.subject.trim())
      e[`${ch}.subject`] = ch === 'Email' ? 'Write the subject.' : 'Write the title.';
    const bad = unknownIn(`${f.subject} ${f.body}`);
    if (bad.length) e[`${ch}.body`] = `[${bad[0]}] isn’t a variable for this message.`;
    if (ch === 'SMS' && smsLength(smsSafe(render(f.body))).pages > 3)
      e['SMS.body'] = 'With sample details this runs past 3 pages.';
  }
  return e;
});

const smsInfo = computed(() => (form.SMS ? smsLength(smsSafe(render(form.SMS.body))) : null));

const fields = ref<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({});
const focused = ref<{ ch: Channel; key: 'subject' | 'body' } | null>(null);
async function insert(name: string) {
  const target =
    focused.value ??
    (t.value?.available[0] ? { ch: t.value.available[0], key: 'body' as const } : null);
  if (!target) return;
  const f = form[target.ch];
  if (!f) return;
  const el = fields.value[`${target.ch}.${target.key}`];
  const text = f[target.key];
  const at = el?.selectionStart ?? text.length;
  const end = el?.selectionEnd ?? at;
  f[target.key] = `${text.slice(0, at)}[${name}]${text.slice(end)}`;
  await nextTick();
  el?.focus();
  const pos = at + name.length + 2;
  el?.setSelectionRange(pos, pos);
}

async function submit() {
  if (Object.keys(errors.value).length) return;
  serverError.value = '';
  try {
    const saved = await save.mutateAsync({ event: event.value, templates: { ...form } });
    load(saved);
    toast.success('Template saved. New messages use this wording.');
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}

function doReset() {
  void confirm({
    title: 'Go back to the default wording?',
    description:
      'Your changes to every channel of this message are replaced. Messages already sent aren’t affected.',
    confirmLabel: 'Use default wording',
    tone: 'destructive',
    action: async () => {
      const d = await reset.mutateAsync(event.value);
      load(d);
      toast.success('Default wording restored.');
    },
  });
}

function discard() {
  if (t.value) load(t.value);
  serverError.value = '';
}
</script>

<template>
  <EmptyState v-if="error" title="Template not found" description="The link may be wrong.">
    <Button as-child variant="outline">
      <RouterLink
        :to="{ name: routesPath.communication.delivery.name, query: { tab: 'templates' } }"
        >Back to templates</RouterLink
      >
    </Button>
  </EmptyState>
  <p v-else-if="isPending || !t" class="text-sm text-muted-foreground">Loading…</p>
  <template v-else>
    <PageHeader
      :title="`${t.label} template`"
      :description="`${t.description}${t.customised ? ` · edited by ${t.updatedBy}, ${fmtStamp(t.updatedAt)}` : ' · default wording'}`"
    >
      <template #actions>
        <Button
          v-if="t.customised"
          variant="outline"
          :disabled="reset.isPending.value"
          @click="doReset"
          >Use default wording</Button
        >
        <Button v-if="dirty" variant="outline" @click="discard">Discard changes</Button>
        <Button
          :disabled="!dirty || save.isPending.value || !!Object.keys(errors).length"
          @click="submit"
        >
          <Spinner v-if="save.isPending.value" class="size-4" /> Save template
        </Button>
      </template>
    </PageHeader>

    <InlineNotice
      v-if="serverError"
      tone="error"
      title="Couldn’t save"
      :description="serverError"
      role="alert"
    />

    <div class="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr] [&>*]:min-w-0">
      <div class="flex flex-col gap-4">
        <SectionCard v-for="ch in t.available" :key="ch" :title="ch">
          <template #actions>
            <StatusBadge
              :label="t.enabled.includes(ch) ? 'On' : 'Off'"
              :tone="t.enabled.includes(ch) ? 'success' : 'neutral'"
            />
          </template>
          <div v-if="form[ch]" class="flex flex-col gap-3">
            <p v-if="!t.enabled.includes(ch)" class="text-xs text-muted-foreground">
              This channel is off for {{ t.label.toLowerCase() }}.
              <RouterLink
                :to="{ name: routesPath.settings.name, query: { tab: 'notifications' } }"
                class="font-medium text-primary hover:underline"
                >Turn it on in Settings</RouterLink
              >
            </p>
            <FieldShell
              v-if="ch !== 'SMS'"
              :id="`tpl-${ch}-subject`"
              :label="ch === 'Email' ? 'Subject' : 'Title'"
              required
              :error="errors[`${ch}.subject`]"
            >
              <Input
                :id="`tpl-${ch}-subject`"
                :ref="
                  (el: unknown) =>
                    (fields[`${ch}.subject`] = ((el as { $el?: HTMLInputElement })?.$el ??
                      el) as HTMLInputElement | null)
                "
                v-model="form[ch]!.subject"
                maxlength="150"
                @focus="focused = { ch, key: 'subject' }"
              />
            </FieldShell>
            <FieldShell
              :id="`tpl-${ch}-body`"
              label="Message"
              required
              :error="errors[`${ch}.body`]"
              :hint="
                ch === 'SMS' && smsInfo
                  ? `About ${smsInfo.length} characters with sample details · ${smsInfo.pages} page${smsInfo.pages === 1 ? '' : 's'} per recipient · ₦ goes out as N`
                  : undefined
              "
              :hint-tone="ch === 'SMS' && smsInfo && smsInfo.pages > 1 ? 'warning' : 'muted'"
            >
              <Textarea
                :id="`tpl-${ch}-body`"
                :ref="
                  (el: unknown) =>
                    (fields[`${ch}.body`] = ((el as { $el?: HTMLTextAreaElement })?.$el ??
                      el) as HTMLTextAreaElement | null)
                "
                v-model="form[ch]!.body"
                :rows="ch === 'Email' ? 8 : 3"
                @focus="focused = { ch, key: 'body' }"
              />
            </FieldShell>
            <div class="rounded-md border bg-muted/40 px-3 py-2 text-[13px]">
              <p class="text-xs font-medium text-muted-foreground">Preview with sample details</p>
              <p v-if="ch !== 'SMS'" class="font-medium">{{ render(form[ch]!.subject) }}</p>
              <p class="whitespace-pre-line break-words">
                {{ ch === 'SMS' ? smsSafe(render(form[ch]!.body)) : render(form[ch]!.body) }}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Variables"
        description="Click to insert at the cursor. Each is filled in for every recipient."
        class="lg:sticky lg:top-4"
      >
        <ul class="flex flex-col gap-2">
          <li v-for="v in t.variables" :key="v.name" class="flex flex-col gap-0.5">
            <button
              type="button"
              class="self-start rounded border bg-card px-1.5 py-0.5 font-mono text-xs hover:border-primary hover:text-primary"
              @click="insert(v.name)"
            >
              [{{ v.name }}]
            </button>
            <span class="text-xs text-muted-foreground"
              >{{ v.description }} · e.g. {{ v.sample }}</span
            >
          </li>
        </ul>
      </SectionCard>
    </div>
  </template>
</template>
