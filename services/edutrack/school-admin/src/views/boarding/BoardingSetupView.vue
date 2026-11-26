<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Switch } from '@edutrack/ui/components/switch';
import { getApiErrorFields, getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';
import { pluralize } from '@edutrack/app-kit/lib/format';

import { useBoardingSettingsQuery, useSaveBoardingSettingsMutation } from '@/api/services/boarding';
import { routesPath } from '@/router/routes-path';
import type { BoardingCampus, BoardingSectionSetting, BoardingSettingsPayload } from '@/types';

import { boardingSummary } from './boarding-format';

/**
 * Boarding set-up: which sections take boarders at each campus, and, within a section, whether
 * every class boards or only some (e.g. Primary 4–6). Hostels are set up for these classes.
 */
const { data, isPending, isError, refetch } = useBoardingSettingsQuery();
const save = useSaveBoardingSettingsMutation();

type Draft = Record<string, Record<string, { boarding: boolean; levelIds: string[] }>>;
const draft = ref<Draft>({});
const fromData = (campuses: BoardingCampus[]): Draft =>
  Object.fromEntries(
    campuses.map((c) => [
      c.branchId,
      Object.fromEntries(
        c.sections.map((s) => [s.sectionId, { boarding: s.boarding, levelIds: [...s.levelIds] }]),
      ),
    ]),
  );
watch(
  () => data.value?.campuses,
  (c) => c && (draft.value = fromData(c)),
  { immediate: true },
);

const entry = (c: BoardingCampus, s: BoardingSectionSetting) =>
  draft.value[c.branchId]?.[s.sectionId] ?? { boarding: false, levelIds: [] };

/** Every class picked is the same as "All classes". */
const normalise = (s: BoardingSectionSetting, ids: string[]) =>
  ids.length >= s.levels.length ? [] : s.levels.map((l) => l.id).filter((id) => ids.includes(id));

function setBoarding(c: BoardingCampus, s: BoardingSectionSetting, on: boolean) {
  const e = entry(c, s);
  draft.value[c.branchId]![s.sectionId] = { boarding: on, levelIds: on ? e.levelIds : [] };
  serverError.value = '';
}
function toggleLevel(c: BoardingCampus, s: BoardingSectionSetting, id: string) {
  const e = entry(c, s);
  const ids = e.levelIds.includes(id) ? e.levelIds.filter((x) => x !== id) : [...e.levelIds, id];
  draft.value[c.branchId]![s.sectionId] = { boarding: true, levelIds: normalise(s, ids) };
  serverError.value = '';
}
function allLevels(c: BoardingCampus, s: BoardingSectionSetting) {
  draft.value[c.branchId]![s.sectionId] = { boarding: true, levelIds: [] };
}

/** The settings as they'd be saved, for the live summary. */
const preview = computed(() =>
  (data.value?.campuses ?? []).map((c) => ({
    ...c,
    sections: c.sections.map((s) => ({ ...s, ...entry(c, s) })),
  })),
);
const summary = computed(() => boardingSummary({ campuses: preview.value }));
const anyBoarding = computed(() => preview.value.some((c) => c.sections.some((s) => s.boarding)));
const dirty = computed(
  () =>
    !!data.value && JSON.stringify(draft.value) !== JSON.stringify(fromData(data.value.campuses)),
);
useUnsavedChanges(() => dirty.value);

const serverError = ref('');
async function submit() {
  serverError.value = '';
  const payload: BoardingSettingsPayload = {
    campuses: preview.value.map((c) => ({
      branchId: c.branchId,
      sections: c.sections.map((s) => ({
        sectionId: s.sectionId,
        boarding: s.boarding,
        ...(s.boarding ? { levelIds: s.levelIds } : {}),
      })),
    })),
  };
  try {
    const result = await save.mutateAsync(payload);
    draft.value = fromData(result.campuses);
    toast.success(messageOf(result, 'Boarding set-up saved.'));
  } catch (e) {
    const fields = getApiErrorFields(e);
    serverError.value =
      fields.campuses ?? getApiErrorMessage(e, 'Boarding set-up didn’t save. Try again.');
  }
}
const reset = () => data.value && (draft.value = fromData(data.value.campuses));

const boardingCount = (c: BoardingCampus) => c.sections.filter((s) => entry(c, s).boarding).length;
</script>

<template>
  <PageHeader
    title="Boarding set-up"
    description="Choose which sections take boarders at each campus, and which classes in them. Hostels are then set up for those classes."
  >
    <template #actions>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.boarding.hostels.name }">Hostels</RouterLink></Button
      >
    </template>
  </PageHeader>

  <Skeleton v-if="isPending" class="h-80" />
  <InlineNotice
    v-else-if="isError || !data"
    tone="error"
    title="Boarding set-up couldn’t load"
    description="Check your connection and try again."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>
  <EmptyState
    v-else-if="!data.campuses.length"
    illustrated
    title="Add a campus first"
    description="Boarding is switched on per section at each campus. Add your campuses and their sections, then come back here."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.school.branches.name }"
        >Go to Branches</RouterLink
      ></Button
    >
  </EmptyState>
  <template v-else>
    <EmptyState
      v-if="!anyBoarding"
      title="Does your school take boarders?"
      description="Switch on “Takes boarders” for each section that has boarding students, at each campus. You can limit it to some classes, e.g. only Primary 4–6. Once saved, Boarding appears in the sidebar and you can set up hostels, floors and rooms."
    />
    <InlineNotice v-else tone="info" title="Boarding" :description="summary" aria-live="polite" />

    <div class="grid gap-3 lg:grid-cols-2">
      <SectionCard
        v-for="c in data.campuses"
        :key="c.branchId"
        :title="c.name"
        :description="
          c.sections.length
            ? boardingCount(c)
              ? `${pluralize(boardingCount(c), 'section')} take boarders`
              : 'No boarders'
            : 'No sections at this campus yet'
        "
      >
        <ul class="flex flex-col divide-y divide-divider">
          <li v-for="s in c.sections" :key="s.sectionId" class="flex flex-col gap-2 py-2.5">
            <div class="flex items-center justify-between gap-3">
              <label :for="`board-${c.branchId}-${s.sectionId}`" class="text-sm font-medium">{{
                s.name
              }}</label>
              <span class="flex items-center gap-2 text-xs text-muted-foreground">
                Takes boarders
                <Switch
                  :id="`board-${c.branchId}-${s.sectionId}`"
                  :model-value="entry(c, s).boarding"
                  :aria-label="`${s.name} at ${c.name} takes boarders`"
                  @update:model-value="(v: boolean) => setBoarding(c, s, v)"
                />
              </span>
            </div>
            <div
              v-if="entry(c, s).boarding"
              class="flex flex-wrap gap-1.5"
              role="group"
              :aria-label="`Boarding classes in ${s.name}`"
            >
              <button
                type="button"
                class="rounded-full border px-2.5 py-0.5 text-xs"
                :class="
                  !entry(c, s).levelIds.length
                    ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
                    : 'bg-card hover:border-primary'
                "
                :aria-pressed="!entry(c, s).levelIds.length"
                @click="allLevels(c, s)"
              >
                All classes
              </button>
              <button
                v-for="l in s.levels"
                :key="l.id"
                type="button"
                class="rounded-full border px-2.5 py-0.5 text-xs"
                :class="
                  entry(c, s).levelIds.includes(l.id)
                    ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
                    : 'bg-card hover:border-primary'
                "
                :aria-pressed="entry(c, s).levelIds.includes(l.id)"
                @click="toggleLevel(c, s, l.id)"
              >
                {{ l.name }}
              </button>
              <span v-if="!s.levels.length" class="text-xs text-faint"
                >No classes in this section yet. All its classes will board.</span
              >
            </div>
          </li>
        </ul>
        <p v-if="!c.sections.length" class="text-xs text-muted-foreground">
          Add sections to this campus in Branches first.
        </p>
      </SectionCard>
    </div>

    <InlineNotice
      v-if="serverError"
      tone="error"
      title="Not saved"
      :description="serverError"
      role="alert"
    />
    <div class="flex flex-wrap justify-end gap-2">
      <Button v-if="dirty" variant="outline" @click="reset">Discard changes</Button>
      <Button :disabled="!dirty || save.isPending.value" @click="submit"
        ><Spinner v-if="save.isPending.value" />Save boarding set-up</Button
      >
    </div>
  </template>
</template>
