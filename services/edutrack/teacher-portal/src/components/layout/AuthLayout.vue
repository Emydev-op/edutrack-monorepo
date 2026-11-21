<script setup lang="ts">
import { useLogoFallback } from '@edutrack/app-kit/composables/useLogoFallback';
import authPattern from '@edutrack/ui/assets/brand/auth-pattern.svg';
import logoWhite from '@edutrack/ui/assets/brand/logo-mark-white.svg';
import { BookCheckIcon, ClipboardCheckIcon, NotebookPenIcon } from '@lucide/vue';

import { useSchoolBrand } from '@/lib/school-brand';

import AuthHero from './AuthHero.vue';

const school = useSchoolBrand();
// Initials stand in if the logo can't load; a new logo gets another try.
const { failed: logoFailed, onError: onLogoError } = useLogoFallback(() => school.logoUrl);

const HIGHLIGHTS = [
  { label: 'Score sheets', icon: BookCheckIcon },
  { label: 'Register', icon: ClipboardCheckIcon },
  { label: 'Lesson notes', icon: NotebookPenIcon },
];
// The pattern is inlined as a data URI containing quotes, so it must be quoted inside url().
const patternStyle = { backgroundImage: `url("${authPattern}")`, backgroundSize: '240px 240px' };
</script>

<template>
  <div class="flex h-svh overflow-hidden bg-background text-sm">
    <aside
      class="relative flex w-[46%] max-w-140 shrink-0 flex-col overflow-hidden bg-primary text-[#FFF8EE] max-lg:hidden"
    >
      <div
        aria-hidden="true"
        class="absolute inset-0 opacity-15 brightness-0 invert"
        :style="patternStyle"
      />
      <div class="relative flex min-h-0 flex-1 flex-col gap-5.5 overflow-y-auto px-11 pt-8 pb-6">
        <!-- The school's own sign-in: its logo (or initials) and name; EduTrack sits at the bottom. -->
        <div class="flex items-center gap-3">
          <span
            v-if="school.logoUrl && !logoFailed"
            class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF8EE] p-1"
          >
            <img
              :src="school.logoUrl"
              alt=""
              class="size-full object-contain"
              @error="onLogoError"
            />
          </span>
          <span
            v-else
            class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF8EE] text-[15px] font-semibold text-primary"
            aria-hidden="true"
            >{{ school.initials }}</span
          >
          <span class="flex min-w-0 flex-col">
            <span class="truncate text-lg font-semibold text-white">{{ school.name }}</span>
          </span>
        </div>
        <div class="flex max-w-105 flex-col gap-3">
          <h2
            class="text-[30px] leading-[1.15] font-semibold tracking-[-0.01em] text-balance text-white"
          >
            Your classes, scores and register in one place.
          </h2>
          <p class="text-[15px] leading-relaxed text-pretty text-brand-subtle">
            Plan lessons, set work, enter scores and take the register for your classes at
            {{ school.name }}.
          </p>
        </div>
        <div class="max-w-115">
          <AuthHero />
        </div>
        <ul class="flex max-w-115 flex-wrap gap-x-4.5 gap-y-2">
          <li v-for="h in HIGHLIGHTS" :key="h.label" class="flex items-center gap-2">
            <span
              class="flex size-6.5 items-center justify-center rounded-[7px] bg-[#FFF8EE] text-primary"
            >
              <component :is="h.icon" class="size-4.5" aria-hidden="true" />
            </span>
            <span class="text-[13px] font-medium text-white">{{ h.label }}</span>
          </li>
        </ul>
        <div class="mt-auto flex flex-col gap-4">
          <p class="max-w-75 text-xs text-pretty text-brand-subtle">
            Teacher accounts are created by your school’s administrator. There is no public sign-up.
          </p>
          <p class="flex items-center gap-2 text-xs text-brand-subtle">
            <img :src="logoWhite" alt="" class="size-4.5 opacity-90" />
            Powered by <span class="font-semibold text-white">EduTrack</span>
          </p>
        </div>
      </div>
    </aside>
    <main class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      <div class="m-auto flex w-full max-w-100 flex-col gap-4.5 px-5 pt-7 pb-8 max-lg:max-w-105">
        <div class="flex items-center gap-2.5 lg:hidden">
          <img
            v-if="school.logoUrl"
            :src="school.logoUrl"
            alt=""
            class="size-9 rounded-lg border object-contain p-0.5"
          />
          <span
            v-else
            class="flex size-9 items-center justify-center rounded-lg bg-primary font-semibold text-brand-subtle"
            >{{ school.initials }}</span
          >
          <span class="flex flex-col">
            <span class="font-semibold">{{ school.name }}</span>
            <span class="text-xs text-faint">Teacher Workspace</span>
          </span>
        </div>
        <slot />
      </div>
    </main>
  </div>
</template>
