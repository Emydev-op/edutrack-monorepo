<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Progress } from '@edutrack/ui/components/progress';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { toTypedSchema } from '@vee-validate/yup';
import { CheckCircle2Icon, UploadIcon, XIcon } from '@lucide/vue';
import { useField, useForm } from 'vee-validate';
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import * as yup from 'yup';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormSelect from '@edutrack/app-kit/components/form/FormSelect.vue';
import FormTextarea from '@edutrack/app-kit/components/form/FormTextarea.vue';

import { useUploadMaterialMutation } from '@/api/services/materials';
import { useMyScopeQuery } from '@/api/services/shell';
import { fileSize } from '@/components/assignments/assignment-format';
import { MATERIAL_ICON } from '@/components/materials/material-format';
import { useTermContext } from '@/composables/useTermContext';
import { useUnsavedWork } from '@/composables/useUnsavedWork';
import { fieldErrorsOf, getApiErrorMessage } from '@/lib/api-errors';
import { routesPath as r } from '@/router/routes-path';
import {
  MATERIAL_EXTENSIONS,
  MATERIAL_LIMITS,
  MATERIAL_TYPES,
  VIDEO_HOSTS,
  type FileRef,
  type MaterialType,
} from '@/types';

const route = useRoute();
const router = useRouter();
const uid = useId();
const { isReadOnly, readOnlyReason } = useTermContext();
const { data: scope, isPending: loadingScope } = useMyScopeQuery();
const upload = useUploadMaterialMutation();

