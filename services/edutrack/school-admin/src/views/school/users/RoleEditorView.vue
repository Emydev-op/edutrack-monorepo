<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import {
  useCreateRoleMutation,
  useDeleteRoleMutation,
  useRoleQuery,
  useRolesQuery,
  useUpdateRoleMutation,
} from '@/api/services/school';
import ChipGroup from '@/components/school/ChipGroup.vue';
import { ACTION_LABELS, PERMISSION_MODULES, ROLE_SCOPES } from '@/config/permissions';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';
import type { Role, RoleScope } from '@/types';

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const layout = useLayoutStore();

const id = computed(() => (route.params.id as string | undefined) ?? '');
const isNew = computed(() => !id.value);
const fromId = computed(() =>
  isNew.value ? ((route.query.from as string | undefined) ?? '') : '',
);

const { data: existing, isPending, isError } = useRoleQuery(id);
const { data: source } = useRoleQuery(fromId);
const { data: roles } = useRolesQuery();
const create = useCreateRoleMutation();
const update = useUpdateRoleMutation(id);
const remove = useDeleteRoleMutation(id);

const readOnly = computed(() => existing.value?.type === 'Predefined');
watch(existing, (r) => layout.setRecordLabel(r?.name ?? null), { immediate: true });

const blank = () => ({
  name: '',
  scope: 'Branch' as RoleScope,
  description: '',
  permissions: {} as Record<string, string[]>,
});
const fromRole = (r: Role, copy = false) => ({
  name: copy ? `${r.name} (copy)` : r.name,
  scope: r.scope,
  description: r.description,
  permissions: structuredClone({ ...r.permissions }),
});
const form = reactive(blank());
const initial = ref(JSON.stringify(blank()));
function load() {
  const next = isNew.value
    ? source.value
      ? fromRole(source.value, true)
      : blank()
    : existing.value
      ? fromRole(existing.value)
      : null;
  if (!next) return;
  Object.assign(form, next);
  initial.value = JSON.stringify(next);
}
watch([existing, source, () => route.fullPath], load, { immediate: true });

const dirty = computed(() => JSON.stringify(form) !== initial.value);
const leaving = ref(false);
useUnsavedChanges(() => dirty.value && !leaving.value && !readOnly.value);

