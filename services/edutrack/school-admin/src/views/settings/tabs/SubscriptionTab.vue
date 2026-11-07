<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import type { StatusTone } from '@edutrack/ui/lib/status';
import { CheckIcon, MinusIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MeterRow from '@edutrack/app-kit/components/common/MeterRow.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { formatCount, formatNaira } from '@edutrack/app-kit/lib/format';

import { useSubscriptionQuery } from '@/api/services/settings';
import type { SubscriptionStatus } from '@/types';
import { fmtDay } from '@/views/finance/finance-tones';

import { supportLink } from '../settings-shared';

const { data, isPending, isError, refetch } = useSubscriptionQuery();

const STATUS_TONE: Record<SubscriptionStatus, StatusTone> = {
  Active: 'success',
  'Renewal due': 'warning',
  Overdue: 'error',
  Restricted: 'error',
};

const notice = computed(() => {
  const s = data.value;
  if (!s) return null;
  const days = Math.abs(s.daysToRenewal);
  switch (s.status) {
    case 'Renewal due':
      return {
        tone: 'warning' as const,
        title: `Your plan renews in ${days} day${days === 1 ? '' : 's'}`,
        description: `Renewal is due on ${fmtDay(s.renewsOn)}. Contact Edutrack to renew or change plan so nothing is paused.`,
      };
    case 'Overdue':
      return {
        tone: 'error' as const,
        title: `Renewal is ${days} day${days === 1 ? '' : 's'} overdue`,
        description:
          'Everything still works for now. After 14 days, creating invoices, admitting students and sending messages are paused until the renewal is confirmed.',
      };
    case 'Restricted':
      return {
        tone: 'error' as const,
        title: 'Your subscription is restricted',
        description:
          'You can still sign in, view and export everything. Creating invoices, admitting students and sending messages are paused. No data has been deleted.',
      };
    default:
      return null;
  }
});

const pct = (used: number, limit: number) => (limit ? Math.min(100, (used / limit) * 100) : 0);
const meterColor = (used: number, limit: number) =>
  pct(used, limit) >= 100 ? '#A63C35' : pct(used, limit) >= 90 ? '#B7791F' : '#24664A';

const nearLimit = computed(() => {
  const u = data.value?.usage;
  if (!u) return [];
  const out: string[] = [];
  if (u.studentLimit && u.students / u.studentLimit >= 0.9)
    out.push(`students (${formatCount(u.students)} of ${formatCount(u.studentLimit)})`);
  if (u.branchLimit && u.branches >= u.branchLimit)
    out.push(`branches (${u.branches} of ${u.branchLimit})`);
  return out;
});

const SENDER_HINT: Record<string, string> = {
  'Not requested': 'SMS goes out from “EDUTRACK” until your own sender ID is approved.',
  'Pending approval': 'Awaiting approval by the networks. SMS goes out from “EDUTRACK” until then.',
  Approved: 'Parents see your school’s name as the sender.',
  Rejected: 'Rejected by the networks. Request a different one in Notifications.',
};
</script>

<template>
  <div v-if="isPending" class="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
    <Skeleton class="h-56 w-full" /><Skeleton class="h-56 w-full" />
  </div>
  <InlineNotice
    v-else-if="isError || !data"
    tone="error"
    title="Your subscription couldn’t load"
    description="Check your connection and try again."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>
  <div v-else class="flex flex-col gap-4">
    <InlineNotice
      v-if="notice"
      :tone="notice.tone"
      :title="notice.title"
      :description="notice.description"
    >
      <template #action>
        <Button size="sm" as-child>
          <RouterLink
            :to="
              supportLink(
                'Account & billing',
                `Renew our ${data.plan} plan`,
                `Our ${data.plan} plan renews on ${fmtDay(data.renewsOn)}. Please send the renewal invoice and payment details.`,
              )
            "
            >Contact Edutrack</RouterLink
          >
        </Button>
      </template>
    </InlineNotice>
    <InlineNotice
      v-if="nearLimit.length"
      tone="warning"
      :title="`You’re close to your plan’s limit for ${nearLimit.join(' and ')}`"
      description="Upgrade before you reach it, or new admissions and branches will be blocked."
    >
      <template #action>
        <Button variant="outline" size="sm" as-child>
          <RouterLink
            :to="
              supportLink(
                'Account & billing',
                'Increase our plan limits',
                `We are using ${nearLimit.join(' and ')} on the ${data.plan} plan and need more room.`,
              )
            "
            >Ask about upgrading</RouterLink
          >
        </Button>
      </template>
    </InlineNotice>

    <div class="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <section class="flex flex-col gap-3 rounded-lg border bg-card px-4.5 py-4">
        <header class="flex items-center justify-between gap-2">
          <h2 class="text-[15px] font-semibold">Plan</h2>
          <StatusBadge :label="data.status" :tone="STATUS_TONE[data.status]" />
        </header>
        <dl class="grid grid-cols-[minmax(120px,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
          <dt class="text-faint">Plan</dt>
          <dd class="font-semibold">{{ data.plan }} · {{ data.cycle }}</dd>
          <dt class="text-faint">Price</dt>
          <dd>{{ formatNaira(data.price) }} / year</dd>
          <dt class="text-faint">Started</dt>
          <dd>{{ fmtDay(data.startedOn) }}</dd>
          <dt class="text-faint">Renews</dt>
          <dd>
            {{ fmtDay(data.renewsOn) }}
            <span class="text-faint">
              ·
              {{
                data.daysToRenewal >= 0
                  ? `in ${formatCount(data.daysToRenewal)} days`
                  : `${formatCount(-data.daysToRenewal)} days ago`
              }}
            </span>
          </dd>
          <dt class="text-faint">Billing contact</dt>
          <dd>{{ data.billingContact || '—' }}</dd>
        </dl>
        <p class="text-xs text-muted-foreground">
          Edutrack invoices your school directly. To renew, change plan or update the billing
          contact, raise a request and the accounts team will reply.
        </p>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" as-child>
            <RouterLink
              :to="
                supportLink(
                  'Account & billing',
                  'Renew or change our plan',
                  `We are on the ${data.plan} plan (renews ${fmtDay(data.renewsOn)}). We would like to: `,
                )
              "
              >Renew or change plan</RouterLink
            >
          </Button>
        </div>
      </section>

      <SectionCard title="Usage" description="Live counts from your school’s records.">
        <div class="flex flex-col gap-2">
          <MeterRow
            label="Students"
            :percent="pct(data.usage.students, data.usage.studentLimit)"
            :value="`${formatCount(data.usage.students)} of ${formatCount(data.usage.studentLimit)}`"
            :color="meterColor(data.usage.students, data.usage.studentLimit)"
            value-width="110px"
          />
          <MeterRow
            label="Branches"
            :percent="pct(data.usage.branches, data.usage.branchLimit)"
            :value="`${data.usage.branches} of ${data.usage.branchLimit}`"
            :color="meterColor(data.usage.branches, data.usage.branchLimit)"
            value-width="110px"
          />
        </div>
        <dl
          class="mt-3 grid grid-cols-[minmax(120px,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]"
        >
          <dt class="text-faint">Staff accounts</dt>
          <dd>{{ formatCount(data.usage.staffAccounts) }} · unlimited</dd>
        </dl>
      </SectionCard>
    </div>

    <div class="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <section class="flex flex-col gap-3 rounded-lg border bg-card px-4.5 py-4">
        <header class="flex items-center justify-between gap-2">
          <h2 class="text-[15px] font-semibold">SMS credit</h2>
          <StatusBadge
            v-if="data.usage.smsUnits < 2000"
            :label="data.usage.smsUnits ? 'Running low' : 'No credit'"
            tone="warning"
          />
        </header>
        <dl class="grid grid-cols-[minmax(120px,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
          <dt class="text-faint">Balance</dt>
          <dd class="font-semibold">{{ formatCount(data.usage.smsUnits) }} units</dd>
          <dt class="text-faint">Used this term</dt>
          <dd>{{ formatCount(data.usage.smsUsedThisTerm) }} units</dd>
          <dt class="text-faint">Sender ID</dt>
          <dd>
            {{ data.usage.senderId || 'Not requested' }}
            <span v-if="data.usage.senderId" class="text-faint"
              >· {{ data.usage.senderIdStatus }}</span
            >
          </dd>
        </dl>
        <p class="text-xs text-muted-foreground">{{ SENDER_HINT[data.usage.senderIdStatus] }}</p>
        <p class="text-xs text-muted-foreground">
          In-app and email messages are included in your plan. SMS uses credit: one unit per 160
          characters, per recipient.
        </p>
        <div>
          <Button variant="outline" size="sm" as-child>
            <RouterLink
              :to="
                supportLink(
                  'Account & billing',
                  'Buy SMS credit',
                  `Our SMS balance is ${formatCount(data.usage.smsUnits)} units. We would like to buy: `,
                )
              "
              >Buy SMS credit</RouterLink
            >
          </Button>
        </div>
      </section>

      <section class="flex flex-col gap-3 rounded-lg border bg-card px-4.5 py-4">
        <header class="flex items-center justify-between gap-2">
          <h2 class="text-[15px] font-semibold">Modules on your plan</h2>
          <RouterLink
            :to="{ query: { tab: 'modules' } }"
            class="text-xs font-medium text-primary hover:underline"
            >All modules</RouterLink
          >
        </header>
        <ul class="flex flex-col gap-1.5 text-[13px]">
          <li v-for="m in data.modules" :key="m.name" class="flex items-center gap-2">
            <CheckIcon v-if="m.included" class="size-3.5 text-success-strong" aria-hidden="true" />
            <MinusIcon v-else class="size-3.5 text-faint" aria-hidden="true" />
            <span :class="!m.included && 'text-muted-foreground'">{{ m.name }}</span>
            <span v-if="!m.included" class="text-xs text-faint">· not on your plan</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
