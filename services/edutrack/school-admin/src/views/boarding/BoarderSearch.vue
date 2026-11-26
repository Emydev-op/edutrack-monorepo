<script setup lang="ts">
import { refDebounced } from '@vueuse/core';
import { computed, ref } from 'vue';

import { useBoardersQuery } from '@/api/services/boarding';

import type { PickedStudent } from './house-format';
import SearchPickList from './SearchPickList.vue';

/** Finds a boarder by name or admission number (Boarding › Boarders list). */
defineProps<{ id: string; invalid?: boolean }>();
const selected = defineModel<PickedStudent | null>({ required: true });

const search = ref('');
const q = refDebounced(search, 300);
const { data, isFetching } = useBoardersQuery(() => ({ q: q.value.trim() || undefined }));
const items = computed<PickedStudent[]>(() =>
  (data.value?.boarders ?? []).slice(0, 8).map((b) => ({
    id: b.studentId,
    name: b.name,
    detail: [b.className, b.admissionNo, b.place?.hostel].filter(Boolean).join(' · '),
    branchId: b.branchId,
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
    placeholder="Search boarder’s name or admission number"
    empty-text="No boarder matches. Day students can’t be given an exeat."
  />
</template>
