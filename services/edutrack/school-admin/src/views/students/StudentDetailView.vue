<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { initials } from '@edutrack/app-kit/lib/format';

import { useBoardingSettingsQuery } from '@/api/services/boarding';
import { useStudentPhotoMutation, useStudentQuery } from '@/api/services/students';
import { useCan } from '@/composables/useCan';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import { useLayoutStore } from '@/stores/layout';

const route = useRoute();
const layout = useLayoutStore();
const context = useContextStore();
const id = computed(() => String(route.params.id));
const { data: student, isPending, isError } = useStudentQuery(id);

/* The student's photo (e.g. the school's uniform portrait): on the record and the report card. */
const photoMut = useStudentPhotoMutation();
const photoInput = ref<HTMLInputElement | null>(null);
const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
async function savePhoto(photo: string | null) {
  try {
    await photoMut.mutateAsync({ id: id.value, photo });
    toast.success(photo ? 'Photo saved.' : 'Photo removed.');
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'We couldn’t save the photo. Try again.'));
  }
}
async function onPhotoPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!['image/jpeg', 'image/png'].includes(file.type))
    return void toast.error('Use a JPG or PNG image.');
  if (file.size > 2 * 1024 * 1024) return void toast.error('The photo is larger than 2 MB.');
  await savePhoto(await readAsDataUrl(file));
}
watch(student, (s) => layout.setRecordLabel(s?.name ?? null), { immediate: true });

const s = routesPath.students;
const can = useCan();
// Boarding shows once the school has switched it on in Boarding set-up.
const { data: boarding } = useBoardingSettingsQuery();
const tabs = computed(() =>
  (
    [
      ['Overview', s.detail.name],
      ['Academics', s.academics.name],
      ['Subjects', s.subjects.name],
      ['Fees', s.fees.name],
      ...(boarding.value?.enabled || route.name === s.boarding.name
        ? ([['Boarding', s.boarding.name]] as const)
        : []),
      ['Parents', s.guardians.name],
      ['Documents', s.documents.name],
      ['Activity', s.activity.name],
    ] as const
  ).map(([label, name]) => ({
    label,
    to: { name, params: { id: id.value } },
    active: route.name === name,
  })),
);
const enrolled = computed(
  () => !!student.value && ['Active', 'Incomplete profile'].includes(student.value.status),
);
</script>

<template>
  <template v-if="isPending"><Skeleton class="h-16 w-1/2" /><Skeleton class="h-80" /></template>

  <EmptyState
    v-else-if="isError || !student"
    illustrated
    title="This student doesn’t exist"
    description="The link may be wrong, or the record belongs to another school."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: s.list.name }">All students</RouterLink></Button
    >
  </EmptyState>

  <template v-else>
    <PageHeader
      :title="student.name"
      :initials="initials(student.name)"
      :avatar-src="student.photoUrl"
      :status="student.status"
      :description="`${student.admissionNo} · ${student.gender}${student.age ? ` · ${student.age} years` : ''}`"
      :meta="[
        { label: 'Session', value: context.current.session },
        { label: 'Class', value: student.className || 'Awaiting arm' },
        { label: 'Branch', value: student.branch },
      ]"
    >
      <template #actions>
        <template v-if="enrolled && can('students.edit')">
          <input
            ref="photoInput"
            type="file"
            accept="image/jpeg,image/png"
            class="hidden"
            @change="onPhotoPicked"
          />
          <Button
            variant="outline"
            :disabled="photoMut.isPending.value"
            @click="photoInput?.click()"
            >{{ student.photoUrl ? 'Change photo' : 'Add photo' }}</Button
          >
          <Button
            v-if="student.photoUrl"
            variant="ghost"
            :disabled="photoMut.isPending.value"
            @click="savePhoto(null)"
            >Remove photo</Button
          >
        </template>
        <Button v-if="can('comms.class')" as-child variant="outline"
          ><RouterLink :to="{ name: routesPath.communication.announcements.name }"
            >Message guardian</RouterLink
          ></Button
        >
        <Button
          v-if="enrolled && can('students.edit') && can('students.archive')"
          as-child
          variant="outline"
          ><RouterLink :to="{ name: s.transfer.name, params: { id: student.id } }"
            >Transfer / withdraw</RouterLink
          ></Button
        >
        <Button v-if="can('finance.payment')" as-child
          ><RouterLink :to="{ name: routesPath.finance.payments.name }"
            >Record payment</RouterLink
          ></Button
        >
      </template>
    </PageHeader>
    <TabNav :tabs="tabs" label="Student record" />
    <RouterView v-slot="{ Component }">
      <component :is="Component" :student="student" />
    </RouterView>
  </template>
</template>
