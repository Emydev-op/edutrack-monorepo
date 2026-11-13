<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { MonitorIcon, SmartphoneIcon } from '@lucide/vue';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import PasswordChecklist from '@edutrack/app-kit/components/form/PasswordChecklist.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { meetsPasswordPolicy } from '@edutrack/app-kit/lib/password';

import {
  useChangePasswordMutation,
  useEndSessionMutation,
  useSaveSignInRulesMutation,
  useSecurityQuery,
  useSignOutOthersMutation,
} from '@/api/services/settings';
import type { SessionRow, SignInRules } from '@/types';
import { fmtDay, todayIso } from '@/views/finance/finance-tones';

import { fmtDateTime, useSettingsDirtyGuard } from '../settings-shared';

const { data, isPending, isError, refetch } = useSecurityQuery();
const confirm = useConfirm();

/* ---------- This device ---------- */

function thisDevice() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /iPhone|iPad/.test(ua)
    ? 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} on ${os}` : browser;
}
const deviceName = (s: SessionRow) => (s.current ? `${thisDevice()} · this device` : s.device);
const isPhone = (s: SessionRow) => /iPhone|Android/.test(s.current ? thisDevice() : s.device);
const lastSeen = (s: SessionRow) => (s.current ? 'Active now' : fmtDateTime(s.lastActive));

const expiresSoon = computed(() => {
  const exp = data.value?.account.passwordExpiresOn;
  if (!exp) return false;
  const days =
    (new Date(`${exp}T00:00:00`).getTime() - new Date(`${todayIso()}T00:00:00`).getTime()) /
    86_400_000;
  return days <= 14;
});

/* ---------- Change password ---------- */

const changePassword = useChangePasswordMutation();
const pw = reactive({ current: '', next: '', repeat: '' });
const pwTouched = ref(false);
const pwServerError = ref('');
const pwErrors = computed(() => {
  const e: Partial<Record<'current' | 'next' | 'repeat', string>> = {};
  if (!pw.current) e.current = 'Enter your current password.';
  if (!meetsPasswordPolicy(pw.next)) e.next = 'The new password doesn’t meet every rule below.';
  else if (pw.next === pw.current) e.next = 'Choose a password you haven’t just used.';
  if (!pw.repeat) e.repeat = 'Type the new password again.';
  else if (pw.repeat !== pw.next) e.repeat = 'The passwords don’t match.';
  return e;
});
const pwErr = (k: 'current' | 'next' | 'repeat') =>
  k === 'current' && pwServerError.value
    ? pwServerError.value
    : pwTouched.value
      ? pwErrors.value[k]
      : undefined;
const pwDirty = computed(() => !!(pw.current || pw.next || pw.repeat));
watch(
  () => pw.current,
  () => (pwServerError.value = ''),
);

async function submitPassword() {
  pwTouched.value = true;
  pwServerError.value = '';
  if (Object.keys(pwErrors.value).length) return;
  try {
    const { signedOut } = await changePassword.mutateAsync({ current: pw.current, next: pw.next });
    Object.assign(pw, { current: '', next: '', repeat: '' });
    pwTouched.value = false;
    toast.success(
      signedOut
        ? `Password updated. ${signedOut} other device${signedOut === 1 ? ' was' : 's were'} signed out.`
        : 'Password updated.',
    );
  } catch (e) {
    pwServerError.value = getApiErrorMessage(e, 'Your password wasn’t changed. Try again.');
  }
}

/* ---------- Sessions ---------- */

const endSession = useEndSessionMutation();
const signOutOthers = useSignOutOthersMutation();
const others = computed(() => data.value?.sessions.filter((s) => !s.current) ?? []);

function endOne(s: SessionRow) {
  void confirm({
    title: `Sign out of ${s.device}?`,
    description: 'Anyone using that device will need your password to sign in again.',
    confirmLabel: 'Sign out device',
    tone: 'destructive',
    action: async () => {
      await endSession.mutateAsync(s.id);
      toast.success(`Signed out of ${s.device}.`);
    },
  });
}

function endOthers() {
  const n = others.value.length;
  void confirm({
    title: `Sign out of ${n} other device${n === 1 ? '' : 's'}?`,
    description: 'You stay signed in here. The other devices will need your password again.',
    confirmLabel: 'Sign out others',
    tone: 'destructive',
    action: async () => {
      await signOutOthers.mutateAsync();
      toast.success(`Signed out of ${n} other device${n === 1 ? '' : 's'}.`);
    },
  });
}

/* ---------- Staff sign-in rules ---------- */

const saveRules = useSaveSignInRulesMutation();
type RuleForm = Record<keyof SignInRules, string>;
const rules = reactive<RuleForm>({
  idleTimeoutMinutes: '',
  lockoutAttempts: '',
  lockoutMinutes: '',
  passwordExpiryDays: '',
});
const toForm = (r: SignInRules): RuleForm => ({
  idleTimeoutMinutes: String(r.idleTimeoutMinutes),
  lockoutAttempts: String(r.lockoutAttempts),
  lockoutMinutes: String(r.lockoutMinutes),
  passwordExpiryDays: String(r.passwordExpiryDays),
});
const savedRules = ref('');
watch(
  () => data.value?.rules,
  (r) => {
    if (!r) return;
    const next = JSON.stringify(toForm(r));
    // Keep the user's edits when an unrelated refresh (e.g. signing out a device) arrives.
    if (savedRules.value && JSON.stringify(rules) !== savedRules.value) {
      savedRules.value = next;
      return;
    }
    Object.assign(rules, toForm(r));
    savedRules.value = next;
  },
  { immediate: true },
);
const rulesDirty = computed(() => !!savedRules.value && JSON.stringify(rules) !== savedRules.value);

const RULES: {
  key: keyof SignInRules;
  label: string;
  hint: string;
  min: number;
  max: number;
  unit: string;
}[] = [
  {
    key: 'idleTimeoutMinutes',
    label: 'Sign out after idle',
    hint: '5–240 minutes without activity.',
    min: 5,
    max: 240,
    unit: 'minutes',
  },
  {
    key: 'lockoutAttempts',
    label: 'Failed attempts before lockout',
    hint: '3–10 wrong passwords in a row.',
    min: 3,
    max: 10,
    unit: 'attempts',
  },
  {
    key: 'lockoutMinutes',
    label: 'Lockout length',
    hint: '5–1,440 minutes before they can try again.',
    min: 5,
    max: 1440,
    unit: 'minutes',
  },
  {
    key: 'passwordExpiryDays',
    label: 'Password expiry',
    hint: '30–365 days, or 0 so passwords never expire.',
    min: 30,
    max: 365,
    unit: 'days',
  },
];
const ruleErrors = computed(() => {
  const e: Partial<Record<keyof SignInRules, string>> = {};
  for (const r of RULES) {
    const raw = rules[r.key].trim();
    const v = Number(raw);
    if (r.key === 'passwordExpiryDays' && raw === '0') continue;
    if (!/^\d+$/.test(raw) || v < r.min || v > r.max)
      e[r.key] = `Enter a whole number from ${r.min} to ${r.max.toLocaleString('en-NG')}.`;
  }
  return e;
});
const rulesServerError = ref('');

async function submitRules() {
  if (Object.keys(ruleErrors.value).length) return;
  rulesServerError.value = '';
  const body = Object.fromEntries(
    RULES.map((r) => [r.key, Number(rules[r.key])]),
  ) as unknown as SignInRules;
  try {
    const view = await saveRules.mutateAsync(body);
    savedRules.value = JSON.stringify(toForm(view.rules));
    Object.assign(rules, toForm(view.rules));
    toast.success('Sign-in rules saved. They apply to every staff account from the next sign-in.');
  } catch (e) {
    rulesServerError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}
function resetRules() {
  if (data.value) Object.assign(rules, toForm(data.value.rules));
  rulesServerError.value = '';
}

useSettingsDirtyGuard(() => pwDirty.value || rulesDirty.value);
</script>

<template>
  <div v-if="isPending" class="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
    <Skeleton class="h-48 w-full" /><Skeleton class="h-48 w-full" />
  </div>
  <InlineNotice
    v-else-if="isError || !data"
    tone="error"
    title="Security settings couldn’t load"
    description="Check your connection and try again."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>
  <div v-else class="flex flex-col gap-4">
    <div class="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <div class="flex flex-col gap-4">
        <KeyValueCard
          title="Your account"
          :rows="[
            { label: 'Signed in as', value: `${data.account.name} · ${data.account.email}` },
            { label: 'Position', value: data.account.position },
            { label: 'Role', value: data.account.role },
            { label: 'Password changed', value: fmtDay(data.account.passwordChangedOn) },
            {
              label: 'Password expires',
              value: data.account.passwordExpiresOn
                ? fmtDay(data.account.passwordExpiresOn)
                : 'Never',
              emphasis: expiresSoon ? 'error' : undefined,
            },
            { label: 'Two-step verification', value: 'Coming soon' },
          ]"
        />

        <SectionCard
          flush
          title="Signed-in devices"
          description="Where your account is signed in. Sign out of any you don’t recognise, then change your password."
        >
          <template #actions>
            <Button
              v-if="others.length"
              variant="outline"
              size="sm"
              :disabled="signOutOthers.isPending.value"
              @click="endOthers"
              >Sign out others</Button
            >
          </template>
          <ul>
            <li
              v-for="s in data.sessions"
              :key="s.id"
              class="flex items-center gap-3 border-b border-divider px-4 py-3 text-[13px] last:border-b-0"
            >
              <component
                :is="isPhone(s) ? SmartphoneIcon : MonitorIcon"
                class="size-4 shrink-0 text-faint"
                aria-hidden="true"
              />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate font-medium">{{ deviceName(s) }}</span>
                <span class="text-xs text-muted-foreground"
                  >{{ s.location }} · {{ lastSeen(s) }}</span
                >
              </span>
              <StatusBadge v-if="s.current" label="Current" tone="success" />
              <Button
                v-else
                variant="ghost"
                size="sm"
                :disabled="endSession.isPending.value"
                @click="endOne(s)"
                >Sign out</Button
              >
            </li>
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        title="Change password"
        description="Changing your password signs you out on every other device."
      >
        <form class="flex flex-col gap-3.5" novalidate @submit.prevent="submitPassword">
          <!-- Lets password managers pair the new password with this account. -->
          <input
            type="text"
            name="username"
            :value="data.account.email"
            autocomplete="username"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            readonly
          />
          <FieldShell id="pw-current" label="Current password" required :error="pwErr('current')">
            <Input
              id="pw-current"
              v-model="pw.current"
              type="password"
              autocomplete="current-password"
              placeholder="Your current password"
              :aria-invalid="!!pwErr('current')"
            />
          </FieldShell>
          <FieldShell id="pw-next" label="New password" required :error="pwErr('next')">
            <Input
              id="pw-next"
              v-model="pw.next"
              type="password"
              autocomplete="new-password"
              placeholder="At least 8 characters"
              :aria-invalid="!!pwErr('next')"
            />
          </FieldShell>
          <PasswordChecklist :password="pw.next" />
          <FieldShell id="pw-repeat" label="Confirm new password" required :error="pwErr('repeat')">
            <Input
              id="pw-repeat"
              v-model="pw.repeat"
              type="password"
              autocomplete="new-password"
              placeholder="Type it again"
              :aria-invalid="!!pwErr('repeat')"
            />
          </FieldShell>
          <div>
            <Button type="submit" :disabled="changePassword.isPending.value">
              <Spinner v-if="changePassword.isPending.value" /> Update password
            </Button>
          </div>
        </form>
      </SectionCard>
    </div>

    <SectionCard
      title="Staff sign-in rules"
      description="Apply to every staff account at your school, including yours."
    >
      <form class="flex flex-col gap-4" novalidate @submit.prevent="submitRules">
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          <FieldShell
            v-for="r in RULES"
            :id="`rule-${r.key}`"
            :key="r.key"
            :label="r.label"
            required
            :hint="r.hint"
            :error="ruleErrors[r.key]"
          >
            <div class="flex items-center gap-2">
              <Input
                :id="`rule-${r.key}`"
                v-model="rules[r.key]"
                inputmode="numeric"
                :placeholder="String(r.min)"
                class="w-24"
                :aria-invalid="!!ruleErrors[r.key]"
              />
              <span class="text-xs font-normal text-muted-foreground">{{ r.unit }}</span>
            </div>
          </FieldShell>
        </div>
        <InlineNotice
          v-if="rulesServerError"
          tone="error"
          title="Not saved"
          :description="rulesServerError"
        />
        <div class="flex flex-wrap gap-2">
          <Button
            type="submit"
            :disabled="!rulesDirty || saveRules.isPending.value || !!Object.keys(ruleErrors).length"
          >
            <Spinner v-if="saveRules.isPending.value" /> Save rules
          </Button>
          <Button v-if="rulesDirty" type="button" variant="outline" @click="resetRules"
            >Discard changes</Button
          >
        </div>
      </form>
    </SectionCard>
  </div>
</template>
