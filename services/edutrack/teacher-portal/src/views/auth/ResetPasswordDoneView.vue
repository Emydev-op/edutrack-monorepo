<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { RouterLink } from 'vue-router';

import ResultIcon from '@edutrack/app-kit/components/common/ResultIcon.vue';
import AuthLayout from '@/components/layout/AuthLayout.vue';
import { routesPath } from '@/router/routes-path';

import AuthHeading from './AuthHeading.vue';
</script>

<template>
  <AuthLayout>
    <ResultIcon tone="success" centered />
    <AuthHeading
      title="Your password has been updated"
      description="Other devices have been signed out. Use your new password to sign in."
      centered
    />
    <Button as-child size="lg"
      ><RouterLink :to="{ name: routesPath.auth.login.name }"
        >Continue to sign in</RouterLink
      ></Button
    >
  </AuthLayout>
</template>
