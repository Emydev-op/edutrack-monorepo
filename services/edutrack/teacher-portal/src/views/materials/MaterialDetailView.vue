<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { ArchiveIcon, ArchiveRestoreIcon, ExternalLinkIcon } from '@lucide/vue';
import { computed, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useMaterialActionMutation, useMaterialQuery } from '@/api/services/materials';
import { fileSize, when } from '@/components/assignments/assignment-format';
import AccessDenied from '@/components/common/AccessDenied.vue';
import { MATERIAL_ICON, materialSource } from '@/components/materials/material-format';
import { getApiErrorMessage, isForbidden, isNotFound } from '@/lib/api-errors';
import { routesPath as r } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

const route = useRoute();
const confirm = useConfirm();
const layout = useLayoutStore();
const id = computed(() => String(route.params.materialId ?? ''));
const { data: m, isPending, error, refetch } = useMaterialQuery(id);
const action = useMaterialActionMutation();
watch(m, (x) => layout.setRecordLabel(x?.title ?? null), { immediate: true });

const details = computed(() => {
  const x = m.value;
  if (!x) return [];
  return [
    { label: 'Class', value: `${x.classLabel} · ${x.branchName}` },
    { label: 'Type', value: x.type },
    x.link
      ? { label: 'Link', value: materialSource(x) }
      : { label: 'File', value: x.file ? `${x.file.name} (${fileSize(x.file.bytes)})` : '—' },
    { label: 'Shared', value: when(x.publishedAt) },
    ...(x.archivedAt ? [{ label: 'Archived', value: when(x.archivedAt) }] : []),
  ];
});

async function archive() {
  const x = m.value!;
  const linked = x.linkedAssignments.length;
  await confirm({
    title: 'Archive this material?',
    description: 'Students stop seeing it. You can restore it at any time.',
    details: [
      ['Class', x.classLabel],
      ['Students', `${x.students} stop seeing it`],
      [
        'Assignments',
        linked
          ? `${linked} assignment${linked === 1 ? '' : 's'} that attach it will show it as unavailable`
          : 'None attach it',
      ],
    ],
    confirmLabel: 'Archive',
    tone: 'destructive',
    action: async () => {
      await action.mutateAsync({ id: x.id, action: 'archive' });
      toast.success('Archived. Students no longer see it.');
    },
  });
}
async function restore() {
  const x = m.value!;
  await confirm({
    title: 'Restore this material?',
    description: `${x.classLabel} can see it again${x.linkedAssignments.length ? ', and assignments that attach it work again' : ''}.`,
    confirmLabel: 'Restore',
    action: async () => {
      await action.mutateAsync({ id: x.id, action: 'restore' });
      toast.success('Restored. Students can see it again.');
    },
  });
}
</script>

<template>
  <AccessDenied
    v-if="isForbidden(error)"
    what="this material"
    :reason="getApiErrorMessage(error)"
  />
  <EmptyState
    v-else-if="isNotFound(error)"
    title="Material not found"
    description="The link may be wrong."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: r.materials.list.name }">Back to materials</RouterLink></Button
    >
  </EmptyState>
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="The material couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Try again</Button></template
    >
  </InlineNotice>
  <template v-else-if="isPending || !m">
    <Skeleton class="h-16 w-full" />
    <Skeleton class="h-64 w-full" />
  </template>
  <template v-else>
    <PageHeader :title="m.title" :status="m.status" :description="m.classLabel">
      <template #actions>
        <Button v-if="m.link" as-child variant="outline">
          <a :href="m.link" target="_blank" rel="noopener noreferrer"
            ><ExternalLinkIcon class="size-4" /> Open link</a
          >
        </Button>
        <Button v-if="m.permissions.archive" variant="outline" @click="archive">
          <ArchiveIcon class="size-4" /> Archive
        </Button>
        <Button v-if="m.permissions.restore" @click="restore">
          <ArchiveRestoreIcon class="size-4" /> Restore
        </Button>
      </template>
    </PageHeader>

    <InlineNotice
      v-if="m.permissions.lockReason"
      tone="info"
      title="Read-only"
      :description="m.permissions.lockReason"
    />
    <InlineNotice
      v-else-if="m.status === 'Archived'"
      tone="neutral"
      title="Archived · students can’t see it"
      description="Restore it to share it with the class again."
    />

    <MetricGrid>
      <MetricCard label="Views" :value="m.views" hint="Times it was opened" />
      <MetricCard
        label="Students reached"
        :value="`${m.viewers} / ${m.students}`"
        :hint="m.lastViewedAt ? `Last opened ${when(m.lastViewedAt)}` : 'Not opened yet'"
      />
      <MetricCard label="In assignments" :value="m.linkedAssignments.length" />
    </MetricGrid>

    <div class="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 max-lg:grid-cols-1">
      <div class="flex min-w-0 flex-col gap-4">
        <SectionCard title="About">
          <div class="flex items-start gap-3">
            <component
              :is="MATERIAL_ICON[m.type]"
              class="mt-0.5 size-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div class="flex min-w-0 flex-col gap-1">
              <p v-if="m.description" class="text-[13px] text-pretty whitespace-pre-line">
                {{ m.description }}
              </p>
              <p v-else class="text-[13px] text-muted-foreground">No description.</p>
              <span class="truncate text-xs text-faint">{{ materialSource(m) }}</span>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Assignments that attach it">
          <p v-if="!m.linkedAssignments.length" class="text-[13px] text-muted-foreground">
            None yet. Attach it from an assignment’s form.
          </p>
          <ul v-else class="flex flex-col divide-y divide-divider">
            <li v-for="x in m.linkedAssignments" :key="x.id" class="flex items-center gap-2 py-2">
              <RouterLink
                :to="{ name: r.assignments.detail.name, params: { assignmentId: x.id } }"
                class="min-w-0 flex-1 truncate text-[13px] font-medium hover:underline"
                >{{ x.title }}</RouterLink
              >
              <span v-if="m.status === 'Archived'" class="text-xs text-warning-strong"
                >Shows as unavailable</span
              >
              <span class="text-xs text-faint">{{ x.status }}</span>
            </li>
          </ul>
        </SectionCard>
      </div>
      <div class="flex min-w-0 flex-col gap-4">
        <KeyValueCard title="Details" :rows="details" />
        <SectionCard><ActivityTimeline :items="m.history" title="History" /></SectionCard>
      </div>
    </div>
  </template>
</template>
