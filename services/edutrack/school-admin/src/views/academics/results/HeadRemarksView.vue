<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Textarea } from '@edutrack/ui/components/textarea';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import { useHeadRemarksQuery, useSaveHeadRemarksMutation } from '@/api/services/academics';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

/**
 * The Principal's (head teacher's) comments for a whole class on one screen: each student's
 * average and the class teacher's remark beside a box for the comment. Saved together; read-only
 * once the class is published.
 */
const route = useRoute();
const layout = useLayoutStore();
const armId = computed(() => String(route.params.armId));
const { data, isPending, error } = useHeadRemarksQuery(armId);
const save = useSaveHeadRemarksMutation();
const MAX = 400;

const drafts = ref<Record<string, string>>({});
const saved = ref<Record<string, string>>({});
watch(
  data,
  (d) => {
    if (!d) return;
    const now = Object.fromEntries(d.students.map((s) => [s.studentId, s.headRemark ?? '']));
    drafts.value = { ...now };
    saved.value = now;
    layout.setRecordLabel(`${d.label}’s remarks · ${d.arm}`);
  },
  { immediate: true },
);
const changed = computed(() =>
  Object.keys(drafts.value).filter((id) => drafts.value[id]!.trim() !== saved.value[id]!.trim()),
);
const written = computed(() => Object.values(drafts.value).filter((v) => v.trim()).length);
useUnsavedChanges(() => changed.value.length > 0);

async function saveAll() {
  if (!data.value || !changed.value.length) return;
  try {
    const res = await save.mutateAsync({
      armId: armId.value,
      remarks: Object.fromEntries(changed.value.map((id) => [id, drafts.value[id]!])),
    });
    toast.success(
      res.saved ? `${res.saved} comment${res.saved > 1 ? 's' : ''} saved.` : 'No changes to save.',
    );
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'The comments weren’t saved. Try again.'));
  }
}
</script>

<template>
  <Skeleton v-if="isPending" class="h-96" />
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="This class can’t be shown"
    :description="getApiErrorMessage(error)"
  />
  <template v-else-if="data">
    <PageHeader
      :title="`${data.label}’s remarks`"
      :description="`${data.arm} · ${data.term} · ${written} of ${data.students.length} written`"
    >
      <template #actions>
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: routesPath.academics.results.name }"
            >Back to results</RouterLink
          ></Button
        >
        <Button
          v-if="data.editable"
          :disabled="!changed.length || save.isPending.value"
          @click="saveAll"
          >{{
            changed.length
              ? `Save ${changed.length} change${changed.length > 1 ? 's' : ''}`
              : 'Saved'
          }}</Button
        >
      </template>
    </PageHeader>
    <InlineNotice
      v-if="!data.editable"
      tone="info"
      title="This class’s results are published"
      description="The report cards are read-only now. Comments can’t be changed."
    />
    <ul class="flex flex-col divide-y rounded-lg border bg-card">
      <li
        v-for="s in data.students"
        :key="s.studentId"
        class="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
      >
        <div class="flex min-w-0 flex-col gap-1">
          <RouterLink
            :to="{ name: routesPath.academics.reportCard.name, params: { studentId: s.studentId } }"
            class="font-medium hover:underline"
            >{{ s.name }}</RouterLink
          >
          <span class="text-xs text-faint"
            >{{ s.admissionNo }}{{ s.average !== null ? ` · Average ${s.average.toFixed(1)}%` : ''
            }}{{ s.position ? ` · Position ${s.position}` : '' }}</span
          >
          <p class="text-xs text-muted-foreground italic">
            {{
              s.classTeacherRemark
                ? `Class teacher: “${s.classTeacherRemark}”`
                : 'No class teacher remark yet.'
            }}
          </p>
        </div>
        <div class="flex flex-col gap-1">
          <Textarea
            v-model="drafts[s.studentId]"
            :disabled="!data.editable"
            :maxlength="MAX"
            rows="2"
            :aria-label="`${data.label}’s comment for ${s.name}`"
            placeholder="Write a short comment (optional)"
          />
          <span class="self-end text-[11px] text-faint tabular-nums"
            >{{ (drafts[s.studentId] ?? '').length }} / {{ MAX }}</span
          >
        </div>
      </li>
    </ul>
  </template>
</template>
