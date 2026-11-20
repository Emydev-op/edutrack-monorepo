<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Switch } from '@edutrack/ui/components/switch';
import { LockIcon } from '@lucide/vue';
import { useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormTextarea from '@edutrack/app-kit/components/form/FormTextarea.vue';
import { messageOf } from '@edutrack/web-core/http';

import {
  usePreferencesQuery,
  useProfileQuery,
  useSavePreferencesMutation,
  useUpdateProfileMutation,
} from '@/api/services/parent';
import ListRow from '@/components/common/ListRow.vue';
import ListSection from '@/components/common/ListSection.vue';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import { fieldErrorsOf, getApiErrorMessage } from '@/lib/api-errors';
import { formatDateTime } from '@/lib/dates';
import { profileSchema } from '@/schema/auth';
import { useUiStore } from '@/stores/ui';
import type { NotificationPreference } from '@/types';

/**
 * Profile: contact details (the parent changes their phone and address; the school changes the
 * sign-in email), notification channels per kind, and the account with sign out.
 */
const ui = useUiStore();
const profile = useProfileQuery();
const update = useUpdateProfileMutation();
const prefsQ = usePreferencesQuery();
const savePrefs = useSavePreferencesMutation();
const editing = ref(false);

const { handleSubmit, resetForm, setErrors } = useForm({
  validationSchema: profileSchema,
  initialValues: { phone: '', address: '' },
});
const startEdit = () => {
  resetForm({
    values: { phone: profile.data.value?.phone ?? '', address: profile.data.value?.address ?? '' },
  });
  editing.value = true;
};
const onSave = handleSubmit(async (form) => {
  try {
    const res = await update.mutateAsync({ phone: form.phone, address: form.address });
    toast.success(messageOf(res, 'Contact details saved.'));
    editing.value = false;
  } catch (err) {
    const fields = fieldErrorsOf(err);
    if (Object.keys(fields).length) setErrors(fields);
    else toast.error(getApiErrorMessage(err, 'Your details weren’t saved. Try again.'));
  }
});

// Notification switches: edited locally, saved together.
const prefs = ref<NotificationPreference[]>([]);
watch(
  () => prefsQ.data.value,
  (list) => (prefs.value = (list ?? []).map((p) => ({ ...p }))),
  { immediate: true },
);
const prefsChanged = computed(() =>
  prefs.value.some((p) => {
    const saved = prefsQ.data.value?.find((s) => s.key === p.key);
    return saved && (saved.inApp !== p.inApp || saved.email !== p.email || saved.sms !== p.sms);
  }),
);
async function saveChannels() {
  try {
    const res = await savePrefs.mutateAsync(
      prefs.value.map(({ key, inApp, email, sms }) => ({ key, inApp, email, sms })),
    );
    toast.success(messageOf(res, 'Notification settings saved.'));
  } catch (err) {
    toast.error(getApiErrorMessage(err, 'Your settings weren’t saved. Try again.'));
  }
}
const CHANNELS = [
  { key: 'inApp', label: 'In-app' },
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
] as const;
</script>

<template>
  <PageTitle title="Profile" :sub="profile.data.value?.name" />
  <QueryState
    v-if="!profile.data.value"
    :loading="profile.isPending.value"
    :error="profile.error.value"
    @retry="profile.refetch()"
  />
  <template v-else>
    <ListSection v-if="!editing" title="Contact">
      <ListRow title="Phone" :right="profile.data.value.phone || 'Not set'" />
      <ListRow title="Address" :sub="profile.data.value.address || 'Not set'" />
      <ListRow title="Email" :right="profile.data.value.email">
        <template #sub
          ><span class="flex items-center gap-1"
            ><LockIcon class="size-3" /> Your sign-in email. Ask the school to change it.</span
          ></template
        >
      </ListRow>
      <div class="px-3.5 py-2.5">
        <Button variant="outline" size="sm" @click="startEdit">Edit phone and address</Button>
      </div>
    </ListSection>
    <form
      v-else
      class="flex flex-col gap-3.5 rounded-lg border bg-card p-3.5"
      novalidate
      @submit="onSave"
    >
      <span class="text-sm font-semibold">Edit contact details</span>
      <FormInput
        name="phone"
        label="Mobile number"
        type="tel"
        inputmode="tel"
        autocomplete="tel"
        placeholder="0803 555 0161"
        required
      />
      <FormTextarea
        name="address"
        label="Home address"
        placeholder="22 Opebi Road, Ikeja"
        :rows="2"
      />
      <p class="text-xs text-muted-foreground">
        The school sees this change on your record and uses this number for SMS.
      </p>
      <div class="flex gap-2">
        <Button type="button" variant="outline" class="flex-1" @click="editing = false"
          >Cancel</Button
        >
        <Button type="submit" class="flex-[2]" :disabled="update.isPending.value">
          <Spinner v-if="update.isPending.value" /> Save
        </Button>
      </div>
    </form>

    <section class="flex flex-col gap-1.5">
      <h2 class="text-sm font-semibold">Notifications</h2>
      <div class="overflow-hidden rounded-lg border bg-card">
        <div
          class="grid grid-cols-[1fr_repeat(3,3.5rem)] items-center gap-2 border-b border-divider px-3.5 py-2 text-xs text-faint"
        >
          <span>What</span>
          <span v-for="c in CHANNELS" :key="c.key" class="text-center">{{ c.label }}</span>
        </div>
        <div
          v-for="p in prefs"
          :key="p.key"
          class="grid grid-cols-[1fr_repeat(3,3.5rem)] items-center gap-2 border-b border-divider px-3.5 py-2.5 last:border-b-0"
        >
          <span class="flex flex-col">
            <span class="text-sm">{{ p.label }}</span>
            <span class="text-xs text-faint">{{ p.description }}</span>
          </span>
          <span v-for="c in CHANNELS" :key="c.key" class="flex justify-center">
            <Switch
              :model-value="p[c.key]"
              :aria-label="`${p.label}: ${c.label}`"
              @update:model-value="(v: boolean) => (p[c.key] = v)"
            />
          </span>
        </div>
      </div>
      <p class="text-xs text-muted-foreground">
        The school chooses which messages it sends; switch off a channel you don’t want. Sign-in and
        security emails always arrive.
      </p>
      <Button
        v-if="prefsChanged"
        class="self-start"
        :disabled="savePrefs.isPending.value"
        @click="saveChannels"
      >
        <Spinner v-if="savePrefs.isPending.value" /> Save notification settings
      </Button>
    </section>

    <ListSection title="Account">
      <ListRow
        :title="`Signed in as ${profile.data.value.email}`"
        :sub="
          profile.data.value.lastSignInAt
            ? `This device · last sign-in ${formatDateTime(profile.data.value.lastSignInAt)}`
            : 'This device'
        "
      />
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
