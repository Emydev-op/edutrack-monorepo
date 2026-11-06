<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@edutrack/ui/components/card';
import { Input } from '@edutrack/ui/components/input';
import { Label } from '@edutrack/ui/components/label';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { useMutation } from '@tanstack/vue-query';
import { toTypedSchema } from '@vee-validate/yup';
import { useForm } from 'vee-validate';
import { useRoute, useRouter } from 'vue-router';
import * as yup from 'yup';

import { http } from '@/lib/http';
import { useSessionStore } from '@/stores/session';

const schema = toTypedSchema(
  yup.object({
    email: yup.string().trim().required('Email is required').email('Enter a valid email'),
    password: yup
      .string()
      .required('Password is required')
      .min(8, 'Password must be at least 8 characters'),
  }),
);

const { defineField, errors, handleSubmit } = useForm({ validationSchema: schema });
const [email, emailAttrs] = defineField('email');
const [password, passwordAttrs] = defineField('password');

const session = useSessionStore();
const route = useRoute();
const router = useRouter();

// The auth endpoint arrives with the backend auth module; until then this shows the error path.
const login = useMutation({
  mutationFn: async (credentials: { email: string; password: string }) =>
    (await http.post<{ accessToken: string }>('/v1/auth/login', credentials)).data,
  onSuccess: async ({ accessToken }) => {
    session.setAccessToken(accessToken);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    await router.push(redirect);
  },
});

const onSubmit = handleSubmit((values) => login.mutate(values));
</script>

<template>
  <main class="flex min-h-svh items-center justify-center bg-muted p-6">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle class="text-2xl">Sign in</CardTitle>
        <CardDescription>EduTrack · Student Portal</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="grid gap-4" novalidate @submit="onSubmit">
          <div class="grid gap-2">
            <Label for="email">Email</Label>
            <Input
              id="email"
              v-model="email"
              v-bind="emailAttrs"
              type="email"
              autocomplete="email"
              :aria-invalid="!!errors.email"
            />
            <p v-if="errors.email" class="text-sm text-destructive">{{ errors.email }}</p>
          </div>
          <div class="grid gap-2">
            <Label for="password">Password</Label>
            <Input
              id="password"
              v-model="password"
              v-bind="passwordAttrs"
              type="password"
              autocomplete="current-password"
              :aria-invalid="!!errors.password"
            />
            <p v-if="errors.password" class="text-sm text-destructive">{{ errors.password }}</p>
          </div>
          <p v-if="login.isError.value" class="text-sm text-destructive" role="alert">
            {{ getApiErrorMessage(login.error.value) }}
          </p>
          <Button type="submit" :disabled="login.isPending.value">
            {{ login.isPending.value ? 'Signing in…' : 'Sign in' }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </main>
</template>
