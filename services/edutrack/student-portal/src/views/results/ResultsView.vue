<script setup lang="ts">
import { computed, ref } from 'vue';

import { Button } from '@edutrack/ui/components/button';
import { useResultsQuery } from '@/api/services/student';
import { useDownload } from '@/composables/useDownload';
import AlertCard from '@/components/common/AlertCard.vue';
import ChipPicker from '@/components/common/ChipPicker.vue';
import ListRow from '@/components/common/ListRow.vue';
import ListSection from '@/components/common/ListSection.vue';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import type { ReportCardSubject } from '@/types';

/**
 * My results: the report card per term once the school publishes it. Before that, when it's
 * planned; a held card says to contact the school. Scores appear only on the published card.
 */
const term = ref<string | undefined>();
const q = useResultsQuery(term);
const r = computed(() => q.data.value);
const chips = computed(() => (r.value?.terms ?? []).map((t) => ({ value: t.id, label: t.label })));
const selected = computed({
  get: () => term.value ?? r.value?.termId,
  set: (v) => (term.value = v),
});
const card = computed(() => r.value?.card ?? null);
const { busy, download } = useDownload();

const scoresLine = (s: ReportCardSubject) => {
  const parts = (card.value?.components ?? []).map((c, i) => {
    const name = c.replace(/\s*\/\d+$/, '');
    return `${name} ${s.scores[i] ?? '—'}`;
  });
  return [parts.join(' · '), s.position].filter(Boolean).join(' · ');
};
const STARS = ['', 'Needs improvement', 'Fair', 'Good', 'Very good', 'Excellent'];
</script>

<template>
  <PageTitle title="My results" sub="Only you and your guardians can see these" />
  <ChipPicker v-if="chips.length > 1" v-model="selected" :options="chips" label="Term" />
  <QueryState v-if="!r" :loading="q.isPending.value" :error="q.error.value" @retry="q.refetch()" />
  <template v-else>
    <AlertCard
      v-if="r.status === 'not-published'"
      tone="neutral"
      title="Not published yet"
      :text="`${r.term} results for ${r.className ?? 'this class'} will appear here when the school publishes them${r.plannedOn ? ` (planned ${r.plannedOn})` : ''}. You’ll get a notification.`"
    />
    <AlertCard
      v-else-if="r.status === 'held'"
      tone="warning"
      title="Results on hold, please contact the school"
      :text="r.held?.message"
    />

    <div v-else-if="card" class="overflow-hidden rounded-lg border bg-card">
      <div class="flex items-center justify-between gap-3 bg-brand-subtle px-3.5 py-3">
        <img
          v-if="card.student?.photoUrl"
          :src="card.student.photoUrl"
          :alt="`Photo of ${card.student.name}`"
          class="h-14 w-12 shrink-0 rounded-md border bg-card object-cover"
        />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="font-semibold text-brand-strong">{{ card.title ?? r.term }}</span>
          <span class="text-xs text-brand-strong"
            >Published {{ r.publishedOn
            }}{{ card.version && card.version > 1 ? ` · version ${card.version}` : '' }}</span
          >
        </span>
        <span v-if="card.mode !== 'descriptive'" class="flex flex-col items-end">
          <span class="text-lg font-semibold text-brand-strong">{{ card.average }}</span>
          <span v-if="card.position" class="text-xs text-brand-strong">{{ card.position }}</span>
          <span v-else-if="card.grade" class="text-xs text-brand-strong"
            >Grade {{ card.grade }}</span
          >
        </span>
      </div>
      <div
        v-for="s in card.subjects ?? []"
        :key="s.name"
        :class="[
          'grid items-center gap-2.5 border-t border-divider px-3.5 py-2.5',
          card.mode === 'descriptive' ? 'grid-cols-[1fr_auto_auto]' : 'grid-cols-[1fr_auto_28px]',
        ]"
      >
        <template v-if="card.mode === 'descriptive'">
          <span class="col-span-2 flex flex-col">
            <span class="text-[13px] font-medium">{{ s.name }}</span>
            <span class="text-[11px] text-faint">{{ s.remark }}</span>
          </span>
          <span class="text-right text-xs font-semibold text-brand-strong">{{ s.grade }}</span>
        </template>
        <template v-else>
          <span class="flex flex-col">
            <span class="text-[13px] font-medium">{{ s.name }}</span>
            <span class="text-[11px] text-faint">{{ scoresLine(s) }}</span>
          </span>
          <span class="font-semibold tabular-nums">{{ s.total }}</span>
          <span class="font-semibold text-brand-strong">{{ s.grade }}</span>
        </template>
      </div>
      <div class="flex flex-col gap-1.5 border-t px-3.5 py-3 text-xs">
        <span v-if="card.classTeacherRemark"
          ><b class="font-semibold"
            >Class teacher{{ card.classTeacher ? ` (${card.classTeacher})` : '' }}:</b
          >
          {{ card.classTeacherRemark }}</span
        >
        <span v-if="card.headTeacherRemark"
          ><b class="font-semibold">Head teacher:</b> {{ card.headTeacherRemark }}</span
        >
        <span v-if="card.mode === 'descriptive' && (card.height != null || card.weight != null)"
          >Height {{ card.height != null ? `${card.height} cm` : '—' }} · Weight
          {{ card.weight != null ? `${card.weight} kg` : '—' }}</span
        >
        <span v-if="card.nextTerm" class="text-muted-foreground">{{ card.nextTerm }}.</span>
      </div>
      <div class="border-t px-3.5 py-3">
        <Button
          variant="outline"
          size="sm"
          class="w-full"
          :disabled="!!busy"
          @click="
            download(`/v1/student/results/pdf?term=${r.termId}`, `${card.title ?? r.term}.pdf`)
          "
          >{{ busy ? 'Preparing PDF…' : 'Download PDF' }}</Button
        >
      </div>
    </div>

    <ListSection v-if="card?.attendance" title="Attendance">
      <ListRow
        title="Present"
        :right="`${card.attendance.present} of ${card.attendance.schoolDays} days`"
      />
      <ListRow title="Late" :right="String(card.attendance.late)" />
      <ListRow title="Absent" :right="String(card.attendance.absent)" />
    </ListSection>

    <ListSection v-if="card?.conduct?.some((c) => c.rating)" title="Conduct">
      <ListRow
        v-for="c in card.conduct.filter((x) => x.rating)"
        :key="c.trait"
        :title="c.trait"
        :right="STARS[c.rating ?? 0]"
      />
    </ListSection>

    <ListSection v-if="card?.cumulative" title="Whole session">
      <ListRow
        v-for="s in card.cumulative.subjects"
        :key="s.name"
        :title="s.name"
        :sub="card.cumulative.terms.map((t, i) => `${t} ${s.totals[i] ?? '—'}`).join(' · ')"
        :right="s.average === null ? '—' : s.average.toFixed(1)"
      />
      <ListRow
        title="Session average"
        :right="card.cumulative.average === null ? '—' : `${card.cumulative.average.toFixed(1)}%`"
      />
    </ListSection>
  </template>
</template>