const isVideoHost = (v: string) => {
  try {
    const u = new URL(v);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    return VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
};

const { handleSubmit, values, meta, resetForm, setErrors } = useForm({
  validationSchema: toTypedSchema(
    yup.object({
      classKey: yup.string().required('Choose the class and subject.'),
      type: yup
        .string()
        .oneOf([...MATERIAL_TYPES])
        .default('PDF'),
      title: yup
        .string()
        .trim()
        .required('Enter a title.')
        .max(MATERIAL_LIMITS.title, `Keep the title to ${MATERIAL_LIMITS.title} characters.`),
      description: yup
        .string()
        .trim()
        .default('')
        .max(MATERIAL_LIMITS.description, 'Keep the description to 1,000 characters.'),
      link: yup
        .string()
        .trim()
        .default('')
        .test('needed', 'Paste the video link.', function (v) {
          return this.parent.type !== 'Video link' || Boolean(v);
        })
        .test('https', 'Use a secure link that starts with https://', function (v) {
          return this.parent.type !== 'Video link' || !v || v.startsWith('https://');
        })
        .test('host', 'Use a YouTube, Vimeo or Google Drive link.', function (v) {
          return this.parent.type !== 'Video link' || !v || isVideoHost(v);
        }),
    }),
  ),
  initialValues: { classKey: '', type: 'PDF', title: '', description: '', link: '' },
});
const { value: type } = useField<MaterialType>('type');

const classOptions = computed(() =>
  (scope.value?.assignments ?? []).map((a) => ({
    value: `${a.armId}|${a.subject}`,
    label: `${a.armName}${scope.value?.multiCampus ? ` (${a.branchName.replace(' Campus', '')})` : ''} · ${a.subjectName}`,
  })),
);
const chosen = computed(() =>
  scope.value?.assignments.find((a) => `${a.armId}|${a.subject}` === values.classKey),
);
watch(
  scope,
  (s) => {
    if (!s || meta.value.dirty) return;
    const key = `${route.query.class ?? ''}|${route.query.subject ?? ''}`;
    if (s.assignments.some((a) => `${a.armId}|${a.subject}` === key))
      resetForm({ values: { ...values, classKey: key } });
  },
  { immediate: true },
);

const TYPE_CHOICES = MATERIAL_TYPES.map((t) => ({
  value: t,
  label: t,
  description:
    t === 'Video link'
      ? 'YouTube, Vimeo or Google Drive'
      : `.${MATERIAL_EXTENSIONS[t as Exclude<MaterialType, 'Video link'>].join(', .')}`,
}));

/* ---------- File ---------- */

const file = ref<FileRef | null>(null);
const fileError = ref('');
const input = ref<HTMLInputElement | null>(null);
const extensions = computed(() =>
  type.value === 'Video link'
    ? []
    : MATERIAL_EXTENSIONS[type.value as Exclude<MaterialType, 'Video link'>],
);
function checkFile(f: FileRef | null) {
  if (!f) return 'Choose a file to upload.';
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  if (!extensions.value.includes(ext))
    return `“${f.name}” isn’t a ${type.value === 'Image' ? 'image' : type.value} file. Choose a .${extensions.value.join(', .')} file, or change the type.`;
  if (f.bytes > MATERIAL_LIMITS.bytes)
    return `“${f.name}” is ${fileSize(f.bytes)}. Files can be up to 25 MB. Compress it or share it as a link.`;
  if (!f.bytes) return `“${f.name}” is empty.`;
  return '';
}
function pick(event: Event) {
  const el = event.target as HTMLInputElement;
  const picked = el.files?.[0];
  el.value = '';
  if (!picked) return;
  const f = { name: picked.name, type: picked.type, bytes: picked.size };
  fileError.value = checkFile(f);
  file.value = fileError.value ? null : f;
}
watch(type, () => {
  if (file.value) fileError.value = checkFile(file.value);
  if (fileError.value) file.value = null;
});

const fileIcon = computed(() => MATERIAL_ICON[type.value]);
const listTo = { name: r.materials.list.name };

/* ---------- Upload ---------- */

type Phase = 'form' | 'uploading' | 'failed' | 'processing' | 'published';
const phase = ref<Phase>('form');
const progress = ref(0);
const serverError = ref('');
let timer: ReturnType<typeof setInterval> | undefined;
let failedOnce = false;
onBeforeUnmount(() => clearInterval(timer));

const busy = computed(() => ['uploading', 'processing', 'published'].includes(phase.value));
useUnsavedWork(
  () => phase.value !== 'published' && (meta.value.dirty || !!file.value),
  'Material upload',
);

/** Simulates the file transfer; "fail" in the title drops the connection at 60% (once). */
function transfer(simulateFailure: boolean) {
  return new Promise<void>((resolve, reject) => {
    progress.value = 0;
    clearInterval(timer);
    timer = setInterval(() => {
      progress.value = Math.min(100, progress.value + 10);
      if (simulateFailure && progress.value >= 60) {
        clearInterval(timer);
        reject(new Error('network'));
      } else if (progress.value >= 100) {
        clearInterval(timer);
        resolve();
      }
    }, 180);
  });
}

const start = handleSubmit(async (v) => {
  serverError.value = '';
  const isLink = v.type === 'Video link';
  if (!isLink) {
    fileError.value = checkFile(file.value);
    if (fileError.value) return;
  }
  const [armId = '', subject = ''] = v.classKey.split('|');
  try {
    if (!isLink) {
      phase.value = 'uploading';
      const fail = !failedOnce && /fail/i.test(v.title);
      try {
        await transfer(fail);
      } catch {
        failedOnce = true;
        phase.value = 'failed';
        return;
      }
    }
    phase.value = 'processing';
    const m = await upload.mutateAsync({
      armId,
      subject,
      type: v.type as MaterialType,
      title: v.title,
      description: v.description ?? '',
      file: isLink ? null : file.value,
      link: isLink ? (v.link ?? '') : null,
    });
    phase.value = 'published';
    toast.success(`Published to ${m.classLabel}.`);
    setTimeout(
      () => router.push({ name: r.materials.detail.name, params: { materialId: m.id } }),
      700,
    );
  } catch (e) {
    phase.value = 'form';
    const fields = fieldErrorsOf(e);
    if (fields.file) fileError.value = fields.file;
    const rest = Object.fromEntries(
      Object.entries(fields)
        .filter(([k]) => k !== 'file')
        .map(([k, msg]) => [k === 'armId' || k === 'subject' ? 'classKey' : k, msg]),
    );
    if (Object.keys(rest).length) setErrors(rest);
    if (!Object.keys(fields).length)
      serverError.value = getApiErrorMessage(e, 'The material wasn’t published. Try again.');
  }
});
</script>

<template>
  <PageHeader
    title="Upload material"
    description="Share notes, slides, pictures or a video link with one of your classes. Students see it in their portal."
  />
  <Skeleton v-if="loadingScope" class="h-[420px] w-full" />
  <EmptyState
    v-else-if="!scope?.assignments.length"
    illustrated
    title="No classes to share materials with yet"
    description="The academic office assigns your classes. Once they do, you can upload materials."
  />
  <InlineNotice
    v-else-if="isReadOnly"
    tone="warning"
    title="Uploads are closed for this term"
    :description="readOnlyReason ?? 'Only the active term can be changed.'"
  />
  <form v-else class="flex max-w-3xl flex-col gap-5" novalidate @submit.prevent="start">
    <fieldset :disabled="busy" class="contents">
      <SectionCard title="Where it goes">
        <div class="flex flex-col gap-4.5">
          <FormSelect
            name="classKey"
            label="Class and subject"
            required
            :options="[{ value: '', label: 'Choose a class…' }, ...classOptions]"
            :hint="chosen ? `${chosen.students} students will see it` : 'Only your own classes.'"
          />
          <div class="flex flex-col gap-1.5">
            <span class="text-[13px] font-medium"
              >Type <span class="text-destructive">*</span></span
            >
            <ChoiceCards
              v-model="type"
              :choices="TYPE_CHOICES"
              label="Material type"
              :columns="3"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Details">
        <div class="flex flex-col gap-4.5">
          <FormInput name="title" label="Title" required placeholder="Algebra worked examples" />
          <FormTextarea
            name="description"
            label="Description"
            :rows="3"
            placeholder="What it covers and when students should use it."
          />
          <FormInput
            v-if="type === 'Video link'"
            name="link"
            label="Video link"
            required
            type="url"
            inputmode="url"
            placeholder="https://www.youtube.com/watch?v=…"
            hint="YouTube, Vimeo or Google Drive, starting https://"
          />
          <div v-else class="flex flex-col gap-1.5">
            <span :id="`${uid}-file`" class="text-[13px] font-medium"
              >File <span class="text-destructive">*</span></span
            >
            <div
              v-if="file"
              class="flex min-w-0 items-center gap-2.5 rounded-md border bg-card px-3 py-2.5 text-[13px]"
            >
              <component :is="fileIcon" class="size-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate">{{ file.name }}</span>
              <span class="shrink-0 text-xs text-faint">{{ fileSize(file.bytes) }}</span>
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground"
                :aria-label="`Remove ${file.name}`"
                @click="file = null"
              >
                <XIcon class="size-4" />
              </button>
            </div>
            <button
              v-else
              type="button"
              class="flex flex-col items-center gap-1.5 rounded-lg border border-dashed bg-surface-warm px-4 py-6 text-center text-[13px] hover:border-primary"
              :aria-describedby="`${uid}-file`"
              @click="input?.click()"
            >
              <UploadIcon class="size-5 text-muted-foreground" />
              <span class="font-medium">Choose a file</span>
              <span class="text-xs text-faint">.{{ extensions.join(', .') }} · up to 25 MB</span>
            </button>
            <input
              ref="input"
              type="file"
              class="sr-only"
              tabindex="-1"
              :accept="extensions.map((e) => `.${e}`).join(',')"
              :aria-labelledby="`${uid}-file`"
              @change="pick"
            />
            <p v-if="fileError" role="alert" class="text-xs text-destructive">{{ fileError }}</p>
          </div>
        </div>
      </SectionCard>
    </fieldset>

    <SectionCard
      v-if="phase !== 'form'"
      :title="phase === 'failed' ? 'Upload failed' : 'Publishing'"
    >
      <div class="flex flex-col gap-2.5" aria-live="polite">
        <template v-if="phase === 'uploading'">
          <Progress :model-value="progress" />
          <span class="text-[13px] text-muted-foreground">Uploading… {{ progress }}%</span>
        </template>
        <template v-else-if="phase === 'failed'">
          <Progress :model-value="progress" class="[&>*]:bg-destructive" />
          <p class="text-[13px] text-error-strong">
            The connection dropped at {{ progress }}%. Nothing was published and your details are
            kept.
          </p>
          <div class="flex gap-2">
            <Button type="button" size="sm" @click="start">Retry upload</Button>
            <Button type="button" size="sm" variant="outline" @click="phase = 'form'"
              >Change details</Button
            >
          </div>
        </template>
        <template v-else-if="phase === 'processing'">
          <Progress :model-value="100" />
          <span class="text-[13px] text-muted-foreground">Processing and publishing…</span>
        </template>
        <p v-else class="flex items-center gap-2 text-[13px] font-medium text-success-strong">
          <CheckCircle2Icon class="size-4" /> Published. Opening it…
        </p>
      </div>
    </SectionCard>

    <InlineNotice
      v-if="serverError"
      tone="error"
      title="The material wasn’t published"
      :description="serverError"
    />

    <div v-if="phase === 'form'" class="flex flex-wrap gap-2">
      <Button type="submit">Upload and publish</Button>
      <Button as-child variant="ghost"><RouterLink :to="listTo">Cancel</RouterLink></Button>
    </div>
  </form>
</template>
