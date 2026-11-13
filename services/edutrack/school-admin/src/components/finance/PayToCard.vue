<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Copy, Send } from '@lucide/vue';
import { toast } from 'vue-sonner';

import type { PayToDetails } from '@/types';

/**
 * Where a parent pays: EduTrack doesn't collect money, so invoices and reminders carry the
 * school's bank account and the transfer reference. Parents then tap "I've made a payment" in
 * the Parent Portal and the school verifies the transfer against its bank statement.
 */
const props = defineProps<{
  details: PayToDetails;
  /** Fee payer's name; shows the "Send" action when set. */
  payer?: string | null;
  sending?: boolean;
}>();
const emit = defineEmits<{ send: [] }>();

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied.`);
  } catch {
    toast.error('Couldn’t copy. Select the text instead.');
  }
}
</script>

<template>
  <section class="flex flex-col gap-3 rounded-lg border bg-card px-4.5 py-4">
    <header class="flex flex-col gap-0.5">
      <h2 class="text-[15px] font-semibold">How the parent pays</h2>
      <p class="text-xs text-muted-foreground">
        Bank transfer to the school’s account. The transfer stays pending until it is verified
        against the bank statement.
      </p>
    </header>
    <dl class="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-[13px]">
      <dt class="text-faint">Bank</dt>
      <dd>{{ props.details.bank }}</dd>
      <dt class="text-faint">Account number</dt>
      <dd class="flex items-center gap-1.5 font-medium tabular-nums">
        {{ props.details.accountNumber }}
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground"
          :aria-label="`Copy account number ${props.details.accountNumber}`"
          @click="copy(props.details.accountNumber, 'Account number')"
        >
          <Copy class="size-3.5" />
        </button>
      </dd>
      <dt class="text-faint">Account name</dt>
      <dd>{{ props.details.accountName }}</dd>
      <dt class="text-faint">Narration / reference</dt>
      <dd class="flex items-center gap-1.5 font-medium">
        {{ props.details.reference }}
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground"
          :aria-label="`Copy reference ${props.details.reference}`"
          @click="copy(props.details.reference, 'Reference')"
        >
          <Copy class="size-3.5" />
        </button>
      </dd>
    </dl>
    <div class="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" @click="copy(props.details.message, 'Payment message')">
        <Copy class="size-3.5" /> Copy message
      </Button>
      <Button
        v-if="props.payer"
        variant="outline"
        size="sm"
        :disabled="props.sending"
        @click="emit('send')"
      >
        <Send class="size-3.5" /> Send to {{ props.payer }}
      </Button>
    </div>
  </section>
</template>
