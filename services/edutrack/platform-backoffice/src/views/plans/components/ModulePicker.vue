<script setup lang="ts">
import { cn } from '@edutrack/ui/lib/utils';
import { CheckIcon } from '@lucide/vue';
import { useField } from 'vee-validate';
import { toast } from 'vue-sonner';

import {
  dependentsOf,
  moduleName,
  PLAN_MODULES,
  requirementsOf,
  type ModuleGroup,
  type PlanModule,
} from '@/config/plan-modules';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

const props = defineProps<{ groups: readonly ModuleGroup[] }>();

const { value: modules } = useField<string[]>('modules');
const confirm = useConfirm();

const isOn = (mod: PlanModule) => mod.core || modules.value.includes(mod.id);
const optional = (group: ModuleGroup) =>
  PLAN_MODULES.filter((mod) => mod.group === group && !mod.core && !mod.comingSoon);
const names = (ids: string[]) => ids.map(moduleName).join(', ');

function turnOn(ids: string[]) {
  const next = new Set(modules.value);
  const added: string[] = [];
  for (const id of ids) {
    next.add(id);
    for (const req of requirementsOf(id))
      if (!next.has(req) && !ids.includes(req)) {
        next.add(req);
        added.push(req);
      }
  }
  modules.value = [...next];
  return added;
}

/** Turns `ids` off, and asks first when other modules can't work without them. */
async function turnOff(ids: string[], title: string) {
  const dependents = [...new Set(ids.flatMap((id) => dependentsOf(id, modules.value)))].filter(
    (id) => !ids.includes(id),
  );
  if (dependents.length) {
    const ok = await confirm({
      title,
      description: `${names(dependents)} ${dependents.length > 1 ? 'depend' : 'depends'} on ${ids.length > 1 ? 'them' : 'it'} and will be turned off too.`,
      confirmLabel: `Turn off ${ids.length + dependents.length} modules`,
      tone: 'destructive',
    });
    if (!ok) return;
  }
  const off = new Set([...ids, ...dependents]);
  modules.value = modules.value.filter((id) => !off.has(id));
}

function toggle(mod: PlanModule) {
  if (mod.core || mod.comingSoon) return;
  if (isOn(mod)) return turnOff([mod.id], `Turn off ${mod.name}?`);
  const added = turnOn([mod.id]);
  if (added.length)
    toast.info(
      `${mod.name} needs ${names(added)}, so ${added.length > 1 ? 'they were' : 'it was'} turned on too.`,
    );
}

function toggleGroup(group: ModuleGroup) {
  const list = optional(group);
  if (list.every(isOn))
    return turnOff(
      list.map((mod) => mod.id),
      `Turn off all ${group} modules?`,
    );
  turnOn(list.map((mod) => mod.id));
}

const summary = (group: ModuleGroup) => {
  if (group === 'Core') return 'Every plan';
  if (group === 'Coming soon') return 'Not yet available';
  const list = optional(group);
  return `${list.filter(isOn).length} of ${list.length} on`;
};
const tag = (mod: PlanModule) =>
  mod.core
    ? 'Always included'
    : mod.comingSoon
      ? 'Coming soon'
      : mod.requires.length
        ? `Needs ${names(mod.requires)}`
        : '';
</script>

<template>
  <div class="flex flex-col gap-5">
    <div v-for="group in props.groups" :key="group" class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between gap-2.5">
        <span class="flex items-baseline gap-2">
          <span class="text-sm font-semibold">{{ group }}</span>
          <span class="text-xs text-faint">{{ summary(group) }}</span>
        </span>
        <button
          v-if="optional(group).length > 1"
          type="button"
          class="text-xs font-medium text-primary hover:underline"
          @click="toggleGroup(group)"
        >
          {{ optional(group).every(isOn) ? 'Turn all off' : 'Turn all on' }}
        </button>
      </div>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2">
        <button
          v-for="mod in PLAN_MODULES.filter((x) => x.group === group)"
          :key="mod.id"
          type="button"
          role="switch"
          :aria-checked="isOn(mod)"
          :disabled="mod.core || mod.comingSoon"
          :class="
            cn(
              'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
              'enabled:hover:border-primary disabled:cursor-default',
              mod.comingSoon
                ? 'bg-muted opacity-60'
                : isOn(mod)
                  ? cn('bg-brand-tint', !mod.core && 'border-primary')
                  : 'bg-card',
            )
          "
          @click="toggle(mod)"
        >
          <span
            aria-hidden="true"
            :class="
              cn(
                'mt-px flex size-4.5 shrink-0 items-center justify-center rounded-sm border-[1.5px] text-white',
                mod.comingSoon
                  ? 'border-border bg-muted'
                  : isOn(mod)
                    ? 'border-primary bg-primary'
                    : 'border-[#C9C3BA] bg-card',
              )
            "
          >
            <CheckIcon v-if="isOn(mod) && !mod.comingSoon" class="size-3" :stroke-width="3" />
          </span>
          <span class="flex min-w-0 flex-col gap-0.5">
            <span class="text-[13px] font-medium">{{ mod.name }}</span>
            <span class="text-xs text-pretty text-muted-foreground">{{ mod.description }}</span>
            <span
              v-if="tag(mod)"
              :class="cn('text-[11px]', mod.core ? 'text-success-strong' : 'text-faint')"
              >{{ tag(mod) }}</span
            >
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
