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
import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormSelect from '@edutrack/app-kit/components/form/FormSelect.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import {
  useSaveStaffMutation,
  useStaffFormOptionsQuery,
  useStaffMemberQuery,
} from '@/api/services/staff';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';
import type { StaffPayload } from '@/types';

import { EMPLOYMENT, GENDERS, staffFormSchema, TITLES } from './staff-form-schema';

const route = useRoute();
const router = useRouter();
const layout = useLayoutStore();
const confirm = useConfirm();
const id = computed(() => (route.params.id as string | undefined) ?? '');
const isNew = computed(() => !id.value);
/** Opened from the Setup Center's Staff step: saving a new record returns to the directory there. */
const fromSetup = computed(() => route.query.from === 'setup');

const { data: options, isPending: optionsPending } = useStaffFormOptionsQuery();
const { data: detail, isPending: detailPending, isError } = useStaffMemberQuery(id);
const save = useSaveStaffMutation();
const isPending = computed(() => optionsPending.value || (!isNew.value && detailPending.value));
const isYou = computed(() => !!detail.value?.isYou);

watch(detail, (d) => layout.setRecordLabel(d ? `Edit ${d.name}` : null), { immediate: true });

const { values, meta, handleSubmit, resetForm, setFieldValue } = useForm({
  validationSchema: staffFormSchema,
});
const { value: kind } = useField<'Teaching' | 'Non-teaching'>('kind');
const { value: branchIds, errorMessage: branchError } = useField<string[]>('branchIds');
const { value: qualified } = useField<string[]>('qualified');
const { value: access } = useField<boolean>('access');
const { value: role, errorMessage: roleError } = useField<string>('role');

watch(
  [options, detail],
  () => {
    if (!options.value || meta.value.dirty || (!isNew.value && !detail.value)) return;
    const d = detail.value;
    const branches = options.value.branches;
    resetForm({
      values: d
        ? {
            title: d.title,
            firstName: d.firstName,
            lastName: d.lastName,
            gender: d.gender,
            phone: d.phone,
            email: d.email,
            address: d.address,
            emergencyContact: d.emergencyContact,
            kind: d.kind,
            position: d.position,
            department: d.department,
            employment: d.employment,
            since: /^\d{4}-\d{2}-\d{2}$/.test(d.since) ? d.since : '',
            branchIds: [...d.branchIds],
            qualified: [...d.qualified],
            maxPeriods: d.maxPeriods || 28,
            access: !!d.user && d.user.status !== 'Deactivated',
            role: d.user?.roles[0] ?? '',
          }
        : {
            title: '',
            firstName: '',
            lastName: '',
            gender: '',
            phone: '',
            email: '',
            address: '',
            emergencyContact: '',
            kind: route.query.kind === 'Non-teaching' ? 'Non-teaching' : 'Teaching',
            position: route.query.kind === 'Non-teaching' ? '' : 'Teacher',
            department: '',
            employment: 'Full-time',
            since: '',
            branchIds: branches.length === 1 ? [branches[0]!.id] : [],
            qualified: [],
            maxPeriods: 28,
            access: true,
            role: route.query.kind === 'Non-teaching' ? '' : 'Teacher',
          },
    });
  },
  { immediate: true },
);

/* Picking a position on a new record suggests the usual role; "Teacher" makes them teaching. */
watch(
  () => values.position,
  (p, old) => {
    if (!p || p === old || !isNew.value || !options.value) return;
    const suggested = options.value.roleForPosition[p];
    if (suggested) {
      setFieldValue('role', suggested);
      setFieldValue('access', true);
    }
    if (p === 'Teacher') setFieldValue('kind', 'Teaching');
  },
);
watch(
  () => values.employment,
  (e, old) => {
    if (!old || e === old || values.kind !== 'Teaching') return;
    if (e === 'Part-time' && values.maxPeriods === 28) setFieldValue('maxPeriods', 14);
    if (e !== 'Part-time' && values.maxPeriods === 14) setFieldValue('maxPeriods', 28);
  },
);

const saved = ref(false);
const serverError = ref('');
useUnsavedChanges(() => meta.value.dirty && !saved.value);

