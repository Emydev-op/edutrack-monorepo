<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { PencilIcon, Trash2Icon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { toast } from 'vue-sonner';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useDeleteSubjectMutation } from '@/api/services/academics';
import type { CurriculumView, Subject } from '@/types';

import SubjectDrawer from './SubjectDrawer.vue';

const props = defineProps<{ view: CurriculumView }>();
const emit = defineEmits<{ add: [] }>();
const confirm = useConfirm();
const remove = useDeleteSubjectMutation();
const search = ref('');
const editing = ref<Subject | null>(null);
const open = ref(false);

const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return props.view.subjects.filter(
    (s) =>
      !q || `${s.code} ${s.name} ${s.category} ${s.teachers.join(' ')}`.toLowerCase().includes(q),
  );
});
const unused = computed(() =>
  props.view.subjects.filter((s) => s.status === 'Active' && !s.levels.length),
);

/** "JSS 1–3", or a short list when levels aren't consecutive. */
function levelSummary(s: Subject) {
  if (!s.levels.length) return 'Not in any class yet';
  return props.view.levels
    .map(({ section, levels }) => {
      const on = levels.filter((l) => s.levels.includes(l));
      if (!on.length) return '';
      if (on.length === levels.length) return `All ${section}`;
      return on.length > 2 ? `${on[0]} – ${on[on.length - 1]} (${on.length})` : on.join(', ');
    })
    .filter(Boolean)
    .join(' · ');
}

function edit(s: Subject) {
  editing.value = s;
  open.value = true;
}
function del(s: Subject) {
  if (s.hasScores)
    return void toast.error(`${s.name} has results this session. Make it inactive instead.`);
  void confirm({
    title: `Delete ${s.name}?`,
    description: 'It is removed from every class curriculum and elective group.',
    details: [
      ['Classes', s.levels.join(', ') || 'None'],
      ['Teachers', s.teachers.join(', ') || 'None'],
    ],
    confirmLabel: 'Delete subject',
    tone: 'destructive',
    action: async () => {
      await remove.mutateAsync(s.code);
      toast.success(`${s.name} deleted.`);
    },
  });
}
const actions = (s: Subject): RowAction[] => [
  { label: 'Edit subject', icon: PencilIcon, onSelect: () => edit(s) },
  { label: 'Delete subject', icon: Trash2Icon, destructive: true, onSelect: () => del(s) },
];
const columns: Column[] = [
  { key: 'code', label: 'Code', width: '76px' },
  { key: 'name', label: 'Subject', width: 'minmax(180px,1.5fr)' },
  { key: 'category', label: 'Category', width: '120px' },
  { key: 'levels', label: 'Levels', width: 'minmax(170px,1.4fr)' },
  { key: 'teachers', label: 'Teachers', width: 'minmax(170px,1.4fr)' },
  { key: 'periods', label: 'Lessons / wk', align: 'right', width: '110px' },
  { key: 'status', label: 'Status', width: '100px' },
];
</script>

<template>
  <InlineNotice
    v-if="unused.length"
    tone="warning"
    :title="`${unused.length} subject${unused.length > 1 ? 's aren’t' : ' isn’t'} in any class yet`"
    :description="`${unused.map((s) => s.name).join(', ')}. Add them in Curriculum by class, or make them inactive.`"
  />
  <DataTable
    title="Subjects"
    description="The school’s subject list. Codes appear on timetables and report cards."
    :columns="columns"
    :rows="rows"
    :row-key="(s) => s.code"
    :row-label="(s) => s.name"
    :actions="actions"
    min-width="980px"
    :empty-text="
      view.subjects.length
        ? 'No subjects match your search.'
        : 'No subjects yet. Add them one by one.'
    "
  >
    <template #search><SearchInput v-model="search" placeholder="Search subjects" /></template>
    <template #toolbar>
      <Button variant="outline" size="sm" @click="emit('add')">Add subject</Button>
    </template>
    <template #cell-code="{ row }"
      ><span class="font-mono text-xs font-semibold">{{ row.code }}</span></template
    >
    <template #cell-name="{ row }"
      ><button type="button" class="text-left font-medium hover:text-primary" @click="edit(row)">
        {{ row.name }}
      </button></template
    >
    <template #cell-levels="{ row }">
      <span :class="!row.levels.length && 'text-warning-strong'">{{ levelSummary(row) }}</span>
    </template>
    <template #cell-teachers="{ row }">
      <span v-if="row.teachers.length">{{
        row.teachers.length > 2
          ? `${row.teachers.slice(0, 2).join(', ')} +${row.teachers.length - 2}`
          : row.teachers.join(', ')
      }}</span>
      <span v-else-if="row.levels.length" class="text-error-strong">No teacher</span>
      <span v-else class="text-faint">—</span>
    </template>
    <template #cell-status="{ row }"><StatusBadge :label="row.status" /></template>
  </DataTable>
  <SubjectDrawer v-model:open="open" :subject="editing" :subjects="view.subjects" />
</template>
