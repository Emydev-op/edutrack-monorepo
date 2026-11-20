<script setup lang="ts">
import { computed } from 'vue';

import { useMaterialsQuery } from '@/api/services/parent';
import ListRow from '@/components/common/ListRow.vue';
import ListSection from '@/components/common/ListSection.vue';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import { useCurrentChild } from '@/composables/useCurrentChild';
import { formatDay } from '@/lib/dates';

/** Notes and worksheets the child's teachers shared with the class this term. */
const { child, id } = useCurrentChild();
const q = useMaterialsQuery(id);
const list = computed(() => q.data.value?.materials ?? []);
</script>

<template>
  <PageTitle :title="`Materials · ${child?.firstName ?? ''}`" :sub="child?.className" />
  <QueryState
    v-if="!q.data.value"
    :loading="q.isPending.value"
    :error="q.error.value"
    @retry="q.refetch()"
  />
  <ListSection
    v-else
    title="Shared this term"
    :empty="list.length ? undefined : 'No materials shared with the class this term yet.'"
  >
    <ListRow
      v-for="m in list"
      :key="m.id"
      :title="m.file?.name ?? m.title"
      :sub="
        [
          m.subjectName,
          m.title !== m.file?.name && m.title,
          formatDay(m.publishedAt?.slice(0, 10), false),
        ]
          .filter(Boolean)
          .join(' · ')
      "
      :right="m.file?.url || m.link ? 'Open' : 'Unavailable'"
      :href="m.file?.url ?? m.link"
    />
  </ListSection>
</template>
