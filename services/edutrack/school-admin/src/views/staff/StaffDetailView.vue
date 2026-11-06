<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { initials } from '@edutrack/app-kit/lib/format';

import {
  useDeactivateStaffMutation,
  useReactivateStaffMutation,
  useStaffMemberQuery,
} from '@/api/services/staff';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

const route = useRoute();
const layout = useLayoutStore();
const confirm = useConfirm();
const id = computed(() => String(route.params.id));
const { data: staff, isPending, isError } = useStaffMemberQuery(id);
const deactivate = useDeactivateStaffMutation();
const reactivate = useReactivateStaffMutation();
watch(staff, (s) => layout.setRecordLabel(s?.name ?? null), { immediate: true });

const s = routesPath.staff;
const tabs = computed(() =>
  (
    [
      ['Overview', s.detail.name],
      ...(staff.value?.kind === 'Teaching' ? [['Teaching', s.teaching.name] as const] : []),
      ['System access', s.access.name],
      ['Documents', s.documents.name],
      ['Activity', s.activity.name],
    ] as const
  ).map(([label, name]) => ({
    label,
    to: { name, params: { id: id.value } },
    active: route.name === name,
  })),
);
const name = (n: string) => n.replace(/^(Mr|Mrs|Miss|Ms|Dr|Prof|Mme)\.?\s+/, '');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function askDeactivate() {
  const st = staff.value!;
  const load = st.teaching?.assignments.length ?? 0;
  const classes = st.teaching?.classTeacherOf.length ?? 0;
  void confirm({
    title: `Deactivate ${st.name}?`,
    details: [
      [
        'What happens',
        'Sign-in is removed and they are taken off future timetables. Past results, approvals and payroll history stay attributed to them.',
      ],
      [
        'Teaching load',
        load || classes
          ? [
              load && `${plural(load, 'teacher assignment')} need a replacement`,
              classes &&
                `class teacher of ${st.teaching!.classTeacherOf.map((c) => c.name).join(', ')}`,
            ]
              .filter(Boolean)
              .join(' · ')
          : 'None',
      ],
      ['Reversible', 'Yes. Reactivating restores the record; access is granted again separately.'],
    ],
    ...(load && { acknowledgement: 'I have arranged cover for their classes' }),
    confirmLabel: 'Deactivate',
    tone: 'destructive',
    action: async () => {
      const r = await deactivate.mutateAsync({ id: st.id, coverArranged: !!load });
      toast.success(
        [
          `${st.name} deactivated.`,
          r.cleared.removed &&
            `${plural(r.cleared.removed, 'assignment')} now need a teacher in Teacher Assignments.`,
        ]
          .filter(Boolean)
          .join(' '),
      );
    },
  });
}

function askReactivate() {
  const st = staff.value!;
  void confirm({
    title: `Reactivate ${st.name}?`,
    description:
      'Reactivation restores the record; access must be granted again from Users & Roles.',
    confirmLabel: 'Reactivate',
    action: async () => {
      await reactivate.mutateAsync(st.id);
      toast.success(`${st.name} reactivated.`);
    },
  });
}
</script>

<template>
  <template v-if="isPending"><Skeleton class="h-16 w-1/2" /><Skeleton class="h-80" /></template>

  <EmptyState
    v-else-if="isError || !staff"
    illustrated
    title="This staff member doesn’t exist"
    description="The link may be wrong, or the record belongs to another school."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: s.directory.name }">Staff Directory</RouterLink></Button
    >
  </EmptyState>

  <template v-else>
    <PageHeader
      :title="staff.name"
      :initials="initials(name(staff.name))"
      :status="staff.status"
      :description="`${staff.position} · ${staff.staffNumber}${staff.isYou ? ' · you' : ''}`"
      :meta="[
        { label: 'Department', value: staff.department || '—' },
        { label: 'Branch', value: staff.branch || '—' },
        { label: 'Employment', value: staff.employment },
      ]"
    >
      <template #actions>
        <template v-if="staff.status === 'Deactivated'">
          <Button @click="askReactivate">Reactivate</Button>
        </template>
        <template v-else>
          <Button as-child variant="outline"
            ><RouterLink :to="{ name: s.edit.name, params: { id: staff.id } }"
              >Edit</RouterLink
            ></Button
          >
          <Button v-if="!staff.isYou" variant="outline" @click="askDeactivate">Deactivate</Button>
        </template>
      </template>
    </PageHeader>
    <TabNav :tabs="tabs" label="Staff record" />
    <RouterView v-slot="{ Component }">
      <component :is="Component" :staff="staff" />
    </RouterView>
  </template>
</template>
