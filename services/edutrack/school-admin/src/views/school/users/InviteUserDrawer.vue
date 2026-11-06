<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import {
  useBranchesQuery,
  useInviteUserMutation,
  useRolesQuery,
  useStaffOptionsQuery,
} from '@/api/services/school';
import ChipGroup from '@/components/school/ChipGroup.vue';
import { routesPath } from '@/router/routes-path';
import type { AccessScope } from '@/types';

/** Pre-fill when inviting someone again (e.g. a deactivated account). */
const props = defineProps<{ preset?: { staffId?: string; email?: string; roles?: string[] } }>();
const open = defineModel<boolean>('open', { required: true });

const router = useRouter();
const { data: staff } = useStaffOptionsQuery();
const { data: roles } = useRolesQuery();
const { data: branches } = useBranchesQuery();
const invite = useInviteUserMutation();

const blank = () => ({
  who: 'existing',
  staffId: props.preset?.staffId ?? '',
  name: '',
  email: props.preset?.email ?? '',
  roles: [...(props.preset?.roles ?? [])],
  scope: 'School' as AccessScope,
  branches: [] as string[],
});
const form = reactive(blank());
const showErrors = ref(false);
const serverError = ref('');
watch(open, (o) => {
  if (!o) return;
  Object.assign(form, blank());
  showErrors.value = false;
  serverError.value = '';
});

const candidates = computed(() =>
  (staff.value ?? []).filter((s) => s.account === 'No account' || s.account === 'Deactivated'),
);
const roleNames = computed(() =>
  (roles.value ?? []).map((r) => r.name).filter((n) => n !== 'Owner'),
);
const activeBranches = computed(() =>
  (branches.value?.branches ?? []).filter((b) => b.status === 'Active').map((b) => b.name),
);

const errors = computed(() => {
  const e: Record<string, string> = {};
  if (form.who === 'existing' && !form.staffId) e.staffId = 'Choose the staff member.';
  if (form.who === 'new' && !form.name.trim()) e.name = 'Enter their full name.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()))
    e.email = 'Enter a valid email address.';
  if (!form.roles.length) e.roles = 'Choose at least one role.';
  if (form.scope === 'Branch' && !form.branches.length) e.branches = 'Choose at least one branch.';
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);
const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(blank()));

async function send() {
  showErrors.value = true;
  if (Object.keys(errors.value).length) return;
  serverError.value = '';
  try {
    const user = await invite.mutateAsync({
      staffId: form.who === 'existing' ? form.staffId : null,
      name: form.name.trim(),
      email: form.email.trim(),
      roles: form.roles,
      scope: form.scope,
      branches: form.scope === 'Branch' ? form.branches : [],
    });
    open.value = false;
    toast.success(`Invitation sent to ${user.email}.`);
    await router.push({ name: routesPath.school.invitations.name });
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'We couldn’t send the invitation. Try again.');
  }
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    title="Invite a staff user"
    description="They’ll get an email to set a password. Invitations expire after 7 days."
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
      <InlineNotice
        v-else-if="showErrors && Object.keys(errors).length"
        tone="error"
        :title="`Fix ${Object.keys(errors).length} field${Object.keys(errors).length > 1 ? 's' : ''}`"
        description="Your entries are kept."
      />
      <ChoiceCards
        v-model="form.who"
        label="Who are you inviting?"
        :columns="2"
        :choices="[
          {
            value: 'existing',
            label: 'Existing staff record',
            description: 'Someone already in the Staff directory',
          },
          { value: 'new', label: 'New person', description: 'Creates a staff record too' },
        ]"
      />
      <FieldShell
        v-if="form.who === 'existing'"
        id="invite-staff"
        label="Staff member"
        required
        :error="err('staffId')"
      >
        <select
          id="invite-staff"
          v-model="form.staffId"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
          :aria-invalid="!!err('staffId')"
        >
          <option value="">Choose…</option>
          <option v-for="s in candidates" :key="s.id" :value="s.id">
            {{ s.name }} · {{ s.position }}
          </option>
        </select>
      </FieldShell>
      <FieldShell v-else id="invite-name" label="Full name" required :error="err('name')">
        <Input
          id="invite-name"
          v-model="form.name"
          placeholder="e.g. Mrs. Bisi Ade"
          :aria-invalid="!!err('name')"
        />
      </FieldShell>
      <FieldShell id="invite-email" label="Work email" required :error="err('email')">
        <Input
          id="invite-email"
          v-model="form.email"
          type="email"
          placeholder="name@yourschool.ng"
          :aria-invalid="!!err('email')"
        />
      </FieldShell>
      <ChipGroup
        v-model="form.roles"
        label="System roles"
        required
        :options="roleNames"
        :error="err('roles')"
        hint="Roles decide what they can access. Their position is set in the Organogram."
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
    </div>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button :disabled="invite.isPending.value" @click="send">
        <Spinner v-if="invite.isPending.value" />
        {{ invite.isPending.value ? 'Sending…' : 'Send invitation' }}
      </Button>
    </template>
  </SideDrawer>
</template>
