<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@edutrack/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@edutrack/ui/components/tabs';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { DownloadIcon } from '@lucide/vue';
import { ref } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import { downloadFile } from '@/api/helpers';
import { useGroupReportsQuery, type ReportPeriod } from '@/api/services/group';
import { routesPath } from '@/router/routes-path';

import { useOpenInSchool } from './use-open-in-school';

/**
 * School Admin › Group overview › Reports: each school of the group side by side for this term
 * (or the term before), with the change from the term before it: results, attendance, fees,
 * enrolment and staff; results by subject and the group's top students; fees owed per class and
 * collections by month. Downloads as one Excel workbook for a board pack.
 */
const period = ref<ReportPeriod>('current');
const { data, isPending, isFetching, error } = useGroupReportsQuery(period);
const downloading = ref(false);
const { open: openIn, pending: opening } = useOpenInSchool();

const fmt = (n: number) => n.toLocaleString('en-NG');
const show = (n: number | null | undefined, suffix = '') =>
  n === null || n === undefined ? '—' : `${n.toLocaleString('en-NG')}${suffix}`;

/** "+2.4" / "−1.0" against the term before, or nothing to compare. */
function change(now: number | null | undefined, before: number | null | undefined) {
  if (now == null || before == null) return null;
  const d = Math.round((now - before) * 10) / 10;
  return { text: `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}`, tone: Math.sign(d) };
}
const toneClass = (tone: number) =>
  tone > 0 ? 'text-success-strong' : tone < 0 ? 'text-destructive' : 'text-muted-foreground';

