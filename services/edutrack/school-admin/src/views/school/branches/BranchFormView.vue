<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Switch } from '@edutrack/ui/components/switch';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { CheckIcon } from '@lucide/vue';
import { useField, useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FormCombobox from '@edutrack/app-kit/components/form/FormCombobox.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormSelect from '@edutrack/app-kit/components/form/FormSelect.vue';
import FormTextarea from '@edutrack/app-kit/components/form/FormTextarea.vue';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';
import { lgasOf, NIGERIAN_STATES } from '@edutrack/app-kit/lib/nigeria-locations';

import {
  useBranchesQuery,
  useCreateBranchMutation,
  useStaffOptionsQuery,
  useUpdateBranchMutation,
} from '@/api/services/school';
import { routesPath } from '@/router/routes-path';
import { branchSchema } from '@/schema/school';
import { useLayoutStore } from '@/stores/layout';
import type { Branch, SchoolSection } from '@/types';

const route = useRoute();
const router = useRouter();
const layout = useLayoutStore();
const id = computed(() => (route.params.id as string | undefined) ?? '');
const isNew = computed(() => !id.value);
/** Opened from the Setup Center's Branches step: saving or cancelling returns there. */
const fromSetup = computed(() => route.query.from === 'setup');

const { data: list, isPending } = useBranchesQuery();
const { data: staff } = useStaffOptionsQuery();
const create = useCreateBranchMutation();
const update = useUpdateBranchMutation(id);

const branch = computed<Branch | undefined>(() =>
  list.value?.branches.find((b) => b.id === id.value),
);
const others = computed(() => (list.value?.branches ?? []).filter((b) => b.id !== id.value));
const prefix = computed(() => list.value?.codePrefix ?? '');
const offering = computed(() => list.value?.offering ?? []);
const hasRecords = computed(
  () => !!branch.value && (branch.value.students > 0 || branch.value.classArms > 0),
);
const limitReached = computed(
  () => isNew.value && !!list.value && list.value.branches.length >= list.value.branchLimit,
);

watch(branch, (b) => layout.setRecordLabel(b ? `Edit ${b.name}` : null), { immediate: true });

const { values, meta, handleSubmit, resetForm, setFieldValue } = useForm({
  validationSchema: branchSchema(
    () => ({
      names: others.value.map((b) => b.name),
      codes: others.value.map((b) => [b.code, b.name]),
    }),
    () => prefix.value,
  ),
});
const { value: sections, errorMessage: sectionsError } = useField<SchoolSection[]>('sections');
const { value: hasStore } = useField<boolean>('hasStore');
const { value: grantBranchAdmin } = useField<boolean>('grantBranchAdmin');
const { value: code } = useField<string>('code');

watch(
  [list, branch],
  () => {
    if (!list.value || meta.value.dirty) return;
    const b = branch.value;
    resetForm({
      values: b
        ? {
            name: b.name,
            code: b.code,
            headId: b.headId ?? '',
            grantBranchAdmin: true,
            street: b.street,
            city: b.city,
            state: b.state,
            lga: b.lga,
            phone: b.phone,
            email: b.email,
            sections: [...b.sections],
            hasStore: b.hasStore,
          }
        : {
            name: '',
            code: prefix.value,
            headId: '',
            grantBranchAdmin: true,
            street: '',
            city: '',
            state: 'Lagos',
            lga: '',
            phone: '',
            email: '',
            sections: offering.value.length === 1 ? [...offering.value] : [],
            hasStore: true,
          },
    });
  },
  { immediate: true },
);
watch(code, (c) => c && c !== c.toUpperCase() && setFieldValue('code', c.toUpperCase()));
watch(
  () => values.state,
  (state) => {
    if (values.lga && state && !lgasOf(state).includes(values.lga)) setFieldValue('lga', '');
  },
);

const saved = ref(false);
const serverError = ref('');
useUnsavedChanges(() => meta.value.dirty && !saved.value);

const heads = computed(() => [
  { value: '', label: 'Not assigned' },
  ...(staff.value ?? [])
    .filter((s) => s.account === 'Active')
    .map((s) => ({ value: s.id, label: `${s.name} · ${s.position}` })),
]);
const head = computed(() => staff.value?.find((s) => s.id === values.headId));
/** The head needs Branch Admin access to approve for this branch. */
const needsAccess = computed(
  () =>
    !!head.value && !head.value.hasSchoolWideAccess && !head.value.roles.includes('Branch Admin'),
);
const alsoHeads = computed(() =>
  values.headId ? others.value.filter((b) => b.headId === values.headId).map((b) => b.name) : [],
);
const removedWithRecords = computed(() =>
  hasRecords.value ? branch.value!.sections.filter((s) => !sections.value?.includes(s)) : [],
);
const codeHint = computed(() =>
  hasRecords.value && values.code !== branch.value!.code
    ? `Existing admission numbers and receipts keep ${branch.value!.code}. New ones use ${values.code}.`
    : `Format: ${prefix.value}IK · used on admission numbers and receipts.`,
);

function toggleSection(s: SchoolSection) {
  const cur = sections.value ?? [];
  sections.value = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
}

const back = () =>
  fromSetup.value
    ? router.push({ name: routesPath.setupBranches.name })
    : isNew.value
      ? router.push({ name: routesPath.school.branches.name })
      : router.push({ name: routesPath.school.branch.name, params: { id: id.value } });

const onSubmit = handleSubmit(async (v) => {
  if (removedWithRecords.value.length) return;
  serverError.value = '';
  const payload = {
    ...v,
    headId: v.headId || null,
    grantBranchAdmin: needsAccess.value && v.grantBranchAdmin,
  };
  try {
    const result = isNew.value
      ? await create.mutateAsync(payload)
      : await update.mutateAsync(payload);
    saved.value = true;
    toast.success(
      isNew.value
        ? 'Branch created. Next, set up its classes.'
        : `Branch saved.${payload.grantBranchAdmin ? ` ${head.value!.name} now has Branch Admin access.` : ''}`,
    );
    await (fromSetup.value
      ? router.push({ name: routesPath.setupBranches.name })
      : router.push({ name: routesPath.school.branch.name, params: { id: result.id } }));
  } catch (e) {
    serverError.value = getApiErrorMessage(
      e,
      'The server didn’t respond. Nothing was saved and your changes are still here. Try again.',
    );
  }
});
const saving = computed(() => create.isPending.value || update.isPending.value);
</script>

<template>
  <template v-if="isPending"><Skeleton class="h-16 w-1/2" /><Skeleton class="h-96" /></template>

  <EmptyState
    v-else-if="!isNew && !branch"
    illustrated
    title="This branch doesn’t exist"
    description="It may have been deleted, or the link is wrong."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.school.branches.name }">All branches</RouterLink></Button
    >
  </EmptyState>

  <template v-else-if="limitReached">
    <PageHeader title="Branch limit reached" />
    <InlineNotice
      tone="warning"
      :title="`Your ${list!.planName} plan allows ${list!.branchLimit} branches`"
      description="You’re using all of them, including inactive ones. Upgrade the plan to add another."
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: routesPath.school.branches.name }"
            >Back to branches</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>
  </template>

  <form v-else class="flex flex-col gap-4" novalidate @submit="onSubmit">
    <PageHeader
      :title="isNew ? 'Add a branch' : `Edit ${branch!.name}`"
      :description="
        isNew
          ? `A branch is a campus with its own classes, staff, students and store. This uses ${list!.branches.length + 1} of ${list!.branchLimit} branches on your plan.`
          : hasRecords
            ? 'Changes apply from today. Past records keep the details they were created with.'
            : 'This branch has no records yet, so all details can change.'
      "
    />
    <InlineNotice
      v-if="branch && branch.status !== 'Active'"
      tone="neutral"
      :title="`${branch.name} is inactive`"
      description="You can edit its details. Reactivate it from the branch page to use it again."
    />
    <InlineNotice
      v-if="serverError"
      tone="error"
      title="We couldn’t save your changes"
      :description="serverError"
      role="alert"
    />

    <SectionCard
      title="Branch details"
      description="Name and code identify the campus everywhere: selectors, admission numbers and receipts."
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <FormInput name="name" label="Branch name" required placeholder="e.g. Ikoyi Campus" />
        <FormInput
          name="code"
          label="Branch code"
          required
          :placeholder="`${prefix}IK`"
          :hint="codeHint"
        />
      </div>
    </SectionCard>

    <SectionCard
      title="Head of campus"
      description="Runs the branch day to day. Branch approvals go to them."
    >
      <div class="flex flex-col gap-4">
        <FormSelect
          name="headId"
          label="Head of campus"
          :options="heads"
          :hint="
            alsoHeads.length
              ? `Also head of ${alsoHeads.join(', ')}. One person can lead more than one campus.`
              : undefined
          "
        />
        <label v-if="needsAccess" class="flex items-center gap-2.5 text-[13px]">
          <Switch v-model="grantBranchAdmin" />
          Give {{ head!.name }} Branch Admin access for this branch
        </label>
      </div>
    </SectionCard>

    <SectionCard
      title="Address & contact"
      description="Shown to parents of students at this branch. The head office address is in School Profile."
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <FormTextarea
          name="street"
          label="Street address"
          required
          placeholder="e.g. 7 Admiralty Way"
          :rows="2"
          class="sm:col-span-2"
        />
        <FormInput name="city" label="Town / city" required placeholder="e.g. Lekki" />
        <FormCombobox
          name="state"
          label="State"
          required
          :options="NIGERIAN_STATES"
          placeholder="Select the state"
        />
        <FormCombobox
          name="lga"
          label="LGA"
          :options="values.state ? lgasOf(values.state) : []"
          :placeholder="values.state ? 'Select the LGA' : 'Select a state first'"
          :disabled="!values.state"
        />
        <FormInput
          name="phone"
          label="Phone"
          type="tel"
          inputmode="tel"
          placeholder="0803 555 0142"
        />
        <FormInput
          name="email"
          label="Email"
          type="email"
          placeholder="lekki@school.ng"
          class="sm:col-span-2"
        />
      </div>
    </SectionCard>

    <SectionCard
      title="Sections offered"
      :description="
        offering.length === 1
          ? 'Your school runs one section, so it’s selected for you.'
          : 'Only sections your school offers are listed. You’ll create classes for each one.'
      "
    >
      <fieldset class="flex flex-col gap-2" :aria-invalid="!!sectionsError">
        <legend class="sr-only">Sections at this branch</legend>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="s in offering"
            :key="s"
            type="button"
            :aria-pressed="sections?.includes(s)"
            :class="
              cn(
                'flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px]',
                sections?.includes(s)
                  ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
                  : 'bg-card hover:bg-muted',
              )
            "
            @click="toggleSection(s)"
          >
            <CheckIcon v-if="sections?.includes(s)" class="size-3.5" />{{ s }}
          </button>
        </div>
        <p v-if="removedWithRecords.length" role="alert" class="text-xs text-destructive">
          {{ removedWithRecords.join(', ') }} has classes and students at {{ branch!.name }}. Move
          or archive those classes before removing it.
        </p>
        <p v-else-if="sectionsError" role="alert" class="text-xs text-destructive">
          {{ sectionsError }}
        </p>
      </fieldset>
    </SectionCard>

    <SectionCard
      v-if="isNew"
      title="Inventory"
      description="Optional. A store tracks stock such as books and uniforms for this campus."
    >
      <label class="flex items-center gap-2.5 text-[13px]">
        <Switch v-model="hasStore" />
        Create “{{ values.name?.trim() || 'Branch' }} Store”
      </label>
    </SectionCard>

    <div class="sticky bottom-0 flex items-center gap-2.5 border-t bg-background py-3">
      <span class="text-xs" :class="meta.dirty ? 'text-warning-strong' : 'text-faint'">{{
        meta.dirty ? 'Unsaved changes' : 'No changes yet'
      }}</span>
      <Button type="button" variant="ghost" class="ml-auto" @click="back">Cancel</Button>
      <Button type="submit" :disabled="saving">
        <Spinner v-if="saving" />
        {{ saving ? 'Saving…' : isNew ? 'Create branch' : 'Save changes' }}
      </Button>
    </div>
  </form>
</template>
