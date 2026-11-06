<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import { useAddGuardianMutation, useStudentsQuery } from '@/api/services/students';

const props = defineProps<{ studentId?: string }>();
const open = defineModel<boolean>('open', { required: true });
const { data: students } = useStudentsQuery({ pageSize: 500 });
const add = useAddGuardianMutation();

const blank = () => ({
  name: '',
  phone: '',
  email: '',
  relationship: 'Mother',
  paysFees: true,
  invite: true,
  studentIds: props.studentId ? [props.studentId] : ([] as string[]),
});
const form = reactive(blank());
const showErrors = ref(false);
const serverError = ref('');
const pick = ref('');
watch(open, (o) => {
  if (!o) return;
  Object.assign(form, blank());
  showErrors.value = false;
  serverError.value = '';
});

const enrolled = computed(() =>
  (students.value?.data ?? []).filter((s) => ['Active', 'Incomplete profile'].includes(s.status)),
);
const label = (id: string) => {
  const s = enrolled.value.find((x) => x.id === id);
  return s ? `${s.name} · ${s.className || 'awaiting arm'}` : id;
};
const options = computed(() =>
  enrolled.value.filter((s) => !form.studentIds.includes(s.id)).map((s) => label(s.id)),
);
watch(pick, (v) => {
  const s = enrolled.value.find((x) => label(x.id) === v);
  if (s) form.studentIds.push(s.id);
  pick.value = '';
});

const errors = computed(() => {
  const e: Record<string, string> = {};
  if (!form.name.trim()) e.name = 'Enter the guardian’s full name.';
  if (!/^(\+234|0)[789][01]\d{8}$/.test(form.phone.replace(/[\s-]/g, '')))
    e.phone = 'Enter a Nigerian phone number, e.g. 0803 555 0193';
  if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email))
    e.email = 'Enter a valid email.';
  if (!form.studentIds.length) e.children = 'Choose at least one child.';
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);

async function save() {
  showErrors.value = true;
  if (Object.keys(errors.value).length) return;
  serverError.value = '';
  try {
    const g = await add.mutateAsync({ ...form, name: form.name.trim(), email: form.email.trim() });
    open.value = false;
    toast.success(`${g.name} added${form.invite ? ' and invited to the parent portal' : ''}.`);
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    title="Add guardian"
    description="Phone and email are checked against existing guardians first, so one parent keeps one record."
  >
    <div class="flex flex-col gap-4">
      <InlineNotice
        v-if="serverError"
        tone="error"
        title="Couldn’t add the guardian"
        :description="serverError"
        role="alert"
      />
      <FieldShell id="gd-name" label="Full name" required :error="err('name')">
        <Input id="gd-name" v-model="form.name" placeholder="e.g. Mrs. Ada Nwosu" />
      </FieldShell>
      <div class="grid gap-4 sm:grid-cols-2">
        <FieldShell id="gd-phone" label="Phone" required :error="err('phone')">
          <Input id="gd-phone" v-model="form.phone" type="tel" placeholder="0803 555 0193" />
        </FieldShell>
        <FieldShell id="gd-email" label="Email" :error="err('email')">
          <Input id="gd-email" v-model="form.email" type="email" placeholder="name@example.com" />
        </FieldShell>
      </div>
      <FieldShell id="gd-rel" label="Relationship">
        <select
          id="gd-rel"
          v-model="form.relationship"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
        >
          <option v-for="r in ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sponsor']" :key="r">
            {{ r }}
          </option>
        </select>
      </FieldShell>
      <div class="flex flex-col gap-1.5">
        <span class="text-[13px] font-medium"
          >Children <span class="text-destructive">*</span></span
        >
        <ul v-if="form.studentIds.length" class="flex flex-col gap-1">
          <li
            v-for="id in form.studentIds"
            :key="id"
            class="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[13px]"
          >
            {{ label(id) }}
            <button
              type="button"
              class="text-xs text-destructive hover:underline"
              @click="form.studentIds = form.studentIds.filter((x) => x !== id)"
            >
              Remove
            </button>
          </li>
        </ul>
        <p v-if="err('children')" role="alert" class="text-xs text-destructive">
          {{ err('children') }}
        </p>
      </div>
      <FieldShell id="gd-child" label="Add a child">
        <select id="gd-child" v-model="pick" class="h-9 rounded-md border bg-card px-2.5 text-sm">
          <option value="">Choose a student…</option>
          <option v-for="o in options" :key="o">{{ o }}</option>
        </select>
      </FieldShell>
      <label class="flex items-center gap-2 text-[13px]"
        ><Checkbox v-model="form.paysFees" />Responsible for fees</label
      >
      <label class="flex items-center gap-2 text-[13px]"
        ><Checkbox v-model="form.invite" />Invite to parent portal</label
      >
    </div>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button :disabled="add.isPending.value" @click="save"
        ><Spinner v-if="add.isPending.value" /> Add guardian</Button
      >
    </template>
  </SideDrawer>
</template>
