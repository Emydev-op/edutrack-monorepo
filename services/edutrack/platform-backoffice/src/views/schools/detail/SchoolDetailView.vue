<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import { useSchoolQuery, useStartSupportSessionMutation } from '@/api/services/schools';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { formatCount } from '@edutrack/app-kit/lib/format';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

import { useSchoolActions } from '../components/useSchoolActions';

const route = useRoute();
const id = computed(() => String(route.params.id));
const { data: school, isPending, isError } = useSchoolQuery(id);
const layout = useLayoutStore();
const confirm = useConfirm();
const { suspend, reactivate } = useSchoolActions();
const supportSession = useStartSupportSessionMutation(id);

watch(school, (s) => layout.setRecordLabel(s?.name ?? null), { immediate: true });

const { schools: r } = routesPath;
const tabs = computed(() =>
  [
    ['Overview', r.detail.name],
    ['Subscription', r.subscription.name],
    ['Administrators', r.administrators.name],
    ['Usage', r.usage.name],
    ['Billing', r.billing.name],
    ['Activity', r.activity.name],
    ['Audit', r.audit.name],
  ].map(([label, name]) => ({
    label: label!,
    to: { name, params: { id: id.value } },
    active: route.name === name,
  })),
);

function startSupportSession() {
  if (!school.value) return;
  void confirm({
    title: `Start a support session in ${school.value.name}?`,
    description:
      "This is a privileged action. The school's administrators are notified and everything you do is logged against your name.",
    details: [
      ['Access', 'Read-only · ends after 30 minutes'],
      ['Approved by', 'Support lead · Ngozi Okafor'],
      ['Audit', 'Session start, every page and every change are recorded'],
    ],
    input: {
      label: 'Reason',
      placeholder: 'e.g. SUP-1182: checking result approval state',
      required: true,
    },
    acknowledgement: "I have the school's consent for this session",
    confirmLabel: 'Start audited session',
    action: async ({ text }) => {
      await supportSession.mutateAsync(text);
      toast.success(`Support session started in ${school.value?.name}. It ends in 30 minutes.`);
    },
  });
}
</script>

<template>
  <template v-if="isPending">
    <Skeleton class="h-16 w-1/2" />
    <Skeleton class="h-64 w-full" />
  </template>

  <EmptyState
    v-else-if="isError || !school"
    title="School not found"
    description="It may have been removed, or the link is incomplete."
    illustrated
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: r.list.name }">Back to schools</RouterLink></Button
    >
  </EmptyState>

  <template v-else>
    <PageHeader
      :title="school.name"
      :status="school.status"
      :description="`${school.type} · ${school.state} · ${school.subdomain}`"
      :meta="[
        { label: 'Plan', value: school.plan },
        { label: 'Students', value: formatCount(school.students) },
        { label: 'Branches', value: String(school.branches) },
      ]"
    >
      <template #actions>
        <Button as-child variant="outline">
          <RouterLink :to="{ name: routesPath.support.create.name, query: { school: school.id } }"
            >Create issue</RouterLink
          >
        </Button>
        <Button variant="outline" @click="startSupportSession">Log in as school</Button>
        <Button v-if="school.status === 'Suspended'" @click="reactivate(school)">Reactivate</Button>
        <Button v-else variant="destructive-outline" @click="suspend([school])">Suspend</Button>
      </template>
    </PageHeader>
    <TabNav :tabs="tabs" label="School sections" />
    <InlineNotice
      v-if="school.status === 'Suspended'"
      tone="error"
      title="Suspended"
      description="Staff, parents and students cannot sign in. Data is preserved."
    >
      <template #action
        ><Button variant="outline" size="sm" @click="reactivate(school)"
          >Reactivate</Button
        ></template
      >
    </InlineNotice>
    <RouterView v-slot="{ Component }">
      <component :is="Component" :school="school" />
    </RouterView>
  </template>
</template>
