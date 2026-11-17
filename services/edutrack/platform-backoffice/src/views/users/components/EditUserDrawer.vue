<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { useForm } from 'vee-validate';
import { computed, watch } from 'vue';
import { toast } from 'vue-sonner';

import { useRolesQuery, useUpdateUserMutation } from '@/api/services/users';
import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormSelect from '@edutrack/app-kit/components/form/FormSelect.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { editUserSchema, SUPPORT_TEAM_OPTIONS } from '@/schema/user';
import { useAuthStore } from '@/stores/auth';
import { PERMISSION_AREAS, type PlatformUser, type Role } from '@/types';

const props = defineProps<{ user: PlatformUser }>();
const open = defineModel<boolean>('open', { required: true });

const { data: roles } = useRolesQuery();
const update = useUpdateUserMutation(() => props.user.id);
const confirm = useConfirm();

const initialValues = () => ({
  firstName: props.user.firstName,
  lastName: props.user.lastName,
  email: props.user.email,
  phone: props.user.phone,
  roleId: props.user.roleId,
  supportTeam: props.user.supportTeam ?? ('' as const),
});
const { handleSubmit, defineField, meta, resetForm } = useForm({
  validationSchema: editUserSchema,
  initialValues: initialValues(),
});
const [roleId] = defineField('roleId');
const [email] = defineField('email');
watch(open, (isOpen) => isOpen && resetForm({ values: initialValues() }));

const roleChoices = computed(() =>
  (roles.value ?? []).map((r) => ({ value: r.id, label: r.name, description: r.description })),
);
const roleChanged = computed(() => roleId.value !== props.user.roleId);
const emailChanged = computed(
  () => (email.value ?? '').trim().toLowerCase() !== props.user.email.toLowerCase(),
);
const auth = useAuthStore();

/** What changing the sign-in email does, for the confirmation. */
function emailDetails(next: string): [string, string][] {
  if (props.user.status === 'Invited')
    return [
      ['New email', next],
      ['Invitation', 'The next resend goes to the new address'],
    ];
  return [
    ['Current email', props.user.email],
    ['New email', next],
    ['Signs in with', `${next}, straight away. Their password stays the same.`],
    ['Notified', 'Both addresses get an email about the change'],
  ];
}

/** Permissions the user gains and loses moving from one role to another, e.g. "Schools Create". */
function permissionDiff(from: Role, to: Role) {
  const list = (a: Role, b: Role) =>
    PERMISSION_AREAS.flatMap((area) =>
      (b.permissions[area] ?? [])
        .filter((p) => !(a.permissions[area] ?? []).includes(p))
        .map((p) => `${area} ${p}`),
    );
  const summary = (items: string[]) =>
    items.length
      ? items.slice(0, 6).join(', ') + (items.length > 6 ? ` +${items.length - 6} more` : '')
      : 'Nothing';
  return { gains: summary(list(from, to)), loses: summary(list(to, from)) };
}

const save = handleSubmit(async (values) => {
  const payload = { ...values, phone: values.phone ?? '' };
  const emailRows = emailChanged.value ? emailDetails(values.email) : [];
  if (roleChanged.value) {
    const from = roles.value?.find((r) => r.id === props.user.roleId);
    const to = roles.value?.find((r) => r.id === values.roleId);
    if (!from || !to) return;
    const diff = permissionDiff(from, to);
    const confirmed = await confirm({
      title: 'Change role',
      description: `This will change the permissions available to ${props.user.firstName} ${props.user.lastName}.`,
      details: [
        ['Current role', from.name],
        ['New role', to.name],
        ['Gains', diff.gains],
        ['Loses', diff.loses],
        ['Takes effect', 'The next time they load a page'],
        ...emailRows,
      ],
      confirmLabel: 'Update role',
      action: () => update.mutateAsync(payload),
    });
    if (!confirmed) return;
  } else if (emailChanged.value) {
    const confirmed = await confirm({
      title: 'Change sign-in email',
      description: `${props.user.firstName} ${props.user.lastName} will sign in with the new address. The old one stops working.`,
      details: emailRows,
      confirmLabel: 'Change email',
      action: () => update.mutateAsync(payload),
    });
    if (!confirmed) return;
  } else {
    await update.mutateAsync(payload);
  }
  // Editing yourself: the account menu shows the new name and email at once.
  if (props.user.id === auth.user?.id)
    auth.updateUser({
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
    });
  open.value = false;
  toast.success('Changes saved.');
});
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="`Edit ${user.firstName} ${user.lastName}`"
    description="Changes are logged. A new email takes over sign-in at once, and both addresses are told."
    :dirty="meta.dirty"
  >
    <form id="edit-user" class="flex flex-col gap-3.5" novalidate @submit="save">
      <FormInput name="firstName" label="First name" required placeholder="Emeka" />
      <FormInput name="lastName" label="Last name" required placeholder="Osegbo" />
      <FormInput
        name="email"
        label="Email"
        type="email"
        required
        placeholder="osegbo.emeka@edutrack.ng"
      />
      <FormInput name="phone" label="Phone" type="tel" placeholder="0803 555 0123" />
      <FormSelect
        name="supportTeam"
        label="Support team"
        :options="SUPPORT_TEAM_OPTIONS"
        hint="Tickets they own move to this team. Escalations go to the least-busy person in a team."
      />
      <div class="flex flex-col gap-1.5 text-[13px] font-medium">
        <span>Role</span>
        <ChoiceCards
          :model-value="roleId ?? ''"
          :choices="roleChoices"
          label="Role"
          @update:model-value="roleId = $event"
        />
        <span v-if="roleChanged" class="text-xs font-normal text-warning-strong">
          Changing this user's role will update their access to the Platform Back Office.
        </span>
      </div>
    </form>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button type="submit" form="edit-user" :disabled="update.isPending.value">
        <Spinner v-if="update.isPending.value" />Save changes
      </Button>
    </template>
  </SideDrawer>
</template>
