<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import CardGrid from '@edutrack/app-kit/components/common/CardGrid.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import { PLAN_LIMIT_LABEL } from '@/config/plans';
import { paletteName } from '@/lib/brand-color';
import { formatCount } from '@edutrack/app-kit/lib/format';
import { routesPath } from '@/router/routes-path';
import type { School } from '@/types';

import EditSchoolDrawer from '../../components/EditSchoolDrawer.vue';

const props = defineProps<{ school: School }>();
const editing = ref(false);

const onboarding = computed(
  () => props.school.status === 'Onboarding' && props.school.currentStep === 'Accept invitation',
);
</script>

<template>
  <InlineNotice
    v-if="onboarding"
    tone="info"
    title="Onboarding · invitation sent"
    :description="`An invitation was sent to ${school.admin.replace(' (invited)', '')}. Setup starts when they accept.`"
  >
    <template #action>
      <Button as-child variant="link" class="h-auto p-0">
        <RouterLink
          :to="{ name: routesPath.schools.administrators.name, params: { id: school.id } }"
          >View administrators</RouterLink
        >
      </Button>
    </template>
  </InlineNotice>
  <CardGrid>
    <KeyValueCard
      title="School"
      :rows="[
        { label: 'Legal name', value: school.legalName },
        { label: 'Category', value: school.type },
        { label: 'Location', value: `${school.state}, Nigeria` },
        { label: 'Contact', value: school.contactEmail },
        { label: 'Created', value: school.createdAt },
        ...(school.brandColor
          ? [
              {
                label: 'Brand color',
                value: `${paletteName(school.brandColor)} · ${school.brandColor.toUpperCase()}`,
              },
            ]
          : []),
      ]"
    >
      <template #action>
        <button
          type="button"
          class="text-[13px] font-medium text-primary hover:underline"
          @click="editing = true"
        >
          Edit
        </button>
      </template>
    </KeyValueCard>
    <KeyValueCard
      title="Onboarding"
      :status="school.setupProgress >= 100 ? 'Complete' : 'In progress'"
      :rows="[
        { label: 'Setup progress', value: `${school.setupProgress}%` },
        { label: 'Current step', value: school.currentStep },
        { label: 'Administrator', value: school.admin },
      ]"
    />
    <KeyValueCard
      title="Subscription"
      :status="school.status === 'Onboarding' ? 'Active' : school.status"
      :rows="[
        { label: 'Plan', value: school.plan },
        {
          label: 'Students',
          value: `${formatCount(school.students)} of ${PLAN_LIMIT_LABEL[school.plan].students}`,
        },
        { label: 'Renews', value: school.renews },
      ]"
    >
      <template #action>
        <RouterLink
          :to="{ name: routesPath.schools.subscription.name, params: { id: school.id } }"
          class="text-[13px] font-medium text-primary hover:underline"
        >
          Manage
        </RouterLink>
      </template>
    </KeyValueCard>
  </CardGrid>
  <EditSchoolDrawer v-model:open="editing" :school="school" />
</template>
