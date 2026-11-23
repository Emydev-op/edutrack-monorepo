<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorFields, getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import {
  useAdmissionOptionsQuery,
  useApplicationQuery,
  useCreateApplicationMutation,
  useUpdateApplicationMutation,
} from '@/api/services/students';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';
import type { AdmissionType, ApplicationInput, Gender } from '@/types';

import { todayIso } from './application-format';

/**
 * Records a family's application (or edits one that isn't admitted yet). Moving it through the
 * stages happens on the application's page.
 */
const route = useRoute();
const router = useRouter();
const layout = useLayoutStore();
const id = computed(() => (route.params.id as string | undefined) ?? '');
const isNew = computed(() => !id.value);

const { data: options, isPending: optionsPending } = useAdmissionOptionsQuery();
const { data: detail, isPending: detailPending, isError } = useApplicationQuery(id);
const create = useCreateApplicationMutation();
const update = useUpdateApplicationMutation();
const saving = computed(() => create.isPending.value || update.isPending.value);
const isPending = computed(() => optionsPending.value || (!isNew.value && detailPending.value));

watch(detail, (a) => layout.setRecordLabel(a ? `Edit ${a.applicant}` : null), {
  immediate: true,
});

const today = todayIso;
const blank = () => ({
  firstName: '',
  surname: '',
  otherNames: '',
  gender: '' as Gender | '',
  dateOfBirth: '',
  type: 'New intake' as AdmissionType,
  branch: '',
  level: '',
  guardianName: '',
  guardianPhone: '',
  guardianEmail: '',
  previousSchool: '',
  note: '',
  appliedOn: today(),
});
const f = reactive(blank());
const initial = ref(JSON.stringify(f));
const showErrors = ref(false);
const fields = ref<Record<string, string>>({});
const serverError = ref('');
const saved = ref(false);

const branches = computed(() => options.value?.branches ?? []);
const levelsFor = (branch: string) =>
  Object.keys(options.value?.armsByBranch?.[branch] ?? options.value?.arms ?? {});
const levels = computed(() => levelsFor(f.branch));

watch(
  [options, detail],
  () => {
    if (!options.value || (!isNew.value && !detail.value)) return;
    if (JSON.stringify(f) !== initial.value) return;
    const a = detail.value;
    Object.assign(
      f,
      a
        ? {
            firstName: a.firstName,
            surname: a.surname,
            otherNames: a.otherNames,
            gender: a.gender,
            dateOfBirth: a.dateOfBirth ?? '',
            type: a.type,
            branch: a.branch,
            level: a.level,
            guardianName: a.guardianName,
            guardianPhone: a.guardianPhone,
            guardianEmail: a.guardianEmail,
            previousSchool: a.previousSchool,
            note: a.note,
            appliedOn: a.appliedOn,
          }
        : { branch: branches.value.length === 1 ? branches.value[0]! : '' },
    );
    initial.value = JSON.stringify(f);
  },
  { immediate: true },
);

/* A class level that the new branch doesn't run is cleared. */
watch(
  () => f.branch,
  (b, old) => {
    if (old !== undefined && b !== old && f.level && !levelsFor(b).includes(f.level)) f.level = '';
  },
);

