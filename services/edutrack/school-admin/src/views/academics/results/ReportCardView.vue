<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { initials } from '@edutrack/app-kit/lib/format';

import { useReportCardQuery } from '@/api/services/academics';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';
import { CONDUCT_SCALE } from '@/types';

const route = useRoute();
const router = useRouter();
const layout = useLayoutStore();
const studentId = computed(() => String(route.params.studentId));
const { data: card, isPending, error } = useReportCardQuery(studentId);
const template = useRouteQuery<'classic' | 'compact'>('template', 'classic');

watch(card, (c) => layout.setRecordLabel(c ? `Report card · ${c.student.name}` : null), {
  immediate: true,
});

const printCard = () => window.print();

const classic = computed(() => template.value === 'classic');
const pickStudent = (id: string) =>
  router.push({
    name: routesPath.academics.reportCard.name,
    params: { studentId: id },
    query: route.query,
  });
</script>

<template>
  <Skeleton v-if="isPending" class="h-[640px]" />
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="This report card can't be shown"
    :description="getApiErrorMessage(error)"
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: routesPath.academics.results.name }"
          >Back to results</RouterLink
        ></Button
      >
    </template>
  </InlineNotice>
  <template v-else-if="card">
    <div class="flex flex-col gap-4 print:hidden">
      <PageHeader
        title="Report card"
        :description="`${card.student.name} · ${card.student.className} · ${card.title}`"
      >
        <template #actions>
          <Button
            variant="outline"
            @click="toast.info(`Generating report-card-${card.student.id}.pdf`)"
            >Download PDF</Button
          >
          <Button @click="printCard">Print</Button>
        </template>
      </PageHeader>
      <div class="flex flex-wrap items-end gap-3">
        <SegmentedControl
          v-model="template"
          label="Template"
          :options="[
            { value: 'classic', label: 'Classic template' },
            { value: 'compact', label: 'Compact template' },
          ]"
        />
        <label class="flex flex-col gap-1 text-xs text-muted-foreground">
          Student
          <select
            :value="card.student.id"
            class="h-9 min-w-56 rounded-md border bg-card px-2.5 text-sm text-foreground"
            @change="pickStudent(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="s in card.classmates" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
      </div>
      <InlineNotice
        v-if="!card.published"
        tone="warning"
        title="Not published yet"
        :description="`This is a preview. Parents see ${card.student.className} report cards once every subject is approved and the class is published.`"
      />
      <InlineNotice
        v-else-if="card.version > 1"
        tone="info"
        :title="`Version ${card.version}`"
        description="Re-issued after an approved correction. Earlier versions stay in the history."
      />
    </div>

    <article
      :class="
        cn(
          'relative mx-auto w-full max-w-[820px] overflow-hidden rounded-lg border bg-card text-foreground print:max-w-none print:border-0',
          classic ? 'p-8' : 'p-5',
        )
      "
      :aria-label="`${card.title} for ${card.student.name}`"
    >
      <span
        v-if="!card.published"
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-bold tracking-widest text-foreground/5 uppercase select-none"
        style="transform: rotate(-24deg)"
        >Draft</span
      >

      <header
        :class="
          cn(
            'flex items-center gap-4',
            classic ? 'flex-col border-b-2 border-primary pb-4 text-center' : 'border-b pb-3',
          )
        "
      >
        <img
          v-if="card.school.logoUrl"
          :src="card.school.logoUrl"
          alt=""
          :class="classic ? 'size-16' : 'size-11'"
          class="rounded-md object-contain"
        />
        <span
          v-else
          :class="
            cn(
              'flex items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground',
              classic ? 'size-16 text-xl' : 'size-11',
            )
          "
          >{{ initials(card.school.name) }}</span
        >
        <div class="flex flex-col gap-0.5">
          <span :class="classic ? 'text-2xl font-semibold' : 'text-lg font-semibold'">{{
            card.school.name
          }}</span>
          <span v-if="card.school.motto" class="text-xs text-muted-foreground italic">{{
            card.school.motto
          }}</span>
          <span class="text-xs text-faint">{{ card.school.address }}</span>
        </div>
        <span
          :class="
            cn(
              'text-sm font-semibold tracking-[0.04em] text-primary uppercase',
              !classic && 'ml-auto text-right',
            )
          "
          >{{ card.title }}</span
        >
      </header>

      <dl
        :class="
          cn(
            'my-4 grid gap-x-6 gap-y-1.5 text-[13px]',
            classic ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4',
          )
        "
      >
        <div
          v-for="[k, v] in [
            ['Name', card.student.name],
            ['Admission no.', card.student.admissionNo],
            ['Class', card.student.className],
            ['Gender', card.student.gender],
            ['Class teacher', card.classTeacher ?? 'Not assigned'],
            ['Position', card.position ?? '—'],
          ]"
          :key="k"
          class="flex flex-col"
        >
          <dt class="text-xs text-faint">{{ k }}</dt>
          <dd class="font-medium">{{ v }}</dd>
        </div>
      </dl>

      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-[13px]">
          <thead>
            <tr :class="classic ? 'bg-muted' : 'border-b'">
              <th class="px-2 py-2 text-left font-medium">Subject</th>
              <th
                v-for="c in card.components"
                :key="c"
                class="px-2 py-2 text-right font-medium whitespace-nowrap"
              >
                {{ c }}
              </th>
              <th class="px-2 py-2 text-right font-medium">Total</th>
              <th class="px-2 py-2 text-left font-medium">Grade</th>
              <th v-if="classic" class="px-2 py-2 text-left font-medium">Remark</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in card.subjects" :key="s.name" class="border-b border-divider">
              <td class="px-2 py-1.5">{{ s.name }}</td>
              <td
                v-for="(v, i) in s.scores"
                :key="i"
                :class="
                  cn(
                    'px-2 py-1.5 text-right tabular-nums',
                    v === 'ABS' && 'font-medium text-info-strong',
                    v === 'EXM' && 'text-neutral-strong',
                  )
                "
              >
                {{ v }}
              </td>
              <td class="px-2 py-1.5 text-right font-medium tabular-nums">{{ s.total }}</td>
              <td class="px-2 py-1.5 font-semibold">{{ s.grade }}</td>
              <td v-if="classic" class="px-2 py-1.5 text-muted-foreground">{{ s.remark }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        :class="
          cn(
            'mt-4 grid gap-3 text-[13px]',
            classic ? 'sm:grid-cols-3' : 'grid-cols-3 rounded-md bg-muted px-3 py-2',
          )
        "
      >
        <div class="flex flex-col">
          <span class="text-xs text-faint">Average</span>
          <span class="text-lg font-semibold">{{ card.average }}</span>
        </div>
        <div class="flex flex-col">
          <span class="text-xs text-faint">Overall grade</span>
          <span class="text-lg font-semibold">{{ card.grade }}</span>
        </div>
        <div class="flex flex-col">
          <span class="text-xs text-faint">Position</span>
          <span class="text-lg font-semibold">{{ card.position ?? 'Not shown' }}</span>
        </div>
      </div>

      <div class="mt-4 grid gap-4 text-[13px] sm:grid-cols-2 print:grid-cols-2">
        <section aria-labelledby="rc-attendance" class="flex flex-col gap-1.5">
          <h3 id="rc-attendance" class="text-xs font-semibold tracking-[0.04em] uppercase">
            Attendance
          </h3>
          <template v-if="card.attendance">
            <p>
              <span class="text-lg font-semibold tabular-nums">{{ card.attendance.present }}</span>
              <span class="text-muted-foreground">
                of {{ card.attendance.schoolDays }} school days present</span
              >
            </p>
            <p class="text-xs text-muted-foreground">
              Late {{ card.attendance.late }} · Absent {{ card.attendance.absent }} · Excused
              {{ card.attendance.excused }}
            </p>
          </template>
          <p v-else class="text-muted-foreground">No school days yet this term.</p>
        </section>
        <section aria-labelledby="rc-conduct" class="flex flex-col gap-1.5">
          <h3 id="rc-conduct" class="text-xs font-semibold tracking-[0.04em] uppercase">Conduct</h3>
          <dl class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
            <template v-for="c in card.conduct" :key="c.trait">
              <dt class="text-body">{{ c.trait }}</dt>
              <dd class="text-right tabular-nums">
                <template v-if="c.rating !== null"
                  ><span class="font-semibold">{{ c.rating }}</span
                  ><span class="text-muted-foreground">
                    / 5 · {{ CONDUCT_SCALE[c.rating] }}</span
                  ></template
                >
                <span v-else class="text-faint">Not rated</span>
              </dd>
            </template>
          </dl>
        </section>
      </div>

      <section aria-labelledby="rc-remark" class="mt-4 flex flex-col gap-1.5 text-[13px]">
        <h3 id="rc-remark" class="text-xs font-semibold tracking-[0.04em] uppercase">
          Class teacher’s remark
        </h3>
        <p v-if="card.classTeacherRemark" class="rounded-md bg-muted px-3 py-2 italic">
          “{{ card.classTeacherRemark }}”
        </p>
        <p v-else class="rounded-md border border-dashed px-3 py-2 text-warning-strong">
          Not written yet{{
            card.classTeacher ? ` · ${card.classTeacher} adds it in the Teacher Workspace` : ''
          }}
        </p>
      </section>

      <footer
        :class="
          cn(
            'mt-5 flex flex-wrap justify-between gap-3 border-t pt-3 text-xs text-muted-foreground',
          )
        "
      >
        <span>Class teacher: {{ card.classTeacher ?? 'Not assigned' }}</span>
        <span>{{ card.nextTerm }}</span>
        <span>{{
          card.published ? `Version ${card.version}` : 'Not published yet · preview only'
        }}</span>
      </footer>
    </article>
  </template>
</template>
