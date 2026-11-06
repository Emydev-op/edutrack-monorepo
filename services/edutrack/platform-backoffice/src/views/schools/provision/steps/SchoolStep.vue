<script setup lang="ts">
import { useField } from 'vee-validate';
import { computed, watch } from 'vue';

import FormCombobox from '@edutrack/app-kit/components/form/FormCombobox.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormSelect from '@edutrack/app-kit/components/form/FormSelect.vue';
import { lgasOf, NIGERIAN_STATES } from '@edutrack/app-kit/lib/nigeria-locations';

import BrandColorPicker from './BrandColorPicker.vue';

defineProps<{ schoolName: string }>();

const { value: state } = useField<string>('state');
const { value: lga } = useField<string>('lga');
const lgas = computed(() => lgasOf(state.value));
// A new state has its own LGAs, so an LGA picked for the old one no longer applies.
watch(state, () => {
  if (lga.value && !lgas.value.includes(lga.value)) lga.value = '';
});
</script>

<template>
  <div class="grid gap-3.5 sm:grid-cols-2">
    <FormInput name="name" label="Display name" required placeholder="Crestview College" />
    <FormInput name="legalName" label="Legal name" placeholder="Crestview College Ltd" />
    <FormSelect name="ownership" label="Ownership" :options="['Private', 'Public', 'Mission']" />
    <FormInput
      name="registrationNumber"
      label="Registration number"
      placeholder="FCT/SEC/2015/0221"
    />
    <FormInput
      name="email"
      label="Email"
      type="email"
      required
      placeholder="info@crestviewcollege.ng"
    />
    <FormInput name="phone" label="Phone" type="tel" placeholder="0809 555 0123" />
    <FormCombobox
      name="state"
      label="State"
      required
      :options="NIGERIAN_STATES"
      placeholder="Select a state"
      search-placeholder="Search states"
    />
    <FormCombobox
      name="lga"
      label="LGA"
      required
      :options="lgas"
      :disabled="!lgas.length"
      :placeholder="lgas.length ? 'Select an LGA' : 'Select a state first'"
      search-placeholder="Search LGAs"
      empty-text="No LGA matches that name."
    />
  </div>
  <BrandColorPicker :school-name="schoolName" />
</template>