const dirty = computed(() => JSON.stringify(f) !== initial.value);
useUnsavedChanges(() => dirty.value && !saved.value);
watch(f, () => (fields.value = {}));

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const errors = computed(() => {
  const e: Record<string, string> = { ...fields.value };
  if (!f.firstName.trim()) e.firstName ??= 'Enter the first name';
  if (!f.surname.trim()) e.surname ??= 'Enter the surname';
  if (!f.branch) e.branch ??= 'Choose a branch';
  if (!f.level) e.level ??= 'Choose a class';
  if (!f.guardianName.trim()) e.guardianName ??= 'Enter the parent or guardian’s name';
  if (!f.guardianPhone.trim() && !f.guardianEmail.trim())
    e.guardianPhone ??= 'Enter a phone number or an email so the school can reach them';
  if (f.guardianEmail.trim() && !EMAIL.test(f.guardianEmail.trim()))
    e.guardianEmail ??= 'Enter a valid email';
  if (f.dateOfBirth && f.dateOfBirth > today())
    e.dateOfBirth ??= 'The date of birth can’t be in the future';
  if (f.appliedOn && f.appliedOn > today())
    e.appliedOn ??= 'The date applied can’t be in the future';
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);

const back = () =>
  isNew.value
    ? router.push({ name: routesPath.students.admissions.name })
    : router.push({ name: routesPath.students.application.name, params: { id: id.value } });

async function submit() {
  showErrors.value = true;
  serverError.value = '';
  if (Object.keys(errors.value).length) return;
  const payload: ApplicationInput = {
    firstName: f.firstName.trim(),
    surname: f.surname.trim(),
    otherNames: f.otherNames.trim(),
    gender: f.gender || null,
    dateOfBirth: f.dateOfBirth || null,
    type: f.type,
    branch: f.branch,
    level: f.level,
    guardianName: f.guardianName.trim(),
    guardianPhone: f.guardianPhone.trim(),
    guardianEmail: f.guardianEmail.trim(),
    previousSchool: f.previousSchool.trim(),
    note: f.note.trim(),
    appliedOn: f.appliedOn || undefined,
  };
  try {
    const result = isNew.value
      ? await create.mutateAsync(payload)
      : await update.mutateAsync({ ...payload, id: id.value });
    saved.value = true;
    toast.success(
      isNew.value
        ? `Application ${result.number} recorded for ${result.applicant}.`
        : 'Changes saved.',
    );
    await router.push({ name: routesPath.students.application.name, params: { id: result.id } });
  } catch (e) {
    const fe = getApiErrorFields(e);
    if (Object.keys(fe).length) {
      fields.value = fe;
      return;
    }
    serverError.value = getApiErrorMessage(
      e,
      'The server didn’t respond. Nothing was saved and your changes are still here. Try again.',
    );
  }
}

const genderChip = (on: boolean) =>
  cn(
    'flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px]',
    on ? 'border-primary bg-brand-subtle font-medium text-brand-strong' : 'bg-card hover:bg-muted',
  );
const selectClass = 'h-9 w-full rounded-md border bg-card px-2.5 text-sm';
</script>

<template>
  <template v-if="isPending"><Skeleton class="h-16 w-1/2" /><Skeleton class="h-96" /></template>

  <EmptyState
    v-else-if="!isNew && (isError || !detail)"
    illustrated
    title="This application doesn’t exist"
    description="The link may be wrong, or the application belongs to another school."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.students.admissions.name }"
        >Admissions</RouterLink
      ></Button
    >
  </EmptyState>

  <template v-else-if="detail && !detail.canEdit">
    <PageHeader :title="`Edit ${detail.applicant}`" />
    <InlineNotice
      tone="neutral"
      title="This application can’t be changed"
      :description="
        detail.studentId
          ? `${detail.applicant} has been admitted. Change their details on the student record.`
          : 'Its details are locked at this stage.'
      "
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink
            :to="{ name: routesPath.students.application.name, params: { id: detail.id } }"
            >Open application</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>
  </template>

  <form v-else-if="options" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
    <PageHeader
      :title="isNew ? 'New application' : `Edit ${detail!.applicant}`"
      :description="
        isNew
          ? `${options.session} · Record a family’s application. You can review it, send an offer and admit from its page.`
          : `${detail!.number} · ${detail!.stage}`
      "
    />
    <InlineNotice
      v-if="serverError"
      tone="error"
      title="We couldn’t save this application"
      :description="serverError"
      role="alert"
    />

    <SectionCard title="Applicant">
      <div class="flex flex-col gap-4">
        <div class="grid gap-4 sm:grid-cols-3">
          <FieldShell id="app-first" label="First name" required :error="err('firstName')">
            <Input
              id="app-first"
              v-model="f.firstName"
              placeholder="e.g. Kamsi"
              :aria-invalid="!!err('firstName')"
            />
          </FieldShell>
          <FieldShell id="app-surname" label="Surname" required :error="err('surname')">
            <Input
              id="app-surname"
              v-model="f.surname"
              placeholder="e.g. Nwosu"
              :aria-invalid="!!err('surname')"
            />
          </FieldShell>
          <FieldShell id="app-other" label="Other names" :error="err('otherNames')">
            <Input id="app-other" v-model="f.otherNames" placeholder="e.g. Chidinma" />
          </FieldShell>
        </div>
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="flex flex-col gap-1.5">
            <span class="text-[13px] font-medium">Gender</span>
            <div role="radiogroup" aria-label="Gender" class="flex gap-2">
              <button
                v-for="g in ['Female', 'Male'] as const"
                :key="g"
                type="button"
                role="radio"
                :aria-checked="f.gender === g"
                :class="genderChip(f.gender === g)"
                @click="f.gender = f.gender === g ? '' : g"
              >
                {{ g }}
              </button>
            </div>
          </div>
          <FieldShell id="app-dob" label="Date of birth" :error="err('dateOfBirth')">
            <Input
              id="app-dob"
              v-model="f.dateOfBirth"
              type="date"
              :max="today()"
              :aria-invalid="!!err('dateOfBirth')"
            />
          </FieldShell>
          <FieldShell id="app-prev" label="Previous school" :error="err('previousSchool')">
            <Input
              id="app-prev"
              v-model="f.previousSchool"
              placeholder="e.g. Little Angels School, Ikeja"
            />
          </FieldShell>
        </div>
      </div>
    </SectionCard>

    <SectionCard title="Applying for" :description="`${options.session} session`">
      <div class="flex flex-col gap-4">
        <ChoiceCards
          v-model="f.type"
          label="Application type"
          :columns="2"
          :choices="[
            {
              value: 'New intake',
              label: 'New intake',
              description: 'Starting school or joining at an entry class',
            },
            {
              value: 'Transfer in',
              label: 'Transfer in',
              description: 'Moving from another school',
            },
          ]"
        />
        <div class="grid gap-4 sm:grid-cols-2">
          <FieldShell id="app-branch" label="Branch" required :error="err('branch')">
            <select
              id="app-branch"
              v-model="f.branch"
              :class="selectClass"
              :aria-invalid="!!err('branch')"
            >
              <option value="">Choose…</option>
              <option v-for="b in branches" :key="b">{{ b }}</option>
            </select>
          </FieldShell>
          <FieldShell
            id="app-level"
            label="Class"
            required
            :error="err('level')"
            :hint="f.branch ? undefined : 'Choose a branch first'"
          >
            <select
              id="app-level"
              v-model="f.level"
              :class="selectClass"
              :disabled="!f.branch"
              :aria-invalid="!!err('level')"
            >
              <option value="">Choose…</option>
              <option v-for="l in levels" :key="l">{{ l }}</option>
            </select>
          </FieldShell>
        </div>
      </div>
    </SectionCard>

    <SectionCard
      title="Parent / Guardian"
      description="Who the school contacts about this application. A phone number or an email is needed."
    >
      <div class="grid gap-4 sm:grid-cols-3">
        <FieldShell id="app-gname" label="Full name" required :error="err('guardianName')">
          <Input
            id="app-gname"
            v-model="f.guardianName"
            placeholder="e.g. Mrs. Ada Nwosu"
            :aria-invalid="!!err('guardianName')"
          />
        </FieldShell>
        <FieldShell id="app-gphone" label="Phone" :error="err('guardianPhone')">
          <Input
            id="app-gphone"
            v-model="f.guardianPhone"
            type="tel"
            inputmode="tel"
            placeholder="0803 555 0193"
            :aria-invalid="!!err('guardianPhone')"
          />
        </FieldShell>
        <FieldShell id="app-gemail" label="Email" :error="err('guardianEmail')">
          <Input
            id="app-gemail"
            v-model="f.guardianEmail"
            type="email"
            placeholder="name@example.com"
            :aria-invalid="!!err('guardianEmail')"
          />
        </FieldShell>
      </div>
    </SectionCard>

    <SectionCard title="Notes">
      <div class="grid gap-4 sm:grid-cols-[1fr_200px]">
        <FieldShell
          id="app-note"
          label="Note"
          :error="err('note')"
          hint="For the admissions team, e.g. a sibling already in the school."
        >
          <Textarea
            id="app-note"
            v-model="f.note"
            rows="3"
            placeholder="e.g. Sister of David Nwosu (JSS 2B)"
          />
        </FieldShell>
        <FieldShell id="app-applied" label="Date applied" :error="err('appliedOn')">
          <Input
            id="app-applied"
            v-model="f.appliedOn"
            type="date"
            :max="today()"
            :aria-invalid="!!err('appliedOn')"
          />
        </FieldShell>
      </div>
    </SectionCard>

    <div class="sticky bottom-0 flex items-center gap-2.5 border-t bg-background py-3">
      <span class="text-xs" :class="dirty ? 'text-warning-strong' : 'text-faint'">{{
        dirty ? 'Unsaved changes' : 'No changes yet'
      }}</span>
      <Button type="button" variant="ghost" class="ml-auto" @click="back">Cancel</Button>
      <Button type="submit" :disabled="saving">
        <Spinner v-if="saving" />
        {{ saving ? 'Saving…' : isNew ? 'Record application' : 'Save changes' }}
      </Button>
    </div>
  </form>
</template>
