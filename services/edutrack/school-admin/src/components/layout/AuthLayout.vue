<script setup lang="ts">
import authPattern from '@edutrack/ui/assets/brand/auth-pattern.svg';
import logoWhite from '@edutrack/ui/assets/brand/logo-mark-white.svg';
import { BookCheckIcon, ListChecksIcon, ReceiptTextIcon } from '@lucide/vue';

import { env } from '@/config/env';

import AuthHero from './AuthHero.vue';

const initials = env.schoolName
  .split(/\s+/)
  .map((w) => w[0])
  .join('')
  .slice(0, 2)
  .toUpperCase();

const HIGHLIGHTS = [
  { label: 'Setup Center', icon: ListChecksIcon },
  { label: 'Results', icon: BookCheckIcon },
  { label: 'Fees', icon: ReceiptTextIcon },
];
// The pattern is inlined as a data URI containing quotes, so it must be quoted inside url().
const patternStyle = { backgroundImage: `url("${authPattern}")`, backgroundSize: '240px 240px' };
</script>

<template>
  <div class="flex h-svh overflow-hidden bg-background text-sm">
    <aside
      class="relative flex w-[46%] max-w-[560px] shrink-0 flex-col overflow-hidden bg-primary text-[#FFF8EE] max-lg:hidden"
    >
      <div
        aria-hidden="true"
        class="absolute inset-0 opacity-15 brightness-0 invert"
        :style="patternStyle"
      />
      <div class="relative flex min-h-0 flex-1 flex-col gap-5.5 overflow-y-auto px-11 pt-8 pb-6">
        <div class="flex items-center gap-3">
          <img :src="logoWhite" alt="" class="size-10" />
          <span class="flex flex-col">
            <span class="text-lg font-semibold text-white">Edutrack</span>
            <span class="text-xs tracking-[0.04em] text-brand-subtle uppercase">School Admin</span>
          </span>
        </div>
        <div class="flex max-w-[420px] flex-col gap-3">
          <h2
            class="text-[30px] leading-[1.15] font-semibold tracking-[-0.01em] text-balance text-white"
          >
            Run your whole school from one place.
          </h2>
          <p class="text-[15px] leading-relaxed text-pretty text-brand-subtle">
            Manage sessions, classes, students, staff, results, fees and communication for
            {{ env.schoolName }}.
          </p>
        </div>
        <div class="max-w-[460px]"><AuthHero /></div>
        <ul class="flex max-w-[460px] flex-wrap gap-x-4.5 gap-y-2">
          <li v-for="h in HIGHLIGHTS" :key="h.label" class="flex items-center gap-2">
            <span
              class="flex size-6.5 items-center justify-center rounded-[7px] bg-[#FFF8EE] text-primary"
            >
              <component :is="h.icon" class="size-4.5" aria-hidden="true" />
            </span>
            <span class="text-[13px] font-medium text-white">{{ h.label }}</span>
          </li>
        </ul>
        <p class="mt-auto max-w-[300px] text-xs text-pretty text-brand-subtle">
          School Admin accounts are created by the platform team or by another school administrator.
          There is no public sign-up.
        </p>
      </div>
    </aside>
    <main class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      <div
        class="m-auto flex w-full max-w-[400px] flex-col gap-4.5 px-5 pt-7 pb-8 max-lg:max-w-[420px]"
      >
        <div class="flex items-center gap-2.5 lg:hidden">
          <span
            class="flex size-9 items-center justify-center rounded-lg bg-primary font-semibold text-brand-subtle"
            >{{ initials }}</span
          >
          <span class="flex flex-col">
            <span class="font-semibold">{{ env.schoolName }}</span>
            <span class="text-xs text-faint">School Admin</span>
          </span>
        </div>
        <slot />
      </div>
    </main>
  </div>
</template>
