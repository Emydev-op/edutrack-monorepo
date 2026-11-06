<script setup lang="ts">
import { TONE_CLASSES, type StatusTone } from '@edutrack/ui/lib/status';
import { cn } from '@edutrack/ui/lib/utils';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';

const auth = useAuthStore();
const context = useContextStore();

interface Banner {
  tone: StatusTone;
  title: string;
  text: string;
  /** Either a link or "back to the active session". */
  link?: { label: string; to: { name: string } };
  back?: boolean;
}

/** One school-wide banner at a time: a restricted subscription outranks the session state. */
const banner = computed<Banner | null>(() => {
  if (auth.school?.subscriptionStatus === 'Restricted')
    return {
      tone: 'error',
      title: 'Subscription restricted',
      text: 'Renewal is 14 days overdue. Your data is safe and you can still sign in, view records, export and pay. Admitting students, issuing invoices and publishing results are paused until renewal.',
      link: { label: 'Renew subscription', to: { name: routesPath.settings.name } },
    };
  const { session } = context.current;
  switch (context.sessionStatus) {
    case 'Closing':
      return {
        tone: 'warning',
        title: `${session} is closing.`,
        text: 'Only promotion decisions and authorised corrections are allowed in this session.',
        back: true,
      };
    case 'Closed':
      return {
        tone: 'neutral',
        title: `${session} is closed.`,
        text: 'Records are read-only. Corrections need an approved correction request.',
        back: true,
      };
    case 'Upcoming':
      return {
        tone: 'info',
        title: `${session} is upcoming.`,
        text: 'You can configure classes, subjects and fees. Enrollments open when the session starts.',
        back: true,
      };
  }
  return null;
});
</script>

<template>
  <div
    v-if="banner"
    role="status"
    :class="
      cn('flex items-center gap-3 px-6 py-2.5 text-[13px]', TONE_CLASSES[banner.tone].surface)
    "
  >
    <span class="flex-1 text-pretty"
      ><b :class="cn('font-semibold', TONE_CLASSES[banner.tone].text)">{{ banner.title }}</b>
      {{ banner.text }}</span
    >
    <button
      v-if="banner.back"
      type="button"
      class="shrink-0 font-medium text-primary hover:underline"
      @click="context.set({ session: context.activeSession })"
    >
      Return to {{ context.activeSession }}
    </button>
    <RouterLink
      v-else-if="banner.link"
      :to="banner.link.to"
      class="shrink-0 font-medium text-primary hover:underline"
      >{{ banner.link.label }}</RouterLink
    >
  </div>
  <div
    v-else-if="context.changed"
    role="status"
    class="flex items-center gap-2.5 bg-brand-subtle px-6 py-2 text-[13px] text-brand-strong"
  >
    <span class="size-1.5 rounded-full bg-primary" aria-hidden="true" />
    Context changed. You're now working in
    <b class="font-semibold"
      >{{ context.current.branch }} · {{ context.current.session }} · {{ context.current.term }}</b
    >.
  </div>
</template>
