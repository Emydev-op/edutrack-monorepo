<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { cn } from '@edutrack/ui/lib/utils';
import { ArrowRightIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import InitialsAvatar from '@edutrack/app-kit/components/common/InitialsAvatar.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { initials } from '@edutrack/app-kit/lib/format';

import {
  useDeletePositionMutation,
  useOrganogramQuery,
  useRolesQuery,
} from '@/api/services/school';
import { useCompleteSetupStepMutation, useSetupQuery } from '@/api/services/setup';
import { APPROVAL_CHAINS } from '@/config/permissions';
import { routesPath } from '@/router/routes-path';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import type { Position } from '@/types';

import PositionDrawer from './PositionDrawer.vue';

const { data, isPending } = useOrganogramQuery();
const route = useRoute();
const router = useRouter();

/* Opened from the Setup Center: this page is its "Organogram & Roles" step. */
const fromSetup = computed(() => route.query.from === 'setup');
const { data: setup } = useSetupQuery();
const { data: roles } = useRolesQuery();
const completeStep = useCompleteSetupStepMutation();
const stepDone = computed(
  () => !!setup.value?.steps.find((s) => s.id === 'organogram-roles')?.done,
);
function markStepComplete() {
  const p = positions.value;
  void confirm({
    title: 'Mark Organogram & Roles complete?',
    details: [
      ['Positions', `${p.length} · ${p.filter((x) => !x.holderIds.length).length} vacant`],
      ['Roles', `${roles.value?.length ?? 0} available · assign them in Users & Roles`],
      ['Later', 'You can change positions and roles any time'],
    ],
    confirmLabel: 'Mark complete',
    action: async () => {
      await completeStep.mutateAsync('organogram-roles');
      toast.success('Organogram & Roles complete.');
      await router.push({ name: routesPath.setup.name });
    },
  });
}
const remove = useDeletePositionMutation();
const confirm = useConfirm();

const positions = computed(() => data.value?.positions ?? []);
const kids = (id: string | null) => positions.value.filter((p) => p.parentId === id);

/** Depth-first, so each position sits under the one it reports to. */
const rows = computed(() => {
  const out: { p: Position; depth: number }[] = [];
  const walk = (id: string | null, depth: number) =>
    kids(id).forEach((p) => {
      out.push({ p, depth });
      walk(p.id, depth + 1);
    });
  walk(null, 0);
  return out;
});

const selectedId = ref<string | null>(null);
const selected = computed(
  () =>
    positions.value.find((p) => p.id === selectedId.value) ??
    positions.value[1] ??
    positions.value[0],
);
const parentTitle = computed(() =>
  selected.value?.parentId
    ? (positions.value.find((p) => p.id === selected.value!.parentId)?.title ?? '—')
    : 'Top of the organisation',
);
const vacant = computed(() => positions.value.filter((p) => !p.holderIds.length).length);

const drawer = ref(false);
const editing = ref<Position | null>(null);
const newParent = ref<string | null>(null);
function openDrawer(p: Position | null) {
  editing.value = p;
  newParent.value = p ? null : (selected.value?.id ?? null);
  drawer.value = true;
}

function removePosition(p: Position) {
  const reports = kids(p.id);
  if (reports.length)
    return void confirm({
      title: `Can’t remove ${p.title} yet`,
      description: `${reports.length} position${reports.length > 1 ? 's report' : ' reports'} to it: ${reports.map((x) => x.title).join(', ')}. Move them to another position first.`,
      confirmLabel: `Edit ${reports[0]!.title}`,
      action: () => openDrawer(reports[0]!),
    });
  void confirm({
    title: `Remove the ${p.title} position?`,
    details: [
      [
        'Holders',
        p.holderNames.length
          ? `${p.holderNames.join(', ')} · their staff records and system roles are not changed`
          : 'Vacant',
      ],
      [
        'Approvals',
        p.approvals.length
          ? `${p.approvals.length} approval responsibilities will need a new owner`
          : 'None',
      ],
    ],
    confirmLabel: 'Remove position',
    tone: 'destructive',
    action: async () => {
      await remove.mutateAsync(p.id);
      selectedId.value = p.parentId;
      toast.success('Position removed.');
    },
  });
}
</script>

<template>
  <PageHeader
    title="Organogram"
    :description="
      data
        ? `${positions.length} position${positions.length === 1 ? '' : 's'} · ${vacant} vacant. A position sets reporting lines and approvals. System roles set what someone can access.`
        : undefined
    "
  >
    <template #actions
      ><Button :disabled="!data" @click="openDrawer(null)">Add position</Button></template
    >
  </PageHeader>

  <InlineNotice
    v-if="fromSetup"
    :tone="stepDone ? 'success' : 'brand'"
    :title="stepDone ? 'Organogram & Roles step complete' : 'Setup Center · Organogram & Roles'"
    :description="
      stepDone
        ? 'You can keep editing positions here. Changes don’t affect the step.'
        : 'Add the positions in your school and who holds them, then mark this step complete. At least one position must report to the top.'
    "
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: routesPath.setup.name }">Back to Setup Center</RouterLink></Button
      >
      <Button v-if="!stepDone" size="sm" :disabled="!data" @click="markStepComplete"
        >Mark complete</Button
      >
    </template>
  </InlineNotice>

  <div v-if="isPending" class="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
    <Skeleton class="h-96" /><Skeleton class="h-96" />
  </div>

  <template v-else-if="data">
    <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <ol class="flex flex-col gap-1.5 rounded-lg border bg-card p-3" aria-label="Positions">
        <li
          v-for="{ p, depth } in rows"
          :key="p.id"
          :style="{ paddingLeft: `${depth * 28}px` }"
          class="relative"
        >
          <span
            v-if="depth"
            class="absolute top-0 bottom-1/2 w-3 border-b border-l border-[#D9D5CD]"
            :style="{ left: `${depth * 28 - 16}px` }"
            aria-hidden="true"
          />
          <button
            type="button"
            :aria-current="p.id === selected?.id ? 'true' : undefined"
            :class="
              cn(
                'flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors',
                p.id === selected?.id ? 'border-primary bg-brand-tint' : 'bg-card hover:bg-muted',
              )
            "
            @click="selectedId = p.id"
          >
            <InitialsAvatar :initials="p.holderNames[0] ? initials(p.holderNames[0]) : '—'" />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-[13px] font-medium">{{ p.title }}</span>
              <span
                :class="
                  cn(
                    'truncate text-xs',
                    p.holderNames.length ? 'text-muted-foreground' : 'text-error-strong',
                  )
                "
                >{{ p.holderNames.join(', ') || 'Vacant' }}</span
              >
            </span>
            <span v-if="kids(p.id).length" class="text-[11px] whitespace-nowrap text-faint"
              >{{ kids(p.id).length }} direct report{{ kids(p.id).length > 1 ? 's' : '' }}</span
            >
          </button>
        </li>
      </ol>

      <section
        v-if="selected"
        class="flex flex-col gap-3.5 rounded-lg border bg-card p-4 lg:sticky lg:top-0"
        aria-label="Selected position"
      >
        <div class="flex flex-col gap-0.5">
          <h2 class="text-base font-semibold">{{ selected.title }}</h2>
          <span class="text-xs text-muted-foreground">Reports to {{ parentTitle }}</span>
        </div>
        <div class="flex flex-col gap-1.5 text-[13px]">
          <span class="text-xs font-semibold text-muted-foreground">Held by</span>
          <span v-if="!selected.holderNames.length" class="text-error-strong">Vacant</span>
          <span v-for="n in selected.holderNames" :key="n" class="flex items-center gap-2">
            <InitialsAvatar :initials="initials(n)" />{{ n }}
          </span>
        </div>
        <div class="flex flex-col gap-1 text-[13px]">
          <span class="text-xs font-semibold text-muted-foreground">Responsibilities</span>
          <span>{{ selected.responsibilities || 'No responsibilities recorded' }}</span>
        </div>
        <div v-if="selected.suggestedRoles.length" class="flex flex-col gap-1.5 text-[13px]">
          <span class="text-xs font-semibold text-muted-foreground">Suggested system roles</span>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="r in selected.suggestedRoles"
              :key="r"
              class="rounded-sm bg-brand-subtle px-1.5 py-0.5 text-xs font-medium text-brand-strong"
              >{{ r }}</span
            >
          </div>
        </div>
        <div class="flex flex-col gap-1 text-[13px]">
          <span class="text-xs font-semibold text-muted-foreground">Approval authority</span>
          <ul v-if="selected.approvals.length" class="list-disc pl-4">
            <li v-for="a in selected.approvals" :key="a">{{ a }}</li>
          </ul>
          <span v-else class="text-faint">None</span>
        </div>
        <div v-if="kids(selected.id).length" class="flex flex-col gap-1 text-[13px]">
          <span class="text-xs font-semibold text-muted-foreground">Direct reports</span>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="k in kids(selected.id)"
              :key="k.id"
              type="button"
              class="rounded-md border px-2 py-1 text-xs hover:bg-muted"
              @click="selectedId = k.id"
            >
              {{ k.title }}
            </button>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 border-t border-divider pt-3">
          <Button size="sm" @click="openDrawer(selected)">Edit position</Button>
          <Button size="sm" variant="outline" @click="openDrawer(null)">Add a report</Button>
          <Button
            v-if="selected.parentId"
            size="sm"
            variant="ghost"
            class="text-destructive"
            @click="removePosition(selected)"
            >Remove</Button
          >
        </div>
      </section>
    </div>

    <section class="flex flex-col gap-3 rounded-lg border bg-card p-4" aria-label="Approval chains">
      <h2 class="text-[15px] font-semibold">Approval chains</h2>
      <div
        v-for="[name, steps] in APPROVAL_CHAINS"
        :key="name"
        class="grid items-center gap-2 text-[13px] sm:grid-cols-[110px_1fr]"
      >
        <span class="font-medium">{{ name }}</span>
        <ol class="flex flex-wrap items-center gap-1.5">
          <li v-for="(s, i) in steps" :key="s" class="flex items-center gap-1.5">
            <span class="rounded-sm border bg-muted px-2 py-0.5 text-xs">{{ s }}</span>
            <ArrowRightIcon
              v-if="i < steps.length - 1"
              class="size-3 text-[#B8B2A9]"
              aria-hidden="true"
            />
          </li>
        </ol>
      </div>
    </section>

    <ActivityTimeline
      title="Organogram changes"
      :items="data.history"
      empty-text="No changes recorded yet."
    />
    <PositionDrawer
      v-model:open="drawer"
      :position="editing"
      :parent-id="newParent"
      :positions="positions"
      @saved="selectedId = $event"
    />
  </template>
</template>
