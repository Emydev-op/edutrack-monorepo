<script setup lang="ts">
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@edutrack/ui/components/sheet';
import { MailIcon, MapPinIcon, PhoneIcon } from '@lucide/vue';

import { useOverviewQuery } from '@/api/services/parent';
import { useSchoolBrand } from '@/lib/school-brand';
import { useUiStore } from '@/stores/ui';

/** The school office's phone, email and address (no messaging from the portal). */
const ui = useUiStore();
const overview = useOverviewQuery();
const brand = useSchoolBrand();
</script>

<template>
  <Sheet v-model:open="ui.contactOpen">
    <SheetContent side="bottom" class="mx-auto max-w-lg rounded-t-2xl px-5 pt-5 pb-7">
      <SheetHeader class="p-0">
        <SheetTitle>Contact the school</SheetTitle>
        <SheetDescription>
          {{ overview.data.value?.school.name ?? brand.name }} · School office. Mention the Parent
          Portal and your child’s name.
        </SheetDescription>
      </SheetHeader>
      <ul class="flex flex-col divide-y rounded-lg border bg-card text-sm">
        <li v-if="overview.data.value?.school.phone" class="flex items-center gap-3 px-3.5 py-3">
          <PhoneIcon class="size-4 text-faint" aria-hidden="true" />
          <a :href="`tel:${overview.data.value.school.phone}`" class="text-primary">{{
            overview.data.value.school.phone
          }}</a>
        </li>
        <li v-if="overview.data.value?.school.email" class="flex items-center gap-3 px-3.5 py-3">
          <MailIcon class="size-4 text-faint" aria-hidden="true" />
          <a :href="`mailto:${overview.data.value.school.email}`" class="text-primary">{{
            overview.data.value.school.email
          }}</a>
        </li>
        <li v-if="overview.data.value?.school.address" class="flex items-center gap-3 px-3.5 py-3">
          <MapPinIcon class="size-4 text-faint" aria-hidden="true" />
          <span>{{ overview.data.value.school.address }}</span>
        </li>
        <li
          v-if="
            overview.data.value &&
            !overview.data.value.school.phone &&
            !overview.data.value.school.email &&
            !overview.data.value.school.address
          "
          class="px-3.5 py-3 text-muted-foreground"
        >
          The school hasn’t added its contact details yet. Visit the school office.
        </li>
      </ul>
    </SheetContent>
  </Sheet>
</template>
