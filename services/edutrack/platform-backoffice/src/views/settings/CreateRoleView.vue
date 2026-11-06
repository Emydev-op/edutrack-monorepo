<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import { useCreateRoleMutation, useRolesQuery } from '@/api/services/users';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import PermissionMatrix from '@/components/common/PermissionMatrix.vue';
import StepIndicator from '@edutrack/app-kit/components/common/StepIndicator.vue';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';
import { routesPath } from '@/router/routes-path';
import { HIGH_RISK_PERMISSIONS, PERMISSION_AREAS, PERMISSIONS, type PermissionSet } from '@/types';

import { roleDraft } from './role-draft';

const router = useRouter();
const { data: roles } = useRolesQuery();
const create = useCreateRoleMutation();

const draft = roleDraft.value;
roleDraft.value = null;
const step = ref(draft?.step ?? 0);
const name = ref(draft?.name ?? '');
const description = ref(draft?.description ?? '');
const permissions = ref<PermissionSet>(
  draft?.permissions ?? { Schools: ['View'], Support: ['View'] },
);
const error = ref('');
const created = ref(false);

const count = computed(() =>
  Object.values(permissions.value).reduce((n, list) => n + (list?.length ?? 0), 0),
);
useUnsavedChanges(() => !created.value && (!!name.value.trim() || !!description.value.trim()));

const review = computed(() =>
  PERMISSION_AREAS.map((area) => {
    const granted = PERMISSIONS.filter((p) => (permissions.value[area] ?? []).includes(p));
    const level = !granted.length
      ? 'none'
      : granted.length === PERMISSIONS.length
        ? 'full'
        : granted.length === 1 && granted[0] === 'View'
          ? 'view'
          : 'partial';
    return { area, granted, level, risky: granted.some((p) => HIGH_RISK_PERMISSIONS.includes(p)) };
  }),
);
const riskyAreas = computed(() => review.value.filter((r) => r.risky).map((r) => r.area));
const LEVEL = {
  none: { label: 'No access', cls: 'bg-[#F1F0EE] text-[#6B6B67]' },
  full: { label: 'Full access', cls: 'bg-[#F6E7E4] text-brand-strong' },
  view: { label: 'View only', cls: 'bg-info-subtle text-info-strong' },
  partial: { label: 'Partial', cls: 'bg-[#FDF0DF] text-warning-strong' },
};

function next() {
  error.value = '';
  if (step.value === 0) {
    if (!name.value.trim()) return void (error.value = 'Give the role a name');
    if (roles.value?.some((r) => r.name.toLowerCase() === name.value.trim().toLowerCase()))
      return void (error.value = 'A role with this name already exists');
  }
  if (step.value === 1 && !count.value)
    return void (error.value = 'Select at least one permission');
  step.value += 1;
}

async function submit() {
  error.value = '';
  try {
    await create.mutateAsync({
      name: name.value.trim(),
      description: description.value.trim(),
      permissions: permissions.value,
    });
    created.value = true;
    toast.success(`Role “${name.value.trim()}” created. Assign it from Users.`);
    await router.push({ name: routesPath.settings.access.name });
  } catch (err) {
    error.value = getApiErrorMessage(err);
  }
}
</script>

