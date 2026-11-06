<script setup lang="ts">
import authPattern from '@edutrack/ui/assets/brand/auth-pattern.svg';
import logoCream from '@edutrack/ui/assets/brand/logo-mark-cream.svg';

// The pattern is inlined as a data URI containing quotes, so it must be quoted inside url().
const panelStyle = {
  backgroundImage: `radial-gradient(ellipse at 30% 45%, rgb(37 35 33 / 0.92) 0%, rgb(37 35 33 / 0.55) 45%, rgb(37 35 33 / 0) 75%), url("${authPattern}")`,
  backgroundSize: 'auto, 240px 240px',
  backgroundRepeat: 'no-repeat, repeat',
};
</script>

<template>
  <div class="grid min-h-svh bg-background text-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
    <aside
      class="flex flex-col justify-between gap-8 bg-foreground p-12 text-brand-subtle max-lg:hidden"
      :style="panelStyle"
    >
      <div class="flex items-center gap-3">
        <img :src="logoCream" alt="" class="size-9 object-contain" />
        <div class="flex flex-col">
          <span class="font-semibold text-white">EduTrack</span>
          <span class="text-xs text-[#C9BBA6]">Platform administration</span>
        </div>
      </div>
      <div class="flex max-w-[420px] flex-col gap-3">
        <span class="text-xs font-semibold tracking-[0.08em] text-highlight"
          >INTERNAL · RESTRICTED ACCESS</span
        >
        <p class="text-[26px] leading-snug font-semibold text-white">
          The back office for every school on EduTrack.
        </p>
        <p class="text-sm text-[#C9BBA6]">
          Only EduTrack staff can sign in here. School administrators, teachers, parents and
          students sign in from their school's own address.
        </p>
      </div>
      <div class="flex flex-col gap-1.5 text-xs text-[#A99B87]">
        <span>Every sign-in is logged with IP address and device.</span>
        <span>Sessions end after 30 minutes without activity.</span>
      </div>
    </aside>
    <main class="flex flex-col items-center justify-center px-6 py-10">
      <div class="flex w-[400px] max-w-full flex-col gap-4.5">
        <slot />
      </div>
    </main>
  </div>
</template>