const positions = computed(() => [
  { value: '', label: 'Choose…' },
  ...(options.value?.positions ?? []).map((p) => ({ value: p, label: p })),
  // Keep a seeded title that isn't in the standard list selectable.
  ...(detail.value && !options.value?.positions.includes(detail.value.position)
    ? [{ value: detail.value.position, label: detail.value.position }]
    : []),
]);
const departments = computed(() => [
  { value: '', label: 'Choose…' },
  ...(options.value?.departments ?? []).map((d) => ({ value: d, label: d })),
  ...(detail.value?.department && !options.value?.departments.includes(detail.value.department)
    ? [{ value: detail.value.department, label: detail.value.department }]
    : []),
]);
const roles = computed(() =>
  (options.value?.roles ?? []).map((r) => ({
    value: r.name,
    label: r.name,
    description: r.description,
  })),
);
const firstName = computed(() => values.firstName?.trim() || 'them');

function toggle(list: string[] | undefined, value: string) {
  const cur = list ?? [];
  return cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
}
const chip = (on: boolean) =>
  cn(
    'flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px]',
    on ? 'border-primary bg-brand-subtle font-medium text-brand-strong' : 'bg-card hover:bg-muted',
  );

const inviteLine = computed(() => {
  const u = detail.value?.user;
  if (u?.status === 'Active') return 'Accepted · account active';
  if (u?.status === 'Invited')
    return values.email && values.email !== u.email
      ? `A new invitation goes to ${values.email} when you save`
      : `Sent to ${u.email} · expires in 7 days`;
  if (u) return `Account ${u.status.toLowerCase()} · manage it in Users & Roles`;
  return `Sent to ${values.email?.trim() || 'their email'} when you save`;
});

/** What saving would clear in Academics, so the admin can confirm first. */
const clears = computed(() => {
  const t = detail.value?.teaching;
  if (!t || isNew.value) return [] as [string, string][];
  const rows: [string, string][] = [];
  if (values.kind === 'Non-teaching' && (t.assignments.length || t.classTeacherOf.length)) {
    rows.push([
      'Teaching assignments',
      `${t.assignments.length} subject assignment${t.assignments.length === 1 ? '' : 's'} will be cleared`,
    ]);
    if (t.classTeacherOf.length)
      rows.push([
        'Class teacher',
        `No longer class teacher of ${t.classTeacherOf.map((c) => c.name).join(', ')}`,
      ]);
    return rows;
  }
  const kept = new Set(
    (options.value?.branches ?? [])
      .filter((b) => values.branchIds?.includes(b.id))
      .map((b) => b.name),
  );
  const lost = t.assignments.filter((a) => !kept.has(a.branch));
  if (lost.length)
    rows.push([
      'Branches removed',
      `${lost.length} assignment${lost.length === 1 ? '' : 's'} at ${[...new Set(lost.map((a) => a.branch))].join(', ')} will be cleared`,
    ]);
  return rows;
});
const cancelsInvite = computed(
  () => !isNew.value && detail.value?.user?.status === 'Invited' && !values.access,
);

const back = () =>
  isNew.value
    ? router.push({
        name: routesPath.staff.directory.name,
        query: fromSetup.value ? { from: 'setup' } : undefined,
      })
    : router.push({ name: routesPath.staff.detail.name, params: { id: id.value } });

