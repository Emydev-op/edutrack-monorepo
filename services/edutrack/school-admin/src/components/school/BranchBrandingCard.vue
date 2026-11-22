<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useBranchBrandingMutation, useBranchBrandingQuery } from '@/api/services/school';
import { useAuthStore } from '@/stores/auth';

/**
 * A campus's own logo and colour: shown in School Admin while it's the working branch and on its
 * report cards and receipts. Clearing them uses the school's again.
 */
const props = defineProps<{ branchId: string; branchName: string; editable: boolean }>();
const auth = useAuthStore();
const { data } = useBranchBrandingQuery(() => props.branchId);
const save = useBranchBrandingMutation(() => props.branchId);
const colour = ref('');
watch(data, (d) => (colour.value = d?.brandColor ?? ''), { immediate: true });
const schoolColour = computed(() => auth.school?.brandColor ?? '#9B403C');
const fileInput = ref<HTMLInputElement | null>(null);

async function run(p: { brandColor?: string | null; logo?: string | null }, done: string) {
  try {
    await save.mutateAsync(p);
    toast.success(done);
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'The branding wasn’t saved. Try again.'));
  }
}
const read = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
async function onLogo(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!['image/png', 'image/jpeg'].includes(file.type))
    return void toast.error('Use a PNG or JPG image for the logo.');
  if (file.size > 1024 * 1024) return void toast.error('The logo is larger than 1 MB.');
  await run({ logo: await read(file) }, `${props.branchName} logo saved.`);
}
</script>

<template>
  <SectionCard
    title="Branding"
    :description="`${branchName}’s own logo and colour, used on its report cards, receipts and screens. Leave them empty to use the school’s.`"
  >
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-2">
        <span class="text-xs font-medium text-muted-foreground">Colour</span>
        <div class="flex items-center gap-2">
          <input
            type="color"
            :value="colour || schoolColour"
            :disabled="!editable"
            class="h-9 w-12 cursor-pointer rounded border bg-card"
            aria-label="Branch colour"
            @input="colour = ($event.target as HTMLInputElement).value"
          />
          <span class="text-sm tabular-nums">{{
            colour ? colour.toUpperCase() : 'School colour'
          }}</span>
        </div>
        <div v-if="editable" class="flex gap-2">
          <Button
            size="sm"
            :disabled="save.isPending.value || !colour || colour === (data?.brandColor ?? '')"
            @click="run({ brandColor: colour }, `${branchName} colour saved.`)"
            >Save colour</Button
          >
          <Button
            v-if="data?.brandColor"
            size="sm"
            variant="ghost"
            :disabled="save.isPending.value"
            @click="run({ brandColor: null }, `${branchName} uses the school colour.`)"
            >Use school colour</Button
          >
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <span class="text-xs font-medium text-muted-foreground">Logo</span>
        <div class="flex items-center gap-3">
          <span
            class="flex size-12 items-center justify-center overflow-hidden rounded-md border bg-muted text-[11px] text-faint"
          >
            <img v-if="data?.logoUrl" :src="data.logoUrl" alt="" class="size-full object-contain" />
            <template v-else>School’s</template>
          </span>
          <template v-if="editable">
            <input
              ref="fileInput"
              type="file"
              accept="image/png,image/jpeg"
              class="hidden"
              @change="onLogo"
            />
            <Button
              size="sm"
              variant="outline"
              :disabled="save.isPending.value"
              @click="fileInput?.click()"
              >{{ data?.logoUrl ? 'Change logo' : 'Upload logo' }}</Button
            >
            <Button
              v-if="data?.logoUrl"
              size="sm"
              variant="ghost"
              :disabled="save.isPending.value"
              @click="run({ logo: null }, `${branchName} uses the school logo.`)"
              >Remove</Button
            >
          </template>
        </div>
        <span class="text-[11px] text-faint">PNG or JPG, up to 1 MB.</span>
      </div>
    </div>
  </SectionCard>
</template>