<template>
  <PageHeader
    title="Create role"
    description="Roles decide what platform users can see and do. Changes apply the next time affected users load a page."
  />
  <StepIndicator :steps="['Role information', 'Permissions', 'Review']" :current="step" />
  <div class="flex max-w-[880px] flex-col gap-3.5 rounded-lg border bg-card p-5">
    <template v-if="step === 0">
      <label class="flex flex-col gap-1.5 text-[13px] font-medium">
        <span>Role name <span class="text-destructive">*</span></span>
        <Input
          v-model="name"
          placeholder="e.g. Onboarding Specialist"
          class="bg-card font-normal"
        />
      </label>
      <label class="flex flex-col gap-1.5 text-[13px] font-medium">
        Description
        <Textarea
          v-model="description"
          rows="3"
          placeholder="What this role is for"
          class="resize-y bg-card font-normal"
        />
      </label>
    </template>

    <template v-else-if="step === 1">
      <div class="flex justify-between">
        <span class="font-semibold">Permissions</span>
        <span class="text-xs text-muted-foreground">{{ count }} permissions selected</span>
      </div>
      <PermissionMatrix v-model="permissions" />
      <span class="text-xs text-faint"
        >Delete and Suspend are high-risk. Give them only to roles that need them.</span
      >
    </template>

    <div v-else class="flex flex-col gap-4">
      <div class="flex flex-col gap-0.5">
        <span class="text-base font-semibold">Review the new role</span>
        <span class="text-[13px] text-muted-foreground"
          >Check who this role is for and what it can do. Nothing is saved until you create
          it.</span
        >
      </div>
      <div class="flex items-center gap-3.5 rounded-lg border bg-muted px-4 py-3.5">
        <span
          aria-hidden="true"
          class="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-primary font-semibold text-white"
        >
          {{ name.trim().slice(0, 2).toUpperCase() }}
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="text-[15px] font-semibold">{{ name }}</span>
          <span class="text-[13px] text-pretty text-muted-foreground">{{
            description || 'No description'
          }}</span>
        </span>
        <button
          type="button"
          class="text-[13px] font-medium text-primary hover:underline"
          @click="step = 0"
        >
          Edit
        </button>
      </div>
      <p
        v-if="riskyAreas.length"
        class="rounded-md bg-warning-subtle px-3.5 py-3 text-[13px] text-warning-strong"
      >
        This role can delete, suspend or manage records in {{ riskyAreas.join(', ') }}. Only give it
        to people who need those actions.
      </p>
      <div class="overflow-hidden rounded-lg border">
        <div class="flex items-center justify-between bg-muted px-4 py-2.5">
          <span class="text-[13px] font-semibold">What this role can do</span>
          <button
            type="button"
            class="text-[13px] font-medium text-primary hover:underline"
            @click="step = 1"
          >
            Edit permissions
          </button>
        </div>
        <div
          v-for="r in review"
          :key="r.area"
          class="grid grid-cols-[140px_110px_minmax(0,1fr)] items-center gap-3 border-t border-divider px-4 py-2.75"
          :class="r.level === 'none' && 'opacity-60'"
        >
          <span class="text-[13px] font-medium">{{ r.area }}</span>
          <span
            :class="[
              'inline-flex h-[22px] items-center justify-self-start rounded-sm px-2 text-xs font-medium',
              LEVEL[r.level as keyof typeof LEVEL].cls,
            ]"
          >
            {{ LEVEL[r.level as keyof typeof LEVEL].label }}
          </span>
          <span class="flex flex-wrap gap-1.5">
            <span
              v-for="p in r.granted"
              :key="p"
              :class="[
                'inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-xs',
                HIGH_RISK_PERMISSIONS.includes(p)
                  ? 'border-[#F1C9C4] bg-error-subtle text-error-strong'
                  : 'bg-muted text-body',
              ]"
            >
              <span aria-hidden="true" class="text-[10px] font-bold">{{
                HIGH_RISK_PERMISSIONS.includes(p) ? '!' : '✓'
              }}</span
              >{{ p }}
            </span>
            <span v-if="!r.granted.length" class="text-xs text-faint">Can’t see this area</span>
          </span>
        </div>
      </div>
    </div>

    <p v-if="error" role="alert" class="text-xs text-destructive">{{ error }}</p>
    <div class="flex justify-between">
      <Button
        variant="outline"
        @click="step ? (step -= 1) : router.push({ name: routesPath.settings.access.name })"
      >
        <ArrowLeftIcon /> {{ step ? 'Back' : 'Cancel' }}
      </Button>
      <Button v-if="step < 2" @click="next">Continue <ArrowRightIcon /></Button>
      <Button v-else :disabled="create.isPending.value" @click="submit">
        <Spinner v-if="create.isPending.value" /><CheckIcon v-else /> Create role
      </Button>
    </div>
  </div>
</template>
