<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@edutrack/ui/components/dialog';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, ref, useId, watch } from 'vue';

import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import { useConfirmHost } from '@edutrack/app-kit/composables/useConfirm';

const { pending, settle } = useConfirmHost();

const text = ref('');
const option = ref('');
const acknowledged = ref(false);
const running = ref(false);
const error = ref('');
const inputId = useId();
const ackId = useId();

watch(pending, (request) => {
  text.value = '';
  option.value = request?.defaultOption ?? request?.options?.[0]?.value ?? '';
  acknowledged.value = false;
  running.value = false;
  error.value = '';
});

const blocked = computed(() => {
  const request = pending.value;
  if (!request || running.value) return true;
  if (request.acknowledgement && !acknowledged.value) return true;
  return !!request.input?.required && !text.value.trim();
});

async function confirm() {
  const request = pending.value;
  if (!request || blocked.value) return;
  if (!request.action) return settle(true);
  running.value = true;
  error.value = '';
  try {
    await request.action({ text: text.value.trim(), option: option.value });
    // The action may have opened another confirmation (e.g. by navigating); only close our own.
    settle(true, request);
  } catch (err) {
    if (pending.value !== request) return settle(false, request);
    error.value = getApiErrorMessage(err);
    running.value = false;
  }
}

function onOpenChange(open: boolean) {
  if (!open && !running.value) settle(false);
}
</script>

<template>
  <Dialog :open="!!pending" @update:open="onOpenChange">
    <DialogContent
      v-if="pending"
      class="w-[540px] max-w-[calc(100%-2rem)] gap-3.5 p-5.5 sm:max-w-[540px]"
      :show-close-button="false"
    >
      <DialogHeader class="gap-1.5 text-left">
        <DialogTitle class="text-[17px] font-semibold">{{ pending.title }}</DialogTitle>
        <DialogDescription v-if="pending.description" class="text-[13px] text-body">{{
          pending.description
        }}</DialogDescription>
      </DialogHeader>

      <dl
        v-if="pending.details?.length"
        class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]"
      >
        <template v-for="[label, value] in pending.details" :key="label">
          <dt class="text-faint">{{ label }}</dt>
          <dd>{{ value }}</dd>
        </template>
      </dl>

      <ChoiceCards
        v-if="pending.options?.length"
        v-model="option"
        :choices="pending.options"
        :label="pending.title"
      />

      <div v-if="pending.input" class="flex flex-col gap-1.5 text-[13px] font-medium">
        <label :for="inputId">{{ pending.input.label }}</label>
        <Textarea
          :id="inputId"
          v-model="text"
          :placeholder="pending.input.placeholder"
          rows="3"
          class="resize-y bg-card font-normal"
        />
      </div>

      <label
        v-if="pending.acknowledgement"
        :for="ackId"
        class="flex items-center gap-2 text-[13px]"
      >
        <Checkbox :id="ackId" v-model="acknowledged" />
        {{ pending.acknowledgement }}
      </label>

      <p
        v-if="error"
        role="alert"
        class="rounded-md bg-error-subtle px-3 py-2.5 text-[13px] text-error-strong"
      >
        {{ error }}
      </p>

      <DialogFooter class="gap-2">
        <Button variant="outline" :disabled="running" @click="settle(false)">{{
          pending.cancelLabel ?? 'Cancel'
        }}</Button>
        <Button
          :variant="pending.tone === 'destructive' ? 'destructive' : 'default'"
          :disabled="blocked"
          @click="confirm"
        >
          <Spinner v-if="running" />
          {{ pending.confirmLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