const onSubmit = handleSubmit(async (v) => {
  serverError.value = '';
  const payload: StaffPayload = {
    title: v.title,
    firstName: v.firstName,
    lastName: v.lastName,
    gender: v.gender,
    phone: v.phone,
    email: v.email,
    address: v.address,
    emergencyContact: v.emergencyContact,
    kind: v.kind,
    position: v.position,
    department: v.department,
    employment: v.employment,
    since: v.since,
    branchIds: v.branchIds,
    qualified: v.kind === 'Teaching' ? v.qualified : [],
    maxPeriods: v.kind === 'Teaching' ? (v.maxPeriods ?? 28) : 0,
    access: isYou.value ? true : v.access,
    role: v.role,
  };
  const run = async () => {
    try {
      const result = await save.mutateAsync(isNew.value ? payload : { ...payload, id: id.value });
      saved.value = true;
      const name = [v.title, v.firstName, v.lastName].filter(Boolean).join(' ');
      const cleared =
        'cleared' in result ? (result.cleared as { removed: number; classes: number }) : null;
      const invitedNow = payload.access && (isNew.value || !detail.value?.user);
      toast.success(
        [
          invitedNow
            ? `Invitation sent to ${payload.email}.`
            : isNew.value
              ? `${name} added.`
              : 'Changes saved.',
          cleared?.removed
            ? `${cleared.removed} assignment${cleared.removed === 1 ? '' : 's'} cleared.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
      await (isNew.value && fromSetup.value
        ? router.push({ name: routesPath.staff.directory.name, query: { from: 'setup' } })
        : router.push({ name: routesPath.staff.detail.name, params: { id: result.id } }));
    } catch (e) {
      serverError.value = getApiErrorMessage(
        e,
        'The server didn’t respond. Nothing was saved and your changes are still here. Try again.',
      );
    }
  };
  if (!clears.value.length && !cancelsInvite.value) return run();
  void confirm({
    title:
      cancelsInvite.value && !clears.value.length
        ? 'Cancel the invitation?'
        : `Save changes to ${detail.value!.name}?`,
    description: cancelsInvite.value
      ? `The link sent to ${detail.value!.user!.email} will stop working. Their staff record stays.`
      : 'Non-teaching staff can’t be assigned to classes, and teachers can only teach at their branches.',
    details: [
      ...clears.value,
      ...(cancelsInvite.value && clears.value.length
        ? ([['Invitation', `The link sent to ${detail.value!.user!.email} stops working`]] as [
            string,
            string,
          ][])
        : []),
    ],
    confirmLabel:
      cancelsInvite.value && !clears.value.length ? 'Cancel invitation' : 'Save changes',
    tone: 'destructive',
    action: run,
  });
});
</script>

<template>
  <template v-if="isPending"><Skeleton class="h-16 w-1/2" /><Skeleton class="h-96" /></template>

  <EmptyState
    v-else-if="!isNew && (isError || !detail)"
    illustrated
    title="This staff member doesn’t exist"
    description="The link may be wrong, or the record belongs to another school."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.staff.directory.name }"
        >Staff Directory</RouterLink
      ></Button
    >
  </EmptyState>

  <template v-else-if="detail && detail.status === 'Deactivated'">
    <PageHeader :title="`Edit ${detail.name}`" />
    <InlineNotice
      tone="neutral"
      title="Reactivate before editing"
      :description="`${detail.name} was deactivated${detail.leftOn ? ` in ${detail.leftOn}` : ''}. Reactivate the record from their profile to change it.`"
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: routesPath.staff.detail.name, params: { id: detail.id } }"
            >Open profile</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>
  </template>

  <form v-else-if="options" class="flex flex-col gap-4" novalidate @submit="onSubmit">
    <PageHeader
      :title="isNew ? 'Add staff member' : `Edit ${detail!.name}`"
      :description="
        isNew
          ? 'Everyone who works at the school. Teaching staff can be assigned to classes next.'
          : `${detail!.staffNumber} · changes apply from today.`
      "
    />
    <InlineNotice
      v-if="serverError"
      tone="error"
      title="We couldn’t save this staff member"
      :description="serverError"
      role="alert"
    />

    <SectionCard
      title="Personal details"
      :description="
        isYou ? 'This is you. Your sign-in details are managed from your profile.' : undefined
      "
    >
      <div class="grid gap-4 sm:grid-cols-[120px_1fr_1fr_180px]">
        <FormSelect name="title" label="Title" :options="TITLES" />
        <FormInput name="firstName" label="First name" required placeholder="e.g. Grace" />
        <FormInput name="lastName" label="Last name" required placeholder="e.g. Okafor" />
        <FormSelect name="gender" label="Gender" :options="GENDERS" />
      </div>
    </SectionCard>

    <SectionCard title="Contact">
      <div class="grid gap-4 sm:grid-cols-2">
        <FormInput
          name="phone"
          label="Phone"
          type="tel"
          inputmode="tel"
          placeholder="0803 555 0161"
          hint="Used for SMS and WhatsApp."
        />
        <FormInput
          name="email"
          label="Email"
          type="email"
          placeholder="name@school.ng"
          :required="!!values.access"
          :readonly="isYou"
          :hint="
            isYou
              ? 'Your sign-in email · change it from your profile'
              : values.access
                ? 'The invitation goes here.'
                : 'Optional without portal access.'
          "
        />
        <FormInput name="address" label="Home address" placeholder="e.g. 12 Allen Avenue, Ikeja" />
        <FormInput
          name="emergencyContact"
          label="Emergency contact"
          placeholder="e.g. Spouse · 0803 555 0144"
        />
      </div>
    </SectionCard>

    <SectionCard
      title="Employment"
      description="Position is the job title. It doesn’t control what they can do in Edutrack; that’s the role below."
    >
      <div class="flex flex-col gap-4">
        <ChoiceCards
          v-model="kind"
          label="Staff type"
          :columns="2"
          :choices="[
            {
              value: 'Teaching',
              label: 'Teaching',
              description: 'Can be assigned to teach subjects and be a class teacher',
            },
            {
              value: 'Non-teaching',
              label: 'Non-teaching',
              description: 'Office, finance, support or management staff',
            },
          ]"
        />
        <div class="grid gap-4 sm:grid-cols-2">
          <FormSelect name="position" label="Position" required :options="positions" />
          <FormSelect name="department" label="Department" :options="departments" />
          <FormSelect name="employment" label="Employment type" :options="EMPLOYMENT" />
          <FormInput name="since" label="Start date" type="date" placeholder="2026-09-14" />
        </div>
        <FieldShell
          id="staff-branches"
          label="Branches they work at"
          required
          :error="branchError"
          :hint="
            kind === 'Teaching' ? 'They can only be assigned classes at these branches.' : undefined
          "
        >
          <div id="staff-branches" class="flex flex-wrap gap-2" role="group">
            <button
              v-for="b in options.branches"
              :key="b.id"
              type="button"
              :aria-pressed="branchIds?.includes(b.id)"
              :class="chip(!!branchIds?.includes(b.id))"
              @click="branchIds = toggle(branchIds, b.id)"
            >
              <CheckIcon v-if="branchIds?.includes(b.id)" class="size-3.5" />{{ b.name }}
            </button>
          </div>
        </FieldShell>
      </div>
    </SectionCard>

    <SectionCard
      v-if="kind === 'Teaching'"
      title="Teaching"
      description="Teacher Assignments warns when a teacher takes a subject they aren’t listed for, or goes over their weekly periods."
    >
      <div class="flex flex-col gap-4">
        <FieldShell id="staff-subjects" label="Subjects they can teach">
          <div
            v-if="options.subjects.length"
            id="staff-subjects"
            class="flex flex-wrap gap-2"
            role="group"
          >
            <button
              v-for="s in options.subjects"
              :key="s.code"
              type="button"
              :aria-pressed="qualified?.includes(s.code)"
              :class="chip(!!qualified?.includes(s.code))"
              @click="qualified = toggle(qualified, s.code)"
            >
              <CheckIcon v-if="qualified?.includes(s.code)" class="size-3.5" />{{ s.name }}
            </button>
          </div>
          <p v-else class="text-[13px] text-muted-foreground">
            No subjects yet. Add them in
            <RouterLink
              :to="{ name: routesPath.academics.subjects.name }"
              class="text-primary underline"
              >Subjects &amp; Curriculum</RouterLink
            >, then list the subjects they can teach.
          </p>
        </FieldShell>
        <FormInput
          name="maxPeriods"
          label="Maximum periods per week"
          type="number"
          inputmode="numeric"
          placeholder="28"
          class="max-w-60"
          :hint="
            values.employment === 'Part-time'
              ? 'Part-time teachers usually take around 14.'
              : 'Full-time teachers usually take up to 28.'
          "
        />
      </div>
    </SectionCard>

    <SectionCard
      title="Portal access"
      description="Not every staff member needs an account. Drivers or cleaners can exist as records only."
    >
      <div class="flex flex-col gap-4">
        <label class="flex items-center gap-2.5 text-[13px]">
          <Switch v-model="access" :disabled="isYou" />
          Give {{ firstName }} access to Edutrack
        </label>
        <template v-if="access">
          <FieldShell id="staff-role" label="System role" required :error="roleError">
            <ChoiceCards
              v-if="!isYou"
              v-model="role"
              label="System role"
              :columns="2"
              :choices="roles"
            />
            <p v-else class="text-[13px] text-muted-foreground">
              Your roles are managed in Users &amp; Roles and can’t be changed here.
            </p>
          </FieldShell>
          <InlineNotice
            v-if="kind === 'Teaching' && role && role !== 'Teacher' && !isYou"
            tone="info"
            :title="`${role} can do more than a Teacher`"
            description="They’ll still see their own classes in the Teacher Workspace."
          />
          <p v-if="!isYou" class="text-[13px]">
            <span class="text-faint">Invitation</span> · {{ inviteLine }}
          </p>
        </template>
      </div>
    </SectionCard>

    <div class="sticky bottom-0 flex items-center gap-2.5 border-t bg-background py-3">
      <span class="text-xs" :class="meta.dirty ? 'text-warning-strong' : 'text-faint'">{{
        meta.dirty ? 'Unsaved changes' : 'No changes yet'
      }}</span>
      <Button type="button" variant="ghost" class="ml-auto" @click="back">Cancel</Button>
      <Button type="submit" :disabled="save.isPending.value">
        <Spinner v-if="save.isPending.value" />
        {{
          save.isPending.value
            ? 'Saving…'
            : !isNew
              ? 'Save changes'
              : access
                ? 'Add and send invitation'
                : 'Add staff member'
        }}
      </Button>
    </div>
  </form>
</template>
