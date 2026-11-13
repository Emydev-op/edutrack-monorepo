<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { useForm } from 'vee-validate';
import { ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormTextarea from '@edutrack/app-kit/components/form/FormTextarea.vue';

import { useProfileQuery, useSaveProfileMutation } from '@/api/services/profile';
import { useUnsavedWork } from '@/composables/useUnsavedWork';
import { getApiErrorMessage } from '@/lib/api-errors';
import { routesPath } from '@/router/routes-path';
import { profileSchema } from '@/schema/profile';

const router = useRouter();
const { data: profile, isPending } = useProfileQuery();
const save = useSaveProfileMutation();
const serverError = ref('');

const { handleSubmit, resetForm, meta } = useForm({
  validationSchema: profileSchema,
  initialValues: {
    phone: '',
    address: '',
    contactName: '',
    contactPhone: '',
    contactRelationship: '',
  },
});
watch(
  profile,
  (p) =>
    p &&
    !meta.value.dirty &&
    resetForm({
      values: {
        phone: p.phone,
        address: p.address,
        contactName: p.emergencyContact?.name ?? '',
        contactPhone: p.emergencyContact?.phone ?? '',
        contactRelationship: p.emergencyContact?.relationship ?? '',
      },
    }),
  { immediate: true },
);
const saved = ref(false);
useUnsavedWork(() => meta.value.dirty && !saved.value, 'Profile changes');

const onSubmit = handleSubmit(async (v) => {
  serverError.value = '';
  try {
    await save.mutateAsync({
      phone: v.phone,
      address: v.address ?? '',
      emergencyContact: v.contactName
        ? {
            name: v.contactName,
            phone: v.contactPhone ?? '',
            relationship: v.contactRelationship ?? '',
          }
        : null,
    });
    saved.value = true;
    toast.success('Profile updated.');
    await router.push({ name: routesPath.profile.view.name });
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'Your profile wasn’t saved. Try again.');
  }
});
</script>

<template>
  <PageHeader
    title="Edit profile"
    description="Your phone, address and emergency contact. The school office keeps your name, email and roles."
  />
  <Skeleton v-if="isPending" class="h-96 w-full" />
  <form v-else class="flex max-w-2xl flex-col gap-5" novalidate @submit="onSubmit">
    <SectionCard title="Contact">
      <div class="flex flex-col gap-4.5">
        <FormInput
          name="phone"
          label="Mobile number"
          type="tel"
          autocomplete="tel"
          inputmode="tel"
          required
          placeholder="0803 412 7781"
          hint="A Nigerian mobile number. Spaces are fine."
        />
        <FormTextarea
          name="address"
          label="Home address"
          placeholder="14 Adeniyi Jones Avenue, Ikeja, Lagos"
          :rows="2"
        />
      </div>
    </SectionCard>
    <SectionCard
      title="Emergency contact"
      description="Who the school calls if something happens to you at work."
    >
      <div class="grid grid-cols-2 gap-4.5 max-sm:grid-cols-1">
        <FormInput
          name="contactName"
          label="Name"
          placeholder="Mrs. Funke Ade"
          class="col-span-2 max-sm:col-span-1"
        />
        <FormInput
          name="contactPhone"
          label="Mobile number"
          type="tel"
          inputmode="tel"
          placeholder="0807 993 4410"
        />
        <FormInput name="contactRelationship" label="Relationship" placeholder="Spouse" />
      </div>
    </SectionCard>
    <p
      v-if="serverError"
      role="alert"
      class="rounded-md bg-error-subtle px-3 py-2.5 text-[13px] text-error-strong"
    >
      {{ serverError }}
    </p>
    <div class="flex flex-wrap gap-2">
      <Button type="submit" :disabled="save.isPending.value">
        <Spinner v-if="save.isPending.value" />
        {{ save.isPending.value ? 'Saving…' : 'Save changes' }}
      </Button>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.profile.view.name }">Cancel</RouterLink></Button
      >
    </div>
  </form>
</template>
