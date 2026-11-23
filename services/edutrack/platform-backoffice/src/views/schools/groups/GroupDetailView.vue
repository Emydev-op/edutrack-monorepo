<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  GROUP_ROLES,
  useAddGroupStaffMutation,
  useGroupQuery,
  useGroupSchoolMutation,
  useGroupStaffMutation,
  type GroupRole,
} from '@/api/services/groups';
import { useSchoolsQuery } from '@/api/services/schools';
import { routesPath } from '@/router/routes-path';

import GroupBillingCard from './GroupBillingCard.vue';

/**
 * One school group: its schools (each in one group at most) and its staff (Group owner, finance or
 * academic), who get an account in every school of the group. New staff are invited by email.
 */
const route = useRoute();
const confirm = useConfirm();
const id = computed(() => String(route.params.id));
const { data: group, isPending, error } = useGroupQuery(id);
const search = ref('');
const { data: schools } = useSchoolsQuery(() => ({ search: search.value, page: 1, pageSize: 20 }));
const schoolMut = useGroupSchoolMutation(id);
const addStaff = useAddGroupStaffMutation(id);
const staffMut = useGroupStaffMutation(id);
const pick = ref('');
const staff = reactive({ name: '', email: '', role: 'Group owner' as GroupRole });
const candidates = computed(
  () => schools.value?.data.filter((s) => !group.value?.schools.some((g) => g.id === s.id)) ?? [],
);
watch(candidates, (c) => {
  if (!c.some((s) => s.id === pick.value)) pick.value = '';
});

async function run<T>(work: Promise<T>, done: string) {
  try {
    await work;
    toast.success(done);
    return true;
  } catch (e) {
    toast.error(getApiErrorMessage(e));
    return false;
  }
}
async function addSchool() {
  if (pick.value) await run(schoolMut.mutateAsync({ schoolId: pick.value }), 'School added.');
}
const removeSchool = (s: { id: string; name: string }) =>
  confirm({
    title: `Remove ${s.name} from the group?`,
    description: 'Group staff lose their accounts there. The school’s own users are unaffected.',
    confirmLabel: 'Remove school',
    tone: 'destructive',
    action: () => run(schoolMut.mutateAsync({ schoolId: s.id, remove: true }), 'School removed.'),
  });
async function invite() {
  const ok = await run(addStaff.mutateAsync({ ...staff }), `${staff.name} added to the group.`);
  if (ok) Object.assign(staff, { name: '', email: '', role: 'Group owner' });
}
const removeStaff = (s: { id: string; name: string }) =>
  confirm({
    title: `Remove ${s.name} from the group?`,
    description: 'Their accounts in the group’s schools are deactivated.',
    confirmLabel: 'Remove',
    tone: 'destructive',
    action: () => run(staffMut.mutateAsync({ staffId: s.id }), `${s.name} removed.`),
  });
</script>

<template>
  <Skeleton v-if="isPending" class="h-64" />
  <p v-else-if="error" class="text-sm text-destructive">{{ getApiErrorMessage(error) }}</p>
  <template v-else-if="group">
    <PageHeader
      :title="group.name"
      :description="`${group.schools.length} school${group.schools.length === 1 ? '' : 's'} · ${group.staff.length} group staff`"
    />
    <div class="grid items-start gap-5 lg:grid-cols-2">
      <SectionCard title="Schools" description="A school can be in one group at a time.">
        <ul class="flex flex-col divide-y rounded-md border">
          <li
            v-for="s in group.schools"
            :key="s.id"
            class="flex items-center justify-between gap-2 px-3 py-2"
          >
            <RouterLink
              :to="{ name: routesPath.schools.detail.name, params: { id: s.id } }"
              class="flex flex-col hover:underline"
            >
              <span class="font-medium">{{ s.name }}</span>
              <span class="text-xs text-muted-foreground">{{ s.plan ?? 'No plan' }}</span>
            </RouterLink>
            <Button size="sm" variant="ghost" @click="removeSchool(s)">Remove</Button>
          </li>
          <li v-if="!group.schools.length" class="px-3 py-3 text-sm text-muted-foreground">
            No schools yet.
          </li>
        </ul>
        <div class="mt-3 flex flex-col gap-2">
          <Input v-model="search" placeholder="Search schools to add" aria-label="Search schools" />
          <div class="flex gap-2">
            <select
              v-model="pick"
              class="h-9 flex-1 rounded-md border bg-card px-2.5 text-sm"
              aria-label="School to add"
            >
              <option value="">Choose a school</option>
              <option v-for="s in candidates" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <Button :disabled="!pick || schoolMut.isPending.value" @click="addSchool"
              >Add school</Button
            >
          </div>
        </div>
      </SectionCard>
      <SectionCard
        title="Group staff"
        description="Group owner runs every school; Group finance works as bursar and Group academic as academic head across them."
      >
        <ul class="flex flex-col divide-y rounded-md border">
          <li
            v-for="s in group.staff"
            :key="s.id"
            class="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
          >
            <span class="flex flex-col">
              <span class="font-medium"
                >{{ s.name }} <StatusBadge :label="s.status" class="ml-1"
              /></span>
              <span class="text-xs text-muted-foreground">{{ s.email }}</span>
            </span>
            <span class="flex items-center gap-2">
              <select
                :value="s.role"
                class="h-8 rounded-md border bg-card px-2 text-sm"
                :aria-label="`${s.name}’s group role`"
                @change="
                  run(
                    staffMut.mutateAsync({
                      staffId: s.id,
                      role: ($event.target as HTMLSelectElement).value as GroupRole,
                    }),
                    'Group role changed.',
                  )
                "
              >
                <option v-for="r in GROUP_ROLES" :key="r">{{ r }}</option>
              </select>
              <Button size="sm" variant="ghost" @click="removeStaff(s)">Remove</Button>
            </span>
          </li>
          <li v-if="!group.staff.length" class="px-3 py-3 text-sm text-muted-foreground">
            No group staff yet.
          </li>
        </ul>
        <form class="mt-3 grid gap-2 sm:grid-cols-2" @submit.prevent="invite">
          <Input v-model="staff.name" placeholder="Full name" aria-label="Full name" />
          <Input v-model="staff.email" type="email" placeholder="Email" aria-label="Email" />
          <select
            v-model="staff.role"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
            aria-label="Group role"
          >
            <option v-for="r in GROUP_ROLES" :key="r">{{ r }}</option>
          </select>
          <Button type="submit" :disabled="addStaff.isPending.value">Add and invite</Button>
        </form>
      </SectionCard>
      <GroupBillingCard :group-id="group.id" class="lg:col-span-2" />
    </div>
  </template>
</template>
