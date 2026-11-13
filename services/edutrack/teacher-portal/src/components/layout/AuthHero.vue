<script setup lang="ts">
import {
  BookCheckIcon,
  CheckIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  NotebookPenIcon,
} from '@lucide/vue';

/**
 * The sign-in panel's illustration (teacher variant): a "Today's teaching" card with progress bars and a
 * rotating activity line, plus two floating chips. Decorative only (hidden from screen readers),
 * and still when the user prefers reduced motion.
 */
const BARS = [
  { label: 'Score sheets complete', value: '3 of 4', width: '75%', color: 'var(--primary)' },
  { label: 'Submissions graded', value: '18 of 27', width: '67%', color: 'var(--info)' },
  { label: 'Register taken', value: 'This week', width: '100%', color: 'var(--success)' },
];
const TICKER = [
  {
    title: 'Sheet approved by HOD',
    detail: 'SSS 1A · Mathematics',
    time: '2m',
    icon: BookCheckIcon,
    tone: 'bg-success-subtle text-success',
  },
  {
    title: 'New submission',
    detail: 'Favour Okeke · Linear equations',
    time: '9m',
    icon: FileTextIcon,
    tone: 'bg-info-subtle text-info',
  },
  {
    title: 'Register saved',
    detail: 'JSS 2B · 13 present, 1 late',
    time: '14m',
    icon: ClipboardCheckIcon,
    tone: 'bg-brand-tint text-primary',
  },
  {
    title: 'Lesson note approved',
    detail: 'JSS 2 · Week 13',
    time: '1h',
    icon: NotebookPenIcon,
    tone: 'bg-warning-subtle text-warning',
  },
];
</script>

<template>
  <div class="hero relative" aria-hidden="true">
    <div
      class="absolute inset-[48px_16px_24px_40px] z-0 rotate-3 rounded-2xl border border-white/20 bg-white/15"
    />

    <div
      class="anim-in anim-bob relative z-10 mt-6 mr-8.5 mb-9 ml-4 flex flex-col gap-3 rounded-2xl bg-white p-4 text-foreground shadow-[0_28px_60px_rgba(37,35,33,0.30)]"
    >
      <div class="flex items-center justify-between">
        <span class="flex flex-col">
          <span class="text-sm font-semibold">Today’s teaching</span>
          <span class="text-[11px] text-faint">First Term · Week 13</span>
        </span>
        <span
          class="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-2.5 py-0.5 text-[11px] font-medium text-success-strong"
        >
          <span class="anim-pulse size-1.75 rounded-full bg-success" />Live
        </span>
      </div>
      <div class="flex flex-col gap-2.75">
        <div v-for="(b, i) in BARS" :key="b.label" class="flex flex-col gap-1.5">
          <div class="flex justify-between text-xs">
            <span class="font-medium">{{ b.label }}</span
            ><span class="text-muted-foreground">{{ b.value }}</span>
          </div>
          <div class="h-1.75 overflow-hidden rounded-full bg-divider">
            <div
              class="anim-fill h-full rounded-full"
              :style="{ width: b.width, background: b.color, animationDelay: `${0.5 + i * 0.22}s` }"
            />
          </div>
        </div>
      </div>
      <div class="h-px bg-divider" />
      <div
        class="flex items-center justify-between text-[11px] font-medium tracking-[0.04em] text-faint uppercase"
      >
        <span>Recent activity</span>
        <span class="relative h-0.75 w-10 overflow-hidden rounded-full bg-divider">
          <span class="anim-prog absolute inset-0 rounded-full bg-primary" />
        </span>
      </div>
      <div class="relative h-9">
        <div
          v-for="(t, i) in TICKER"
          :key="t.title"
          class="anim-tick absolute inset-0 flex items-center gap-2.5"
          :class="i > 0 && 'motion-reduce:hidden'"
          :style="{ animationDelay: `${i * 3}s` }"
        >
          <span class="flex size-8 shrink-0 items-center justify-center rounded-lg" :class="t.tone"
            ><component :is="t.icon" class="size-4"
          /></span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-xs font-semibold">{{ t.title }}</span>
            <span class="truncate text-[11px] text-muted-foreground">{{ t.detail }}</span>
          </span>
          <span class="text-[11px] text-faint">{{ t.time }}</span>
        </div>
      </div>
    </div>

    <div
      class="anim-in anim-bob absolute top-0 right-0 z-20 flex items-center gap-2.25 rounded-xl bg-white py-2.25 pr-3.25 pl-2.25 text-foreground shadow-[0_14px_30px_rgba(37,35,33,0.22)]"
      style="animation-delay: 0.5s, 1.4s; animation-duration: 0.7s, 5s"
    >
      <span class="flex size-7 items-center justify-center rounded-full bg-success text-white"
        ><CheckIcon class="size-3.75"
      /></span>
      <span class="flex flex-col">
        <span class="text-xs font-semibold">Scores submitted</span>
        <span class="text-[11px] text-muted-foreground">Sent to Mr. Bello for review</span>
      </span>
    </div>

    <div
      class="anim-in anim-bob2 absolute bottom-0 left-0 z-20 flex w-46 flex-col gap-1 rounded-xl bg-white px-3.5 py-3 text-foreground shadow-[0_14px_30px_rgba(37,35,33,0.22)]"
      style="animation-delay: 0.75s, 1.6s"
    >
      <span class="text-[11px] text-muted-foreground">Class average · JSS 2B</span>
      <span class="flex items-baseline justify-between">
        <span class="text-lg font-semibold tabular-nums">64.2%</span>
        <span class="text-[11px] font-semibold text-success-strong">▲ 2.1 pts</span>
      </span>
      <svg width="100%" height="30" viewBox="0 0 156 30" preserveAspectRatio="none">
        <path
          class="anim-draw"
          d="M2 26 L22 22 L40 24 L60 16 L80 18 L100 10 L120 12 L140 5 L154 3"
          fill="none"
          stroke="var(--highlight)"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-dasharray="180"
        />
        <circle cx="154" cy="3" r="3" fill="var(--highlight)" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
@keyframes fill {
  from {
    width: 0;
  }
}
@keyframes bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}
@keyframes bob2 {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(7px);
  }
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes tick {
  0% {
    opacity: 0;
    transform: translateY(10px);
  }
  3%,
  22% {
    opacity: 1;
    transform: translateY(0);
  }
  25%,
  100% {
    opacity: 0;
    transform: translateY(-10px);
  }
}
@keyframes draw {
  from {
    stroke-dashoffset: 180;
  }
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgb(46 125 91 / 0.55);
  }
  70% {
    box-shadow: 0 0 0 7px rgb(46 125 91 / 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgb(46 125 91 / 0);
  }
}
@keyframes prog {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}

.anim-fill {
  animation: fill 1.6s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.anim-in.anim-bob {
  animation:
    rise 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) both,
    bob 8s ease-in-out 1s infinite;
}
.anim-in.anim-bob2 {
  animation:
    rise 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both,
    bob2 6s ease-in-out infinite;
}
.anim-tick {
  opacity: 0;
  animation: tick 12s ease-in-out infinite backwards;
}
.anim-draw {
  animation: draw 2s ease-out 1.1s both;
}
.anim-pulse {
  animation: pulse 2s ease-out infinite;
}
.anim-prog {
  animation: prog 3s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .hero * {
    animation: none !important;
  }
  .anim-tick {
    opacity: 1;
  }
}
</style>
