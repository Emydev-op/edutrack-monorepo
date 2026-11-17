<script setup lang="ts">
import type { PublicSchool } from '@edutrack/shared';
import authPattern from '@edutrack/ui/assets/brand/auth-pattern.svg';
import { ArrowRightIcon, LockIcon } from '@lucide/vue';

import { PORTALS } from '@/lib/portals';

import PoweredBy from './PoweredBy.vue';
import SchoolBadge from './SchoolBadge.vue';

/** The school, or null while it loads (the page shows its outline instead). */
defineProps<{ school: PublicSchool | null }>();

// The pattern is inlined as a data URI containing quotes, so it must be quoted inside url().
const patternStyle = { backgroundImage: `url("${authPattern}")`, backgroundSize: '240px 240px' };
</script>

<template>
  <div class="flex min-h-svh flex-col bg-background lg:flex-row" :aria-busy="!school">
    <header
      class="relative overflow-hidden bg-primary text-primary-foreground lg:flex lg:w-[46%] lg:max-w-[560px] lg:shrink-0 lg:flex-col"
    >
      <div
        aria-hidden="true"
        class="absolute inset-0 opacity-15 brightness-0 invert"
        :style="patternStyle"
      />
      <div
        class="relative flex flex-1 flex-col gap-6 px-4 pt-10 pb-9 sm:px-10 sm:pt-14 sm:pb-12 lg:justify-center lg:gap-8 lg:px-12 lg:py-12"
      >
        <template v-if="school">
          <SchoolBadge :initials="school.initials" :logo-url="school.logoUrl" />
          <div class="flex max-w-[440px] flex-col gap-3">
            <p class="text-xs font-medium tracking-[0.08em] uppercase opacity-80">Welcome to</p>
            <h1
              class="text-[28px] leading-[1.12] font-semibold tracking-[-0.01em] text-balance break-words sm:text-4xl lg:text-[40px]"
            >
              {{ school.name }}
            </h1>
            <p
              v-if="school.motto"
              class="text-base leading-relaxed text-pretty opacity-85 sm:text-lg"
            >
              “{{ school.motto }}”
            </p>
          </div>
        </template>
        <template v-else>
          <span class="size-16 rounded-2xl bg-white/20 motion-safe:animate-pulse sm:size-20" />
          <div class="flex flex-col gap-3">
            <span class="h-3 w-20 rounded bg-white/20 motion-safe:animate-pulse" />
            <span
              class="h-9 w-4/5 max-w-[360px] rounded-md bg-white/25 motion-safe:animate-pulse"
            />
            <span class="h-5 w-3/5 max-w-[260px] rounded bg-white/20 motion-safe:animate-pulse" />
          </div>
        </template>
      </div>
      <div class="relative hidden px-12 pb-8 lg:block"><PoweredBy on-brand /></div>
    </header>

    <main class="flex min-w-0 flex-1 flex-col">
      <div
        class="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center gap-6 px-4 py-9 sm:px-8 sm:py-12"
      >
        <template v-if="!school">
          <p role="status" class="sr-only">Loading your school…</p>
          <div class="flex flex-col gap-2">
            <span class="h-7 w-48 rounded-md bg-muted motion-safe:animate-pulse" />
            <span class="h-4 w-64 max-w-full rounded bg-muted motion-safe:animate-pulse" />
          </div>
          <div class="flex flex-col gap-3">
            <span
              v-for="n in 3"
              :key="n"
              class="h-[76px] rounded-xl border bg-card motion-safe:animate-pulse"
            />
          </div>
        </template>

        <template v-else-if="school.available">
          <div class="flex flex-col gap-1.5">
            <h2 class="text-2xl font-semibold text-balance">Who’s signing in?</h2>
            <p class="text-[13px] text-pretty text-muted-foreground">
              Choose your portal and sign in with the account {{ school.name }} gave you.
            </p>
          </div>
          <nav aria-label="Portals">
            <ul class="flex flex-col gap-3">
              <li v-for="portal in PORTALS" :key="portal.id">
                <a
                  :href="portal.href"
                  :data-portal="portal.id"
                  class="group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgb(37_35_33/0.04)] hover:border-primary hover:bg-brand-tint motion-safe:transition-colors"
                >
                  <span
                    class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-primary group-hover:bg-primary group-hover:text-primary-foreground motion-safe:transition-colors"
                  >
                    <component :is="portal.icon" class="size-5" aria-hidden="true" />
                  </span>
                  <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="text-[15px] font-semibold">{{ portal.label }}</span>
                    <span class="text-[13px] text-pretty text-muted-foreground">
                      {{ portal.description }}
                    </span>
                  </span>
                  <ArrowRightIcon
                    class="size-4 shrink-0 text-faint group-hover:text-primary motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </a>
              </li>
            </ul>
          </nav>
          <p class="text-xs text-pretty text-faint">
            Accounts are created by the school. If you can’t sign in, contact the school office.
          </p>
        </template>

        <div v-else role="status" class="flex flex-col gap-4 rounded-xl border bg-card p-6">
          <span
            class="flex size-11 items-center justify-center rounded-lg bg-warning-subtle text-warning-strong"
          >
            <LockIcon class="size-5" aria-hidden="true" />
          </span>
          <div class="flex flex-col gap-1.5">
            <h2 class="text-xl font-semibold text-balance">Sign-in is unavailable</h2>
            <p class="text-[13px] leading-relaxed text-pretty text-muted-foreground">
              The {{ school.name }} portals are unavailable at the moment. Please contact the school
              for more information.
            </p>
          </div>
        </div>
      </div>
      <footer class="flex justify-center px-4 pb-6 lg:hidden"><PoweredBy /></footer>
    </main>
  </div>
</template>
