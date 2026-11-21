<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { useForm } from 'vee-validate';
import { ref } from 'vue';
import { toast } from 'vue-sonner';

import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import PasswordChecklist from '@edutrack/app-kit/components/form/PasswordChecklist.vue';
import { messageOf } from '@edutrack/web-core/http';

import { useChangePasswordMutation } from '@/api/services/auth';
import { useProfileQuery } from '@/api/services/student';
import ListRow from '@/components/common/ListRow.vue';
import ListSection from '@/components/common/ListSection.vue';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import { fieldErrorsOf, getApiErrorMessage } from '@/lib/api-errors';
import { changePasswordSchema } from '@/schema/auth';
import { useUiStore } from '@/stores/ui';

/**
 * Profile: the student's details as the school holds them (read-only: the school office changes
 * them), changing the password, and signing out.
 */
const ui = useUiStore();
const profile = useProfileQuery();
const change = useChangePasswordMutation();
const changing = ref(false);

const { handleSubmit, resetForm, setErrors, values } = useForm({
  validationSchema: changePasswordSchema,
  initialValues: { current: '', password: '', confirmPassword: '' },
});
const onChange = handleSubmit(async (form) => {
  try {
    const res = await change.mutateAsync({ current: form.current, next: form.password });
    toast.success(messageOf(res, 'Password changed.'));
    resetForm();
    changing.value = false;
  } catch (err) {
    const fields = fieldErrorsOf(err);
    if (Object.keys(fields).length)
      setErrors({ current: fields.current, password: fields.next ?? fields.password });
    else toast.error(getApiErrorMessage(err, 'Your password wasn’t changed. Try again.'));
  }
});
</script>

<template>
  <PageTitle
    title="Profile"
    :sub="
      profile.data.value ? `${profile.data.value.name} · ${profile.data.value.admissionNo}` : null
    "
  />
  <QueryState
    v-if="!profile.data.value"
    :loading="profile.isPending.value"
    :error="profile.error.value"
    @retry="profile.refetch()"
  />
  <template v-else>
    <ListSection title="Enrolment">
      <ListRow title="Session" :right="profile.data.value.session" />
      <ListRow title="Class" :right="profile.data.value.className || 'Not placed yet'" />
      <ListRow
        v-if="profile.data.value.section"
        title="Section"
        :right="profile.data.value.section"
      />
      <ListRow v-if="profile.data.value.branch" title="Branch" :right="profile.data.value.branch" />
      <ListRow
        v-if="profile.data.value.classTeacher"
        title="Class teacher"
        :right="profile.data.value.classTeacher"
      />
      <ListRow title="Admission number" :right="profile.data.value.admissionNo" />
      <ListRow title="Admitted" :right="profile.data.value.admittedOn" />
    </ListSection>

    <ListSection title="About me">
      <ListRow title="Gender" :right="profile.data.value.gender" />
      <ListRow
        v-if="profile.data.value.dateOfBirth"
        title="Date of birth"
        :right="profile.data.value.dateOfBirth"
      />
      <ListRow
        v-for="g in profile.data.value.guardians"
        :key="g.name"
        :title="g.relationship || 'Guardian'"
        :right="g.name"
      />
    </ListSection>
    <p class="-mt-1.5 text-xs text-muted-foreground">
      Something wrong? Ask the school office to correct your record.
    </p>

    <ListSection title="Account">
      <ListRow title="Sign in with" :right="profile.data.value.admissionNo" />
      <div v-if="!changing" class="px-3.5 py-2.5">
        <Button variant="outline" size="sm" @click="changing = true">Change password</Button>
      </div>
      <form v-else class="flex flex-col gap-3.5 p-3.5" novalidate @submit="onChange">
        <FormInput
          name="current"
          label="Current password"
          type="password"
          autocomplete="current-password"
          placeholder="Your password now"
        />
        <FormInput
          name="password"
          label="New password"
          type="password"
          autocomplete="new-password"
          placeholder="At least 8 characters"
        >
          <template #after><PasswordChecklist :password="values.password ?? ''" /></template>
        </FormInput>
        <FormInput
          name="confirmPassword"
          label="Confirm new password"
          type="password"
          autocomplete="new-password"
          placeholder="Re-enter the new password"
        />
        <p class="text-xs text-muted-foreground">
          Your other devices are signed out when the password changes.
        </p>
        <div class="flex gap-2">
          <Button
            type="button"
            variant="outline"
            class="flex-1"
            @click="(resetForm(), (changing = false))"
            >Cancel</Button
          >
          <Button type="submit" class="flex-[2]" :disabled="change.isPending.value">
            <Spinner v-if="change.isPending.value" /> Change password
          </Button>
        </div>
      </form>
      <button
        type="button"
        class="flex min-h-13 w-full items-center px-3.5 text-left text-sm font-medium text-destructive hover:bg-error-subtle"
        @click="ui.signOutOpen = true"
      >
        Sign out
      </button>
    </ListSection>
  </template>
</template>
