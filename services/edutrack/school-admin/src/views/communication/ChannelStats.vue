<script setup lang="ts">
import { cn } from '@edutrack/ui/lib/utils';

import type { ChannelStats } from '@/types';

import { fmtCount } from './comms-tones';

/** Delivery outcomes per channel: a stacked bar and the counts behind it. */
defineProps<{ stats: ChannelStats[] }>();

const pct = (n: number, of: number) => (of ? (n / of) * 100 : 0);
const readLabel = (ch: string) => (ch === 'Email' ? 'Opened' : ch === 'SMS' ? '' : 'Read');
</script>

<template>
  <p v-if="!stats.length" class="text-sm text-muted-foreground">Nothing was sent.</p>
  <div v-else class="flex flex-col gap-4">
    <div v-for="s in stats" :key="s.channel" class="flex flex-col gap-1.5">
      <div class="flex items-baseline justify-between gap-2 text-[13px]">
        <span class="font-medium">{{ s.channel }}</span>
        <span class="text-xs text-muted-foreground tabular-nums"
          >{{ fmtCount(s.recipients) }} recipients</span
        >
      </div>
      <div
        class="flex h-2 overflow-hidden rounded-full bg-muted"
        role="img"
        :aria-label="`${s.channel}: ${s.delivered} delivered, ${s.sent + s.queued} waiting, ${s.failed} failed`"
      >
        <span class="bg-success" :style="{ width: `${pct(s.delivered, s.recipients)}%` }" />
        <span class="bg-info" :style="{ width: `${pct(s.sent, s.recipients)}%` }" />
        <span class="bg-warning" :style="{ width: `${pct(s.queued, s.recipients)}%` }" />
        <span class="bg-destructive" :style="{ width: `${pct(s.failed, s.recipients)}%` }" />
      </div>
      <dl class="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
        <div class="flex gap-1">
          <dt>Delivered</dt>
          <dd class="text-foreground">{{ fmtCount(s.delivered) }}</dd>
        </div>
        <div v-if="readLabel(s.channel) && s.read" class="flex gap-1">
          <dt>{{ readLabel(s.channel) }}</dt>
          <dd class="text-foreground">{{ fmtCount(s.read) }}</dd>
        </div>
        <div v-if="s.sent" class="flex gap-1">
          <dt>Awaiting receipt</dt>
          <dd class="text-foreground">{{ fmtCount(s.sent) }}</dd>
        </div>
        <div v-if="s.queued" class="flex gap-1">
          <dt>Queued</dt>
          <dd class="text-foreground">{{ fmtCount(s.queued) }}</dd>
        </div>
        <div class="flex gap-1">
          <dt>Failed</dt>
          <dd :class="cn(s.failed ? 'font-medium text-error-strong' : 'text-foreground')">
            {{ fmtCount(s.failed) }}
          </dd>
        </div>
      </dl>
    </div>
  </div>
</template>
