<script setup lang="ts">
import { NativeSelect, NativeSelectOption } from '@edutrack/ui/components/native-select';
import { computed } from 'vue';

import { useMyScopeQuery } from '@/api/services/shell';

/**
 * "All classes / JSS 2B · Mathematics / All Mathematics classes": filters a list by class and
 * subject. Emits both at once, so the page can write `?class=&subject=` in one navigation.
 */
const props = defineProps<{ armId: string; subject: string; label?: string }>();
const emit = defineEmits<{ change: [value: { armId: string; subject: string }] }>();

const { data: scope } = useMyScopeQuery();
const multi = computed(() => scope.value?.multiCampus ?? false);
const options = computed(() => {
  const list = scope.value?.assignments ?? [];
  const bySubject = new Map<string, { name: string; count: number }>();
  for (const a of list) {
    const s = bySubject.get(a.subject) ?? { name: a.subjectName, count: 0 };
    s.count++;
    bySubject.set(a.subject, s);
  }
  return [
    { value: '', label: 'All classes' },
    ...list.map((a) => ({
      value: `${a.armId}|${a.subject}`,
      label: `${a.armName}${multi.value ? ` (${a.branchName.replace(' Campus', '')})` : ''} · ${a.subjectName}`,
    })),
    ...[...bySubject.entries()]
      .filter(([, s]) => s.count > 1)
      .map(([code, s]) => ({ value: `|${code}`, label: `All ${s.name} classes` })),
  ];
});

const value = computed({
  get: () => (props.armId || props.subject ? `${props.armId}|${props.subject}` : ''),
  set: (v: string) => {
    const [a = '', s = ''] = v.split('|');
    emit('change', { armId: a, subject: s });
  },
});
</script>

<template>
  <NativeSelect
    v-model="value"
    class="h-9 max-w-72 text-[13px]"
    :aria-label="label ?? 'Class and subject'"
  >
    <NativeSelectOption v-for="o in options" :key="o.value" :value="o.value">{{
      o.label
    }}</NativeSelectOption>
  </NativeSelect>
</template>
