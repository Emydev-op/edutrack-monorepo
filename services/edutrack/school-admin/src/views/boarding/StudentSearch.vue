<script setup lang="ts">
import { refDebounced } from '@vueuse/core';
import { computed, ref } from 'vue';

import { useStudentsQuery } from '@/api/services/students';

import type { PickedStudent } from './house-format';
import SearchPickList from './SearchPickList.vue';

/** Finds any student (boarder or day) by name or admission number, e.g. for the sick bay. */
defineProps<{ id: string; invalid?: boolean }>();
const selected = defineModel<PickedStudent | null>({ required: true });

const search = ref('');
const q = refDebounced(search, 300);
const { data, isFetching } = useStudentsQuery(() => ({
  search: q.value.trim() || undefined,
  pageSize: 8,
}));
const items = computed<PickedStudent[]>(() =>
  (data.value?.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    detail: [s.className, s.admissionNo, s.boarder ? 'Boarder' : 'Day student']
      .filter(Boolean)
      .join(' · '),
  })),
);
</script>

<template>
  <SearchPickList
    :id="id"
    v-model:search="search"
    v-model:selected="selected"
    :items="items"
    :loading="isFetching"
    :invalid="invalid"
    placeholder="Search student’s name or admission number"
  />
</template>
