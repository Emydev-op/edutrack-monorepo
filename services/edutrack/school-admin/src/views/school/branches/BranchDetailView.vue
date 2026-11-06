<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  useBranchesQuery,
  useBranchQuery,
  useBranchStatusMutation,
  useDeleteBranchMutation,
} from '@/api/services/school';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const layout = useLayoutStore();
const id = computed(() => String(route.params.id));
const { data: branch, isPending, isError } = useBranchQuery(id);
const { data: list } = useBranchesQuery();
const status = useBranchStatusMutation(id);
const remove = useDeleteBranchMutation(id);
watch(branch, (b) => layout.setRecordLabel(b?.name ?? null), { immediate: true });

const { school: s } = routesPath;
const TABS = [
  ['Overview', s.branch.name],
  ['Classes', s.branchClasses.name],
  ['Staff', s.branchStaff.name],
  ['Finance', s.branchFinance.name],
  ['Activity', s.branchActivity.name],
] as const;
const tabs = computed(() =>
  TABS.map(([label, name]) => ({
    label,
    to: { name, params: { id: id.value } },
    active: route.name === name,
  })),
);

const activeCount = computed(
  () => list.value?.branches.filter((b) => b.status === 'Active').length ?? 0,
);

function deactivate() {
  const b = branch.value!;
  if (activeCount.value === 1)
    return void confirm({
      title: 'You can’t deactivate your only active branch',
      description:
        'A school needs at least one active branch for its classes, staff and students. Add or reactivate another branch first.',
      confirmLabel: 'OK',
    });
  if (b.students)
    return void confirm({
      title: `You can’t deactivate ${b.name} yet`,
      description: `${b.students} students are enrolled here for 2026/2027. Transfer them to another branch or end their enrollments first.`,
      details: [
        ['Students', `${b.students} active enrollments`],
        ['Staff', `${b.staff} assigned`],
      ],
      confirmLabel: 'View students',
      action: () => router.push({ name: routesPath.students.list.name }),
    });
  void confirm({
    title: `Deactivate ${b.name}?`,
    details: [
      [
        'What happens',
        'No new classes, enrollments, invoices or stock movements. Records stay visible.',
      ],
      [
        'Users',
        b.scopedUsers.length
          ? `${b.scopedUsers.length} user${b.scopedUsers.length > 1 ? 's are' : ' is'} scoped only to this branch and will lose access: ${b.scopedUsers.map((u) => u.name).join(', ')}`
          : 'No one loses access',
      ],
      ['Plan', `Still counts toward your ${list.value?.branchLimit ?? ''} branches`],
      ['Reversible', 'Yes. Reactivate any time.'],
    ],
    input: { label: 'Reason', placeholder: 'e.g. Campus closed for renovation', required: true },
    confirmLabel: 'Deactivate branch',
    tone: 'destructive',
    action: async ({ text }) => {
      await status.mutateAsync({ action: 'deactivate', reason: text });
      toast.success(`${b.name} deactivated.`);
    },
  });
}

function reactivate() {
  const b = branch.value!;
  void confirm({
    title: `Reactivate ${b.name}?`,
    details: [
      ['What happens', 'The branch can take classes, enrollments, invoices and stock again.'],
      ['Next', b.classArms ? 'Its classes are ready' : 'Set up classes before admitting students'],
    ],
    confirmLabel: 'Reactivate',
    action: async () => {
      await status.mutateAsync({ action: 'reactivate' });
      toast.success(`${b.name} is active again.`);
    },
  });
}

function destroy() {
  const b = branch.value!;
  void confirm({
    title: `Delete ${b.name}?`,
    description:
      'It has no classes, staff, students or transactions, so it can be removed completely. This frees one branch on your plan.',
    details: [['Reversible', 'No']],
    acknowledgement: 'I understand this can’t be undone',
    confirmLabel: 'Delete branch',
    tone: 'destructive',
    action: async () => {
      await remove.mutateAsync();
      toast.success(`${b.name} deleted.`);
      await router.push({ name: routesPath.school.branches.name });
    },
  });
}
</script>

<template>
  <template v-if="isPending"><Skeleton class="h-16 w-1/2" /><Skeleton class="h-72" /></template>

  <EmptyState
    v-else-if="isError || !branch"
    illustrated
    title="This branch doesn’t exist"
    description="It may have been deleted, or the link is wrong."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.school.branches.name }">All branches</RouterLink></Button
    >
  </EmptyState>

  <template v-else>
    <PageHeader
      :title="branch.name"
      :status="branch.status"
      :description="`${branch.code} · ${[branch.street, branch.city, branch.state].filter(Boolean).join(', ') || 'Address missing'}`"
    >
      <template #actions>
        <Button v-if="branch.canDelete" variant="outline" class="text-destructive" @click="destroy"
          >Delete</Button
        >
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: routesPath.school.branchEdit.name, params: { id: branch.id } }"
            >Edit branch</RouterLink
          ></Button
        >
        <Button
          v-if="branch.status === 'Active'"
          variant="outline"
          class="text-destructive"
          @click="deactivate"
          >Deactivate</Button
        >
        <Button v-else @click="reactivate">Reactivate</Button>
      </template>
    </PageHeader>
    <TabNav :tabs="tabs" label="Branch sections" />
    <RouterView v-slot="{ Component }">
      <component :is="Component" :branch="branch" @reactivate="reactivate" />
    </RouterView>
  </template>
</template>
