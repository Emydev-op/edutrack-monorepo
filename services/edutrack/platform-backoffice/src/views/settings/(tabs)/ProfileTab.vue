<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import {
  useMyProfileQuery,
  useUpdateAvatarMutation,
  useUpdateProfileMutation,
} from '@/api/services/settings';
import InitialsAvatar from '@edutrack/app-kit/components/common/InitialsAvatar.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';
import { profileSchema } from '@/schema/settings';
import { useAuthStore } from '@/stores/auth';

const MAX_AVATAR = 2 * 1024 * 1024;

const { data: profile, isPending } = useMyProfileQuery();
const updateProfile = useUpdateProfileMutation();
const updateAvatar = useUpdateAvatarMutation();
const auth = useAuthStore();
const confirm = useConfirm();

const { handleSubmit, meta, resetForm, values } = useForm({
  validationSchema: profileSchema,
  initialValues: { firstName: '', lastName: '', phone: '' },
});
watch(
  profile,
  (p) =>
    p && resetForm({ values: { firstName: p.firstName, lastName: p.lastName, phone: p.phone } }),
  { immediate: true },
);
useUnsavedChanges(() => meta.value.dirty);

const avatarInitials = computed(() =>
  `${values.firstName?.[0] ?? ''}${values.lastName?.[0] ?? ''}`.toUpperCase(),
);
const avatarError = ref('');

const save = handleSubmit(async (v) => {
  const saved = await updateProfile.mutateAsync({
    firstName: v.firstName,
    lastName: v.lastName,
    phone: v.phone ?? '',
  });
  auth.updateUser({ firstName: saved.firstName, lastName: saved.lastName });
  resetForm({
    values: { firstName: saved.firstName, lastName: saved.lastName, phone: saved.phone },
  });
  toast.success('Profile saved.');
});

function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  avatarError.value = '';
  if (!file) return;
  if (!/^image\/(png|jpe?g)$/.test(file.type))
    return void (avatarError.value = 'Use a JPG or PNG image.');
  if (file.size > MAX_AVATAR)
    return void (avatarError.value = `“${file.name}” is larger than 2 MB.`);
  const reader = new FileReader();
  reader.onload = async () => {
    await updateAvatar.mutateAsync(String(reader.result));
    toast.success('Profile photo updated.');
  };
  reader.readAsDataURL(file);
}

function removePhoto() {
  void confirm({
    title: 'Remove your profile photo?',
    details: [['Shown instead', 'Your initials']],
    confirmLabel: 'Remove photo',
    action: async () => {
      await updateAvatar.mutateAsync(null);
      toast.success('Profile photo removed.');
    },
  });
}
</script>

<template>
  <Skeleton v-if="isPending" class="h-72 max-w-[820px]" />
  <template v-else-if="profile">
    <form
      class="flex max-w-[820px] flex-col gap-3.5 rounded-lg border bg-card p-5"
      novalidate
      @submit="save"
    >
      <h2 class="text-[15px] font-semibold">Profile</h2>
      <div class="flex flex-wrap items-center gap-3.5">
        <img
          v-if="profile.avatarUrl"
          :src="profile.avatarUrl"
          alt="Profile photo"
          class="size-16 rounded-full object-cover ring-1 ring-border"
        />
        <InitialsAvatar v-else :initials="avatarInitials" size="lg" class="size-16 text-[22px]" />
        <div class="flex flex-col gap-1.5">
          <div class="flex gap-2">
            <Button as-child variant="outline" size="sm" :disabled="updateAvatar.isPending.value">
              <label class="cursor-pointer">
                <Spinner v-if="updateAvatar.isPending.value" />Upload photo
                <input type="file" accept="image/png,image/jpeg" class="sr-only" @change="upload" />
              </label>
            </Button>
            <Button
              v-if="profile.avatarUrl"
              variant="ghost"
              size="sm"
              class="text-destructive hover:bg-error-subtle hover:text-destructive"
              @click="removePhoto"
              >Remove</Button
            >
          </div>
          <span :class="avatarError ? 'text-xs text-destructive' : 'text-xs text-faint'">{{
            avatarError || 'JPG or PNG, square, up to 2 MB'
          }}</span>
        </div>
      </div>
      <div class="grid gap-3.5 sm:grid-cols-2">
        <FormInput
          name="firstName"
          label="First name"
          required
          autocomplete="given-name"
          placeholder="Emeka"
        />
        <FormInput
          name="lastName"
          label="Last name"
          required
          autocomplete="family-name"
          placeholder="Osegbo"
        />
        <FormInput
          name="phone"
          label="Phone number"
          type="tel"
          autocomplete="tel"
          hint="Used for security alerts and sign-in recovery."
          placeholder="0803 412 7781"
        />
      </div>
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs text-warning-strong">{{
          meta.dirty ? 'Unsaved changes. Leaving this page will ask before discarding them.' : ''
        }}</span>
        <div class="flex gap-2">
          <Button type="button" variant="outline" :disabled="!meta.dirty" @click="resetForm()"
            >Discard</Button
          >
          <Button type="submit" :disabled="!meta.dirty || updateProfile.isPending.value">
            <Spinner v-if="updateProfile.isPending.value" />{{
              updateProfile.isPending.value ? 'Saving…' : 'Save changes'
            }}
          </Button>
        </div>
      </div>
    </form>
    <KeyValueCard
      title="Managed by your administrator"
      class="max-w-[820px]"
      :rows="[
        { label: 'Email', value: profile.email },
        { label: 'Role', value: profile.roleName },
        { label: 'Status', value: profile.status },
        { label: 'Member since', value: profile.memberSince },
        { label: 'Last sign-in', value: profile.lastSignIn },
        { label: 'To change these', value: 'Ask another Platform Administrator' },
      ]"
    />
  </template>
</template>
