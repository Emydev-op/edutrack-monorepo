<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import { useClassesQuery } from '@/api/services/academics';
import { useInviteGuardiansMutation } from '@/api/services/portal-accounts';
import { useBranchesQuery } from '@/api/services/school';

/** Bulk Parent Portal invitations: every guardian without an account, optionally narrowed. */
const open = defineModel<boolean>('open', { required: true });
const { data: classes } = useClassesQuery();
const { data: branches } = useBranchesQuery();
const invite = useInviteGuardiansMutation();

const form = reactive({ className: '', branchId: '' });
const serverError = ref('');
watch(open, (o) => {
  if (!o) return;
  Object.assign(form, { className: '', branchId: '' });
  serverError.value = '';
});

const classOptions = computed(() => {
  const names = new Set<string>();
  for (const level of classes.value?.levels ?? []) {
    names.add(level.name);
    for (const arm of level.arms) names.add(arm.name);
  }
  return [...names];
});
const branchOptions = computed(() =>
  (branches.value?.branches ?? []).filter((b) => b.status === 'Active'),
);

async function send() {
  serverError.value = '';
  try {
    const result = await invite.mutateAsync({
      className: form.className || undefined,
      branchId: form.branchId || undefined,
    });
    open.value = false;
    const skipped = result.skipped.length
      ? `Not invited: ${result.skipped.map((s) => `${s.name} (${s.reason.replace(/\.$/, '')})`).join(', ')}.`
      : undefined;
    if (result.invited)
      toast.success(
        messageOf(result, `${result.invited} invitation${result.invited === 1 ? '' : 's'} sent.`),
        { description: skipped },
      );
    else toast.error('Nobody to invite.', { description: skipped });
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'We couldn’t send the invitations. Try again.');
  }
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    title="Invite guardians"
    description="Sends a Parent Portal invitation to every guardian who doesn’t have an account yet: by SMS, and by email when they have one. Each parent keeps one login, even with children at another school."
  >
    <div class="flex flex-col gap-4">
      <InlineNotice
        v-if="serverError"
        tone="error"
        title="Couldn’t send the invitations"
        :description="serverError"
        role="alert"
      />
      <FieldShell id="ig-class" label="Only guardians of children in">
        <select
          id="ig-class"
          v-model="form.className"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
        >
          <option value="">Every class</option>
          <option v-for="c in classOptions" :key="c">{{ c }}</option>
        </select>
      </FieldShell>
      <FieldShell v-if="branchOptions.length > 1" id="ig-branch" label="Branch">
        <select
          id="ig-branch"
          v-model="form.branchId"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
        >
          <option value="">Every branch</option>
          <option v-for="b in branchOptions" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </FieldShell>
      <p class="text-xs text-faint">
        Guardians with no phone number or email, or whose children have all left, are skipped.
      </p>
    </div>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button :disabled="invite.isPending.value" @click="send"
        ><Spinner v-if="invite.isPending.value" /> Send invitations</Button
      >
    </template>
  </SideDrawer>
</template>
