<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, ref } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import { useAssessmentQuery, useSaveAssessmentMutation } from '@/api/services/academics';
import SetupStepBar from '@/components/academics/SetupStepBar.vue';
import { routesPath } from '@/router/routes-path';

import { createAssessmentDraft } from './draft';

const route = useRoute();
const { data: view, isPending } = useAssessmentQuery();
const save = useSaveAssessmentMutation();
const d = createAssessmentDraft(view);
useUnsavedChanges(d.dirty);

const showErrors = ref(false);
const serverError = ref('');

const r = routesPath.academics;
const tabs = computed(() => [
  {
    label: 'Assessment scheme',
    to: { name: r.assessments.name, query: route.query },
    active: route.name === r.assessments.name,
  },
  {
    label: 'Grading scales',
    to: { name: r.grading.name, query: route.query },
    active: route.name === r.grading.name,
  },
]);

const stepDetails = computed<[string, string][]>(() =>
  d.keys.value.map((k) => {
    const s = d.draft.value?.schemes[k];
    return [
      d.label(k),
      !s
        ? 'Not set up'
        : s.mode === 'scores'
          ? `${s.components.map((c) => `${c.name} ${c.weight}%`).join(' · ')} · grades ${s.scale.map((g) => g.grade).join('/')}`
          : `Descriptive: ${s.ratings.map((x) => x.name).join(', ')}`,
    ];
  }),
);
const stepBlocked = computed(() => {
  if (d.dirty.value) return 'Save your changes first.';
  const missing = view.value?.missing ?? [];
  return missing.length ? `Set up a scheme for ${missing.join(', ')} first.` : '';
});

async function submit() {
  showErrors.value = true;
  serverError.value = '';
  if (d.errors.value.length) return;
  try {
    await save.mutateAsync(d.draft.value!);
    d.reset();
    showErrors.value = false;
    toast.success(
      view.value?.hasPublished
        ? 'Assessment scheme saved. Published results keep the scheme they were published with.'
        : 'Assessment scheme saved.',
    );
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'We couldn’t save the scheme. Try again.');
  }
}
</script>

<template>
  <PageHeader
    title="Assessments & Grading"
    description="Configured by your school. Teachers enter raw scores; the system applies weights and scales."
  />
  <SetupStepBar step="assessment-grading" :details="stepDetails" :blocked="stepBlocked" />
  <TabNav :tabs="tabs" label="Assessments and grading" />

  <Skeleton v-if="isPending || !d.draft.value" class="h-96" />
  <template v-else>
    <InlineNotice
      v-if="serverError"
      tone="error"
      title="Not saved"
      :description="serverError"
      role="alert"
    />
    <InlineNotice
      v-else-if="showErrors && d.errors.value.length"
      tone="error"
      :title="`Fix ${d.errors.value.length} problem${d.errors.value.length > 1 ? 's' : ''} before saving`"
      :description="d.errors.value.slice(0, 4).join(' ')"
      role="alert"
    />
    <RouterView />
    <div
      v-if="d.dirty.value"
      class="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm"
    >
      <span class="text-[13px] text-body">
        Unsaved changes{{ d.errors.value.length ? ` · ${d.errors.value.length} to fix` : ''
        }}{{ view?.hasPublished ? ' · published results are not recalculated' : '' }}
      </span>
      <div class="flex gap-2">
        <Button variant="outline" :disabled="save.isPending.value" @click="d.reset()"
          >Discard</Button
        >
        <Button :disabled="save.isPending.value" @click="submit">
          <Spinner v-if="save.isPending.value" />
          {{ save.isPending.value ? 'Saving…' : 'Save changes' }}
        </Button>
      </div>
    </div>
  </template>
</template>
