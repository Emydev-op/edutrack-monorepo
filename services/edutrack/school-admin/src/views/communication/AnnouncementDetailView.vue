<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  useAnnouncementActionMutation,
  useAnnouncementQuery,
  useDeleteAnnouncementMutation,
} from '@/api/services/communication';
import { smsLength, smsSafe } from '@/lib/sms';
import { routesPath } from '@/router/routes-path';

import ChannelStats from './ChannelStats.vue';
import { fmtCount, fmtStamp } from './comms-tones';

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const id = computed(() => String(route.params.id));
const { data: a, isPending, error } = useAnnouncementQuery(id);
const action = useAnnouncementActionMutation();
const remove = useDeleteAnnouncementMutation();

const details = computed(() => {
  const x = a.value;
  if (!x) return [];
  return [
    { label: 'Audience', value: x.audienceLabel },
    { label: 'Channels', value: x.channels.join(', ') || '—' },
    {
      label: x.status === 'Scheduled' ? 'Sends' : x.status === 'Draft' ? 'Not sent' : 'Sent',
      value:
        x.status === 'Scheduled' ? fmtStamp(x.scheduledFor) : x.sentAt ? fmtStamp(x.sentAt) : '—',
    },
    { label: 'Recipients', value: x.recipients === null ? '—' : fmtCount(x.recipients) },
    ...(x.channels.includes('SMS') && x.sentAt
      ? [{ label: 'SMS units used', value: fmtCount(x.smsUnits) }]
      : []),
    { label: 'Expires', value: x.expiresOn ? fmtStamp(x.expiresOn) : 'Stays until withdrawn' },
    { label: 'Written by', value: x.createdBy },
  ];
});
const smsPages = computed(() => (a.value?.smsText ? smsLength(smsSafe(a.value.smsText)).pages : 0));

async function run(kind: 'cancel' | 'duplicate') {
  try {
    const res = await action.mutateAsync({ id: id.value, action: kind });
    if (kind === 'duplicate') {
      toast.success('Copied as a new draft.');
      void router.push({
        name: routesPath.communication.announcementEdit.name,
        params: { id: res.id },
      });
    } else toast.success('Schedule cancelled. It’s a draft again.');
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'That didn’t work. Try again.'));
  }
}

function withdraw() {
  void confirm({
    title: 'Withdraw this announcement?',
    description: 'It disappears from the parent, student and staff portals.',
    details: [['Email and SMS', 'Already delivered and can’t be recalled']],
    input: {
      label: 'Reason (optional)',
      placeholder: 'e.g. Wrong date. A corrected notice follows.',
    },
    confirmLabel: 'Withdraw',
    tone: 'destructive',
    action: async ({ text }) => {
      await action.mutateAsync({ id: id.value, action: 'withdraw', reason: text });
      toast.success('Withdrawn from the portals.');
    },
  });
}

function del() {
  void confirm({
    title: 'Delete this draft?',
    description: 'Nobody has seen it. This can’t be undone.',
    confirmLabel: 'Delete draft',
    tone: 'destructive',
    action: async () => {
      await remove.mutateAsync(id.value);
      toast.success('Draft deleted.');
      void router.replace({ name: routesPath.communication.announcements.name });
    },
  });
}
</script>

<template>
  <EmptyState
    v-if="error"
    title="Announcement not found"
    description="It may have been deleted, or the link is wrong."
  >
    <Button as-child variant="outline">
      <RouterLink :to="{ name: routesPath.communication.announcements.name }"
        >Back to announcements</RouterLink
      >
    </Button>
  </EmptyState>
  <p v-else-if="isPending || !a" class="text-sm text-muted-foreground">Loading…</p>
  <template v-else>
    <PageHeader
      :title="a.title || 'Untitled draft'"
      :description="a.audienceLabel"
      :status="a.status"
    >
      <template #actions>
        <Button v-if="a.canDelete" variant="outline" @click="del">Delete</Button>
        <Button v-if="a.canWithdraw" variant="outline" @click="withdraw">Withdraw</Button>
        <Button
          v-if="a.canCancel"
          variant="outline"
          :disabled="action.isPending.value"
          @click="run('cancel')"
          >Cancel schedule</Button
        >
        <Button variant="outline" :disabled="action.isPending.value" @click="run('duplicate')"
          >Duplicate</Button
        >
        <Button v-if="a.canEdit" as-child>
          <RouterLink
            :to="{ name: routesPath.communication.announcementEdit.name, params: { id: a.id } }"
            >{{ a.status === 'Draft' ? 'Continue editing' : 'Edit' }}</RouterLink
          >
        </Button>
      </template>
    </PageHeader>

    <InlineNotice
      v-if="a.status === 'Scheduled'"
      tone="info"
      :title="`Goes out ${fmtStamp(a.scheduledFor)}`"
      description="You can edit or cancel it until then. Recipients are counted again when it sends."
    />
    <InlineNotice
      v-else-if="a.status === 'Withdrawn'"
      tone="warning"
      :title="`Withdrawn ${fmtStamp(a.withdrawnAt)}`"
      :description="`${a.withdrawReason ? `${a.withdrawReason} ` : ''}It no longer shows in the portals. Email and SMS already sent can’t be recalled.`"
    />
    <InlineNotice
      v-else-if="a.status === 'Expired'"
      tone="neutral"
      title="Expired"
      :description="`It left the portals after ${fmtStamp(a.expiresOn)}.`"
    />
    <InlineNotice
      v-else-if="a.status === 'Draft'"
      tone="neutral"
      title="Draft"
      description="Not sent. Only staff can see it here."
    />

    <div class="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
      <div class="flex flex-col gap-4">
        <SectionCard title="Message">
          <div class="flex flex-col gap-3">
            <p class="text-sm whitespace-pre-line">{{ a.body || 'No message yet.' }}</p>
            <div
              v-if="a.channels.includes('SMS')"
              class="rounded-md border bg-muted/40 px-3 py-2 text-[13px]"
            >
              <p class="text-xs font-medium text-muted-foreground">
                SMS · {{ smsPages }} page{{ smsPages === 1 ? '' : 's' }}
              </p>
              <p class="whitespace-pre-line">{{ a.smsText || 'No SMS text yet.' }}</p>
            </div>
          </div>
        </SectionCard>
        <SectionCard v-if="a.messageId" title="Delivery">
          <template #actions>
            <RouterLink
              :to="{
                name: routesPath.communication.deliveryDetail.name,
                params: { id: a.messageId },
              }"
              class="text-[13px] font-medium text-primary hover:underline"
              >Recipients & delivery log</RouterLink
            >
          </template>
          <ChannelStats :stats="a.stats" />
        </SectionCard>
      </div>
      <div class="flex flex-col gap-4">
        <KeyValueCard title="Details" :rows="details" />
        <ActivityTimeline :items="a.history" title="History" />
      </div>
    </div>
  </template>
</template>
