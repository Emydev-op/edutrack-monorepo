<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import { useBranchesQuery, useRolesQuery, useUserAccessMutation } from '@/api/services/school';
import ChipGroup from '@/components/school/ChipGroup.vue';
import type { AccessScope, SchoolUserDetail } from '@/types';

const props = defineProps<{ user: SchoolUserDetail }>();
const open = defineModel<boolean>('open', { required: true });

const { data: roles } = useRolesQuery();
const { data: branches } = useBranchesQuery();
const save = useUserAccessMutation(() => props.user.id);

const initial = () => ({
  roles: [...props.user.roles],
  scope: props.user.scope as AccessScope,
  branches: [...props.user.branches],
});
const form = reactive(initial());
const showErrors = ref(false);
const serverError = ref('');
watch(open, (o) => {
  if (!o) return;
  Object.assign(form, initial());
  showErrors.value = false;
  serverError.value = '';
});

const activeBranches = computed(() =>
  (branches.value?.branches ?? []).filter((b) => b.status === 'Active').map((b) => b.name),
);
const errors = computed(() => {
  const e: Record<string, string> = {};
  if (!form.roles.length) e.roles = 'Keep at least one role, or suspend the account instead.';
  else if (props.user.isYou && !form.roles.includes('School Admin'))
    e.roles = 'You can’t remove your own School Admin role.';
  if (form.scope === 'Branch' && !form.branches.length) e.branches = 'Choose at least one branch.';
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);
const added = computed(() => form.roles.filter((r) => !props.user.roles.includes(r)));
const removed = computed(() => props.user.roles.filter((r) => !form.roles.includes(r)));
const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(initial()));

async function submit() {
  showErrors.value = true;
  if (Object.keys(errors.value).length) return;
  serverError.value = '';
  try {
    await save.mutateAsync({
      roles: form.roles,
      scope: form.scope,
      branches: form.scope === 'Branch' ? form.branches : [],
    });
    open.value = false;
    toast.success(`${props.user.name}’s access updated.`);
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="`Edit access · ${user.name}`"
    description="Changes take effect on their next page load."
    :dirty="dirty"
  >
    <div class="flex flex-col gap-4.5">
      <InlineNotice
        v-if="serverError"
        tone="error"
        title="Something went wrong"
        :description="serverError"
        role="alert"
      />
      <ChipGroup
        v-model="form.roles"
        label="System roles"
        required
        :options="(roles ?? []).map((r) => r.name)"
        :error="err('roles')"
      />
      <ChoiceCards
        v-model="form.scope"
        label="Scope"
        :columns="2"
        :choices="[
          { value: 'School', label: 'School', description: 'All branches' },
          { value: 'Branch', label: 'Branch', description: 'Only the branches you choose' },
        ]"
      />
      <ChipGroup
        v-if="form.scope === 'Branch'"
        v-model="form.branches"
        label="Branches"
        required
        :options="activeBranches"
        :error="err('branches')"
      />
      <p
        v-if="added.length || removed.length"
        class="rounded-md bg-muted px-3 py-2.5 text-[13px]"
        aria-live="polite"
      >
        {{
          [
            added.length ? `Adds ${added.join(', ')}` : '',
            removed.length ? `Removes ${removed.join(', ')}` : '',
          ]
            .filter(Boolean)
            .join(' · ')
        }}
      </p>
    </div>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button :disabled="save.isPending.value" @click="submit">
        <Spinner v-if="save.isPending.value" />
        {{ save.isPending.value ? 'Saving…' : 'Save access' }}
      </Button>
    </template>
  </SideDrawer>
</template>