async function download() {
  downloading.value = true;
  try {
    await downloadFile(`/v1/group/reports/export?period=${period.value}`, 'group-report.xlsx');
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'The report couldn’t be downloaded. Try again.'));
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <PageHeader
    title="Group reports"
    :description="
      data
        ? `${data.group.name} · ${data.totals.schools} schools · compared with the term before`
        : 'Every school side by side, compared with the term before'
    "
  >
    <template #actions>
      <div class="inline-flex rounded-md border p-0.5" role="group" aria-label="Term">
        <Button
          size="sm"
          :variant="period === 'current' ? 'secondary' : 'ghost'"
          :aria-pressed="period === 'current'"
          @click="period = 'current'"
          >This term</Button
        >
        <Button
          size="sm"
          :variant="period === 'previous' ? 'secondary' : 'ghost'"
          :aria-pressed="period === 'previous'"
          @click="period = 'previous'"
          >Last term</Button
        >
      </div>
      <Button variant="outline" :disabled="!data || downloading" @click="download">
        <DownloadIcon class="size-4" aria-hidden="true" />
        {{ downloading ? 'Preparing…' : 'Download Excel' }}
      </Button>
    </template>
  </PageHeader>

  <Skeleton v-if="isPending" class="h-80" />
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="Group reports can’t be shown"
    :description="getApiErrorMessage(error)"
  />
  <div v-else-if="data" class="flex flex-col gap-4" :class="{ 'opacity-60': isFetching }">
    <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Group totals">
      <div class="rounded-lg border bg-card p-4">
        <p class="text-xs text-faint">Students on roll</p>
        <p class="text-2xl font-semibold tabular-nums">{{ fmt(data.totals.students.onRoll) }}</p>
        <p class="text-xs text-muted-foreground">
          {{ fmt(data.totals.students.admitted) }} admitted ·
          {{ fmt(data.totals.students.left) }} left this term
        </p>
      </div>
      <div class="rounded-lg border bg-card p-4">
        <p class="text-xs text-faint">Attendance</p>
        <p class="text-2xl font-semibold tabular-nums">{{ show(data.totals.attendance, '%') }}</p>
        <p class="text-xs text-muted-foreground">Present or late</p>
      </div>
      <div class="rounded-lg border bg-card p-4">
        <p class="text-xs text-faint">Pass rate</p>
        <p class="text-2xl font-semibold tabular-nums">
          {{ show(data.totals.results.passRate, '%') }}
        </p>
        <p class="text-xs text-muted-foreground">
          Average score {{ show(data.totals.results.average) }} ·
          {{ fmt(data.totals.results.graded) }} results
        </p>
      </div>
      <div v-if="data.totals.fees" class="rounded-lg border bg-card p-4">
        <p class="text-xs text-faint">Fees collected</p>
        <p class="text-2xl font-semibold tabular-nums">
          {{ formatNaira(data.totals.fees.collected) }}
        </p>
        <p class="text-xs text-muted-foreground">
          {{ show(data.totals.fees.rate, '%') }} of {{ formatNaira(data.totals.fees.billed) }} ·
          {{ formatNaira(data.totals.fees.outstanding) }} outstanding
        </p>
      </div>
      <div v-else class="rounded-lg border bg-card p-4">
        <p class="text-xs text-faint">Students per teacher</p>
        <p class="text-2xl font-semibold tabular-nums">
          {{ show(data.totals.staff.perTeacher) }}
        </p>
        <p class="text-xs text-muted-foreground">
          {{ fmt(data.totals.staff.teaching) }} teachers · {{ fmt(data.totals.staff.total) }} staff
        </p>
      </div>
    </section>

    <Tabs default-value="schools">
      <TabsList>
        <TabsTrigger value="schools">Schools</TabsTrigger>
        <TabsTrigger value="results">Results</TabsTrigger>
        <TabsTrigger v-if="data.seesFees" value="fees">Fees</TabsTrigger>
      </TabsList>

      <TabsContent value="schools" class="flex flex-col gap-2">
        <div class="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead class="text-right">On roll</TableHead>
                <TableHead class="text-right">Admitted / left</TableHead>
                <TableHead class="text-right">Per teacher</TableHead>
                <TableHead class="text-right">Attendance</TableHead>
                <TableHead class="text-right">Average</TableHead>
                <TableHead class="text-right">Pass rate</TableHead>
                <TableHead v-if="data.seesFees" class="text-right">Collected</TableHead>
                <TableHead v-if="data.seesFees" class="text-right">Collection</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="s in data.schools" :key="s.id">
                <TableCell>
                  <span class="flex items-center gap-2">
                    <span
                      class="size-2.5 shrink-0 rounded-full"
                      :style="{ background: s.brandColor ?? 'var(--primary)' }"
                      aria-hidden="true"
                    />
                    <span class="flex flex-col">
                      <span class="font-medium">{{ s.name }}</span>
                      <span class="text-xs text-muted-foreground">{{
                        s.term ?? 'No term yet'
                      }}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell class="text-right tabular-nums">{{ fmt(s.students.onRoll) }}</TableCell>
                <TableCell class="text-right tabular-nums"
                  >{{ s.students.admitted }} / {{ s.students.left }}</TableCell
                >
                <TableCell class="text-right tabular-nums">{{
                  show(s.staff.perTeacher)
                }}</TableCell>
                <TableCell
                  v-for="cell in [
                    { now: s.attendance.rate, before: s.attendance.before, suffix: '%' },
                    { now: s.results.average, before: s.results.averageBefore, suffix: '' },
                    { now: s.results.passRate, before: s.results.passRateBefore, suffix: '%' },
                  ]"
                  :key="cell.suffix + String(cell.before)"
                  class="text-right tabular-nums"
                >
                  {{ show(cell.now, cell.suffix) }}
                  <span
                    v-if="change(cell.now, cell.before)"
                    class="block text-xs"
                    :class="toneClass(change(cell.now, cell.before)!.tone)"
                    >{{ change(cell.now, cell.before)!.text }}</span
                  >
                </TableCell>
                <template v-if="s.fees">
                  <TableCell class="text-right tabular-nums">{{
                    formatNaira(s.fees.collected)
                  }}</TableCell>
                  <TableCell class="text-right tabular-nums">
                    {{ show(s.fees.rate, '%') }}
                    <span
                      v-if="change(s.fees.rate, s.fees.rateBefore)"
                      class="block text-xs"
                      :class="toneClass(change(s.fees.rate, s.fees.rateBefore)!.tone)"
                      >{{ change(s.fees.rate, s.fees.rateBefore)!.text }}</span
                    >
                  </TableCell>
                </template>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell class="font-medium">Group</TableCell>
                <TableCell class="text-right tabular-nums">{{
                  fmt(data.totals.students.onRoll)
                }}</TableCell>
                <TableCell class="text-right tabular-nums"
                  >{{ data.totals.students.admitted }} / {{ data.totals.students.left }}</TableCell
                >
                <TableCell class="text-right tabular-nums">{{
                  show(data.totals.staff.perTeacher)
                }}</TableCell>
                <TableCell class="text-right tabular-nums">{{
                  show(data.totals.attendance, '%')
                }}</TableCell>
                <TableCell class="text-right tabular-nums">{{
                  show(data.totals.results.average)
                }}</TableCell>
                <TableCell class="text-right tabular-nums">{{
                  show(data.totals.results.passRate, '%')
                }}</TableCell>
                <template v-if="data.totals.fees">
                  <TableCell class="text-right tabular-nums">{{
                    formatNaira(data.totals.fees.collected)
                  }}</TableCell>
                  <TableCell class="text-right tabular-nums">{{
                    show(data.totals.fees.rate, '%')
                  }}</TableCell>
                </template>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
        <p class="text-xs text-muted-foreground">
          Small figures under a value are the change from the term before. Results come from
          approved and published result sheets; attendance from the class registers.
        </p>
      </TabsContent>

      <TabsContent value="results" class="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <section class="overflow-x-auto rounded-lg border bg-card">
          <h2 class="px-4 pt-3 text-sm font-semibold">Average score by subject</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead v-for="s in data.schools" :key="s.id" class="text-right">{{
                  s.name
                }}</TableHead>
                <TableHead class="text-right">Group</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="x in data.subjects" :key="x.subject">
                <TableCell class="font-medium">{{ x.subject }}</TableCell>
                <TableCell v-for="s in data.schools" :key="s.id" class="text-right tabular-nums">{{
                  show(x.schools[s.id])
                }}</TableCell>
                <TableCell class="text-right font-medium tabular-nums">{{ x.average }}</TableCell>
              </TableRow>
              <TableRow v-if="!data.subjects.length">
                <TableCell
                  :colspan="data.schools.length + 2"
                  class="py-6 text-center text-muted-foreground"
                  >No approved result sheets for this term yet.</TableCell
                >
              </TableRow>
            </TableBody>
          </Table>
        </section>
        <section class="overflow-x-auto rounded-lg border bg-card">
          <h2 class="px-4 pt-3 text-sm font-semibold">Top students across the group</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-10">#</TableHead>
                <TableHead>Student</TableHead>
                <TableHead class="text-right">Average</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="(st, i) in data.topStudents" :key="`${st.school}-${st.name}-${i}`">
                <TableCell class="tabular-nums">{{ i + 1 }}</TableCell>
                <TableCell>
                  <span class="flex flex-col">
                    <button
                      type="button"
                      class="text-left font-medium hover:underline disabled:opacity-60"
                      :disabled="opening"
                      @click="
                        openIn(st.schoolId, st.school, {
                          name: routesPath.students.detail.name,
                          params: { id: st.studentId },
                        })
                      "
                    >
                      {{ st.name }}
                    </button>
                    <span class="text-xs text-muted-foreground"
                      >{{ st.className }} · {{ st.school }}</span
                    >
                  </span>
                </TableCell>
                <TableCell class="text-right tabular-nums">{{ st.average }}</TableCell>
              </TableRow>
              <TableRow v-if="!data.topStudents.length">
                <TableCell colspan="3" class="py-6 text-center text-muted-foreground"
                  >Students show here once three or more of their subjects are approved.</TableCell
                >
              </TableRow>
            </TableBody>
          </Table>
        </section>
      </TabsContent>

      <TabsContent
        v-if="data.seesFees && data.arrears && data.collections && data.methods"
        value="fees"
        class="grid gap-4 xl:grid-cols-2"
      >
        <section class="overflow-x-auto rounded-lg border bg-card">
          <h2 class="px-4 pt-3 text-sm font-semibold">Fees owed by class</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead>Class level</TableHead>
                <TableHead class="text-right">Invoices owing</TableHead>
                <TableHead class="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="a in data.arrears" :key="`${a.schoolId}-${a.level}`">
                <TableCell>{{ a.school }}</TableCell>
                <TableCell>{{ a.level }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ a.students }}</TableCell>
                <TableCell class="text-right font-medium text-warning-strong tabular-nums">{{
                  formatNaira(a.outstanding)
                }}</TableCell>
              </TableRow>
              <TableRow v-if="!data.arrears.length">
                <TableCell colspan="4" class="py-6 text-center text-muted-foreground"
                  >Nothing owed this term.</TableCell
                >
              </TableRow>
            </TableBody>
          </Table>
        </section>
        <div class="flex flex-col gap-4">
          <section class="overflow-x-auto rounded-lg border bg-card">
            <h2 class="px-4 pt-3 text-sm font-semibold">Collections by month</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead v-for="s in data.schools" :key="s.id" class="text-right">{{
                    s.name
                  }}</TableHead>
                  <TableHead class="text-right">Group</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="c in data.collections" :key="c.month">
                  <TableCell>{{ c.month }}</TableCell>
                  <TableCell
                    v-for="s in data.schools"
                    :key="s.id"
                    class="text-right tabular-nums"
                    >{{ formatNaira(c.schools[s.id] ?? 0) }}</TableCell
                  >
                  <TableCell class="text-right font-medium tabular-nums">{{
                    formatNaira(c.total)
                  }}</TableCell>
                </TableRow>
                <TableRow v-if="!data.collections.length">
                  <TableCell
                    :colspan="data.schools.length + 2"
                    class="py-6 text-center text-muted-foreground"
                    >No confirmed payments this term yet.</TableCell
                  >
                </TableRow>
              </TableBody>
            </Table>
          </section>
          <section v-if="data.methods.length" class="rounded-lg border bg-card p-4">
            <h2 class="mb-2 text-sm font-semibold">How parents paid</h2>
            <ul class="flex flex-col gap-1.5 text-sm">
              <li v-for="m in data.methods" :key="m.method" class="flex justify-between">
                <span>{{ m.method }}</span>
                <span class="font-medium tabular-nums">{{ formatNaira(m.amount) }}</span>
              </li>
            </ul>
          </section>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>
