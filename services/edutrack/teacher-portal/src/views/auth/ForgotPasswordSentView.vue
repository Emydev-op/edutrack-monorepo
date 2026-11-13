<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { useIntervalFn } from '@vueuse/core';
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import { useForgotPasswordMutation } from '@/api/services/auth';
import ResultIcon from '@edutrack/app-kit/components/common/ResultIcon.vue';
import AuthLayout from '@/components/layout/AuthLayout.vue';
import { env } from '@/config/env';
import { routesPath } from '@/router/routes-path';

import AuthHeading from './AuthHeading.vue';

const RESEND_COOLDOWN = 30;

const route = useRoute();
const email = computed(() => (route.query.email as string | undefined) ?? 'your email address');
const resend = useForgotPasswordMutation();

const cooldown = ref(RESEND_COOLDOWN);
const timer = useIntervalFn(() => {
  cooldown.value -= 1;
  if (cooldown.value <= 0) timer.pause();
}, 1000);

async function onResend() {
  if (cooldown.value > 0) return;
  await resend.mutateAsync(email.value);
  toast.success('Reset email sent again.');
  cooldown.value = RESEND_COOLDOWN;
  timer.resume();
}
</script>

<template>
  <AuthLayout>
    <ResultIcon tone="brand" />
    <AuthHeading
      title="Check your email"
      :description="`If an account exists for ${email}, we've sent instructions to reset your password. The link works for 60 minutes.`"
    />
    <div class="flex gap-2">
      <Button as-child size="lg"
        ><RouterLink :to="{ name: routesPath.auth.login.name }">Back to sign in</RouterLink></Button
      >
      <Button
        variant="outline"
        size="lg"
        :disabled="cooldown > 0 || resend.isPending.value"
        @click="onResend"
      >
        {{ cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email' }}
      </Button>
    </div>
    <RouterLink
      v-if="env.useMocks"
      :to="{
        name: routesPath.auth.reset.name,
        query: { token: `demo:${route.query.email ?? ''}` },
      }"
      class="text-[13px] text-primary hover:underline"
    >
      Mock API: open the reset link →
    </RouterLink>
  </AuthLayout>
</template>
