<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { ChevronRightIcon } from '@lucide/vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useReviewSheetsQuery } from '@/api/services/reviews';
import AccessDenied from '@/components/common/AccessDenied.vue';
import SheetStatusBadge from '@/components/results/SheetStatusBadge.vue';
import { getApiErrorMessage, isForbidden } from '@/lib/api-errors';
import { formatDateTime } from '@/lib/dates';
import { routesPath } from '@/router/routes-path';

const { data, isPending, error } = useReviewSheetsQuery();
</script>

<template>
  <PageHeader
    title="Result sheets to review"
    :description="
      data
        ? `${data.department} sheets your teachers submitted. Forward each to the academic office, or return it with a comment.`
        : 'Sheets from your department waiting for you.'
    "
  />
  <AccessDenied
    v-if="isForbidden(error)"
    what="result sheet reviews"
    :reason="getApiErrorMessage(error)"
  />
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="The review queue couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <div v-else-if="isPending" class="flex flex-col gap-2">
    <Skeleton v-for="i in 3" :key="i" class="h-16 w-full" />
  </div>
  <template v-else-if="data">
    <SectionCard
      :title="`Waiting on you · ${data.waiting.length}`"
      description="Oldest first. Your own sheets skip you and go straight to the academic office."
      flush
    >
      <EmptyState
        v-if="!data.waiting.length"
        title="Nothing waiting"
        description="When a teacher in your department submits a sheet, it appears here and you’re notified."
      />
      <ul v-else class="flex flex-col divide-y divide-divider">
        <li v-for="s in data.waiting" :key="s.id">
          <RouterLink
            :to="{ name: routesPath.reviews.sheet.name, params: { sheetId: s.id } }"
            class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-warm"
          >
            <span class="flex min-w-0 flex-col gap-0.5">
              <span class="font-semibold">{{ s.arm }} · {{ s.subjectName }}</span>
              <span class="text-xs text-muted-foreground"
                >{{ s.teacher }} · {{ s.students }} students · average
                {{ s.average ?? '—' }}%<template v-if="s.absent"> · {{ s.absent }} absent</template
                ><template v-if="s.exempt"> · {{ s.exempt }} exempt</template></span
              >
              <span class="text-xs text-faint"
                >Submitted {{ formatDateTime(s.submittedAt, false) }} · {{ s.branchName }}</span
              >
            </span>
            <span class="flex shrink-0 items-center gap-1 text-[13px] font-medium text-primary"
              >Review <ChevronRightIcon class="size-4"
            /></span>
          </RouterLink>
        </li>
      </ul>
    </SectionCard>
    <SectionCard v-if="data.recent.length" title="You reviewed" flush>
      <ul class="flex flex-col divide-y divide-divider">
        <li v-for="s in data.recent" :key="s.id">
          <RouterLink
            :to="{ name: routesPath.reviews.sheet.name, params: { sheetId: s.id } }"
            class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-[13px] hover:bg-surface-warm"
          >
            <span class="flex min-w-0 flex-col">
              <span class="font-medium">{{ s.arm }} · {{ s.subjectName }}</span>
              <span class="text-xs text-muted-foreground">{{ s.teacher }} · {{ s.decision }}</span>
            </span>
            <SheetStatusBadge :status="s.status" />
          </RouterLink>
        </li>
      </ul>
    </SectionCard>
  </template>
</template>
