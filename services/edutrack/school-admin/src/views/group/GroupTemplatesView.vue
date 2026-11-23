<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { reactive } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  useApplyGroupTemplateMutation,
  useGroupTemplatesQuery,
  useSaveGroupTemplateMutation,
  type GroupTemplate,
} from '@/api/services/group';
import { useAuthStore } from '@/stores/auth';

/**
 * Group templates: save a member school's setup as the group's template, see which schools match
 * it, and apply it to the schools you pick. Each school keeps its own copy it can adjust.
 */
const auth = useAuthStore();
const confirm = useConfirm();
const { data, isPending, error } = useGroupTemplatesQuery();
const saveMut = useSaveGroupTemplateMutation();
const applyMut = useApplyGroupTemplateMutation();
const source = reactive<Record<string, string>>({});
const picked = reactive<Record<string, string[]>>({});

const tone = (s: string | null) =>
  s === 'Matches' ? 'success' : s === 'Differs' ? 'warning' : 'neutral';
const toggle = (key: string, id: string, on: boolean) => {
  const list = picked[key] ?? [];
  picked[key] = on ? [...list, id] : list.filter((x) => x !== id);
};

async function save(t: GroupTemplate) {
  const schoolId = source[t.key] ?? auth.school?.id;
  if (!schoolId) return;
  try {
    await saveMut.mutateAsync({ key: t.key, schoolId });
    toast.success(`${t.label} saved as the group template.`);
  } catch (e) {
    toast.error(getApiErrorMessage(e));
  }
}
function apply(t: GroupTemplate) {
  const ids = picked[t.key] ?? [];
  if (!ids.length) return;
  const differing = t.schools.filter((s) => ids.includes(s.schoolId) && s.status === 'Differs');
  confirm({
    title: `Apply ${t.label.toLowerCase()} to ${ids.length} school${ids.length > 1 ? 's' : ''}?`,
    description: differing.length
      ? `${differing.map((s) => s.school).join(', ')} ${differing.length > 1 ? 'have' : 'has'} adjusted ${differing.length > 1 ? 'their' : 'its'} own and will be overwritten. Each school can adjust its copy again afterwards.`
      : 'Each school gets its own copy it can still adjust.',
    confirmLabel: 'Apply',
    action: async () => {
      try {
        const r = await applyMut.mutateAsync({ key: t.key, schoolIds: ids });
        const done = r.results.filter((x) => x.applied).length;
        toast.success(`${t.label} applied to ${done} of ${r.results.length} schools.`);
        for (const x of r.results)
          if (!x.applied || x.notes.length) toast.info(`${x.school}: ${x.notes.join(' ')}`);
        picked[t.key] = [];
      } catch (e) {
        toast.error(getApiErrorMessage(e));
      }
    },
  });
}
</script>

<template>
  <Skeleton v-if="isPending" class="h-80" />
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="Group templates can’t be shown"
    :description="getApiErrorMessage(error)"
  />
  <template v-else-if="data">
    <PageHeader
      title="Shared templates"
      :description="`${data.group} · Set something up in one school, save it here, then apply it to the others.`"
    />
    <div class="grid items-start gap-5 lg:grid-cols-2">
      <SectionCard
        v-for="t in data.templates"
        :key="t.key"
        :title="t.label"
        :description="t.description"
      >
        <p class="text-[13px] text-muted-foreground">
          {{
            t.saved
              ? `Saved from ${t.saved.from ?? 'a school'} on ${new Date(t.saved.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`
              : 'Not saved yet.'
          }}
        </p>
        <div v-if="t.canEdit" class="mt-2 flex flex-wrap items-center gap-2">
          <select
            v-model="source[t.key]"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
            :aria-label="`School to save ${t.label} from`"
          >
            <option :value="undefined">From {{ auth.school?.name ?? 'this school' }}</option>
            <option v-for="s in t.schools" :key="s.schoolId" :value="s.schoolId">
              From {{ s.school }}
            </option>
          </select>
          <Button size="sm" variant="outline" :disabled="saveMut.isPending.value" @click="save(t)"
            >Save as template</Button
          >
        </div>
        <ul v-if="t.saved" class="mt-3 flex flex-col divide-y rounded-md border">
          <li
            v-for="s in t.schools"
            :key="s.schoolId"
            class="flex items-center justify-between gap-2 px-3 py-2 text-sm"
          >
            <label class="flex items-center gap-2">
              <Checkbox
                v-if="t.canEdit"
                :model-value="(picked[t.key] ?? []).includes(s.schoolId)"
                :aria-label="`Apply to ${s.school}`"
                @update:model-value="(v) => toggle(t.key, s.schoolId, v === true)"
              />
              {{ s.school }}
            </label>
            <StatusBadge :label="s.status ?? '—'" :tone="tone(s.status)" />
          </li>
        </ul>
        <div v-if="t.saved && t.canEdit" class="mt-3 flex justify-end">
          <Button
            size="sm"
            :disabled="!(picked[t.key] ?? []).length || applyMut.isPending.value"
            @click="apply(t)"
            >Apply to selected</Button
          >
        </div>
      </SectionCard>
    </div>
  </template>
</template>