const showErrors = ref(false);
const serverError = ref('');
const errors = computed(() => {
  const e: Record<string, string> = {};
  const name = form.name.trim();
  if (!name) e.name = 'Name the role.';
  else if (
    roles.value?.some((r) => r.id !== id.value && r.name.toLowerCase() === name.toLowerCase())
  )
    e.name = 'A role with this name already exists.';
  if (!Object.values(form.permissions).some((a) => a?.length))
    e.permissions = 'Give the role at least one permission.';
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);

const permissionsOf = (key: string) =>
  computed({
    get: () => (form.permissions[key] ?? []).map((a) => ACTION_LABELS[a] ?? a),
    set: (labels: string[]) => {
      const mod = PERMISSION_MODULES.find((m) => m.key === key)!;
      form.permissions[key] = mod.actions.filter((a) => labels.includes(ACTION_LABELS[a] ?? a));
    },
  });
const modules = PERMISSION_MODULES.map((m) => ({ ...m, model: permissionsOf(m.key) }));
const toggleAll = (key: string, actions: readonly string[]) => {
  const all = actions.every((a) => form.permissions[key]?.includes(a));
  form.permissions[key] = all ? [] : [...actions];
};
const count = computed(() => Object.values(form.permissions).flat().length);

async function save() {
  showErrors.value = true;
  if (Object.keys(errors.value).length) return;
  serverError.value = '';
  const payload = {
    name: form.name.trim(),
    scope: form.scope,
    description: form.description.trim(),
    permissions: form.permissions,
  };
  const go = async () => {
    try {
      if (isNew.value) {
        const r = await create.mutateAsync(payload);
        leaving.value = true;
        toast.success('Role created. Assign it from a user’s access settings.');
        await router.push({ name: routesPath.school.role.name, params: { id: r.id } });
      } else {
        await update.mutateAsync(payload);
        initial.value = JSON.stringify(form);
        const n = existing.value?.users ?? 0;
        toast.success(
          n
            ? `Role saved. ${n} user${n === 1 ? '’s' : 's’'} access updated.`
            : 'Role saved. No users have this role yet.',
        );
      }
    } catch (e) {
      serverError.value = getApiErrorMessage(
        e,
        'The server didn’t respond. Nothing was saved. Try again.',
      );
    }
  };
  const holders = existing.value?.users ?? 0;
  if (!isNew.value && holders) {
    const before = Object.values(existing.value!.permissions).flat().length;
    void confirm({
      title: `Update access for ${holders} user${holders > 1 ? 's' : ''}?`,
      details: [
        ['Permissions', `${before} → ${count.value}`],
        ['Takes effect', 'Immediately, on their next page load'],
        ['Logged', 'Yes · in the audit trail'],
      ],
      confirmLabel: 'Save role',
      action: go,
    });
  } else await go();
}

const duplicate = () =>
  router.push({ name: routesPath.school.roleNew.name, query: { from: existing.value!.id } });

function destroy() {
  const r = existing.value!;
  if (r.users)
    return void confirm({
      title: `Can’t delete ${r.name}`,
      description: `${r.users} user${r.users > 1 ? 's have' : ' has'} this role. Remove it from them first.`,
      confirmLabel: 'View users',
      action: () => router.push({ name: routesPath.school.users.name }),
    });
  void confirm({
    title: `Delete the ${r.name} role?`,
    details: [
      ['Users', 'None assigned'],
      ['Reversible', 'No. You’d need to recreate it.'],
    ],
    confirmLabel: 'Delete role',
    tone: 'destructive',
    action: async () => {
      await remove.mutateAsync();
      leaving.value = true;
      toast.success('Role deleted.');
      await router.push({ name: routesPath.school.roles.name });
    },
  });
}

const saving = computed(() => create.isPending.value || update.isPending.value);
</script>

<template>
  <template v-if="!isNew && isPending"
    ><Skeleton class="h-16 w-1/2" /><Skeleton class="h-96"
  /></template>

  <EmptyState
    v-else-if="!isNew && (isError || !existing)"
    illustrated
    title="This role doesn’t exist"
    description="It may have been deleted."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.school.roles.name }">All roles</RouterLink></Button
    >
  </EmptyState>

  <template v-else>
    <PageHeader
      :title="isNew ? 'Create a role' : existing!.name"
      :status="isNew ? undefined : existing!.type"
      :description="
        isNew
          ? 'A role is a set of permissions. Assign it to users with a scope such as a branch or section.'
          : `${existing!.users} user${existing!.users === 1 ? '' : 's'} · default scope ${existing!.scope}`
      "
    >
      <template v-if="!isNew" #actions>
        <template v-if="readOnly"
          ><Button @click="duplicate">Duplicate to customise</Button></template
        >
        <template v-else>
          <Button variant="outline" class="text-destructive" @click="destroy">Delete role</Button>
          <Button variant="outline" @click="duplicate">Duplicate</Button>
        </template>
      </template>
    </PageHeader>

    <InlineNotice
      v-if="readOnly"
      tone="info"
      title="Predefined roles can’t be edited"
      description="They’re maintained by Edutrack so they stay consistent across schools. Duplicate it to make a custom version."
    />
    <InlineNotice
      v-if="serverError"
      tone="error"
      title="We couldn’t save the role"
      :description="serverError"
      role="alert"
    />

    <SectionCard title="Role details">
      <div class="grid gap-4 sm:grid-cols-2">
        <FieldShell id="role-name" label="Role name" required :error="err('name')">
          <Input
            id="role-name"
            v-model="form.name"
            placeholder="e.g. Admissions Officer"
            :disabled="readOnly"
            :aria-invalid="!!err('name')"
          />
        </FieldShell>
        <FieldShell id="role-scope" label="Default scope" hint="Can be narrowed per user.">
          <select
            id="role-scope"
            v-model="form.scope"
            :disabled="readOnly"
            class="h-9 rounded-md border bg-card px-2.5 text-sm disabled:bg-muted"
          >
            <option v-for="s in ROLE_SCOPES" :key="s" :value="s">{{ s }}</option>
          </select>
        </FieldShell>
        <FieldShell id="role-desc" label="Purpose" class="sm:col-span-2">
          <Textarea
            id="role-desc"
            v-model="form.description"
            rows="2"
            placeholder="What this role is for"
            :disabled="readOnly"
          />
        </FieldShell>
      </div>
    </SectionCard>

    <SectionCard
      title="Permissions"
      :description="
        readOnly
          ? 'Read-only.'
          : 'Choose what users with this role can do. Hidden actions don’t appear in their navigation.'
      "
    >
      <p v-if="err('permissions')" role="alert" class="mb-3 text-xs text-destructive">
        {{ err('permissions') }}
      </p>
      <div class="flex flex-col divide-y divide-divider">
        <div
          v-for="m in modules"
          :key="m.key"
          class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
        >
          <div class="flex flex-wrap items-baseline gap-2">
            <span class="text-sm font-semibold">{{ m.label }}</span>
            <span class="text-xs text-faint">{{ m.description }}</span>
            <span class="ml-auto text-xs text-muted-foreground tabular-nums"
              >{{ form.permissions[m.key]?.length ?? 0 }} of {{ m.actions.length }}</span
            >
            <button
              v-if="!readOnly"
              type="button"
              class="text-xs font-medium text-primary hover:underline"
              @click="toggleAll(m.key, m.actions)"
            >
              {{
                m.actions.every((a) => form.permissions[m.key]?.includes(a))
                  ? 'Clear'
                  : 'Select all'
              }}
            </button>
          </div>
          <ChipGroup
            v-model="m.model.value"
            :label="`${m.label} permissions`"
            class="[&>span:first-child]:sr-only"
            :options="m.actions.map((a) => ACTION_LABELS[a] ?? a)"
            :disabled="readOnly"
          />
        </div>
      </div>
    </SectionCard>

    <div
      v-if="!readOnly"
      class="sticky bottom-0 flex items-center gap-2.5 border-t bg-background py-3"
    >
      <span class="text-xs" :class="dirty ? 'text-warning-strong' : 'text-faint'">{{
        dirty ? 'Unsaved changes' : 'No changes yet'
      }}</span>
      <Button
        variant="ghost"
        class="ml-auto"
        @click="router.push({ name: routesPath.school.roles.name })"
        >Cancel</Button
      >
      <Button :disabled="saving" @click="save">
        <Spinner v-if="saving" />
        {{ saving ? 'Saving…' : isNew ? 'Create role' : 'Save role' }}
      </Button>
    </div>
  </template>
</template>
