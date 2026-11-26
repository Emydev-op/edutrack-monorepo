<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import ListRow from '@/components/common/ListRow.vue';
import { routesPath } from '@/router/routes-path';
import type { ChildSummary } from '@/types';

/** A boarder's hostel place and house staff, with a way to message them. Hidden for day students. */
const props = defineProps<{ child: ChildSummary }>();

const boarding = computed(() => props.child.boarding);
const place = computed(() => (boarding.value?.placed ? boarding.value.place : null));
const where = computed(() => {
  const p = place.value;
  if (!p) return null;
  return [p.hostel, p.floor && `Floor ${p.floor}`, `Room ${p.room}`, p.bed && `Bed ${p.bed}`]
    .filter(Boolean)
    .join(' · ');
});
const canMessage = computed(() => props.child.access === 'full');
</script>

<template>
  <section v-if="boarding" class="flex flex-col gap-1.5" aria-labelledby="boarding-title">
    <h2 id="boarding-title" class="text-sm font-semibold">Boarding</h2>
    <div class="overflow-hidden rounded-lg border bg-card [&>*+*]:border-t [&>*+*]:border-divider">
      <div class="flex items-start justify-between gap-3 px-3.5 py-3">
        <span class="flex min-w-0 flex-col gap-0.5">
          <span class="text-sm font-medium">{{ where ?? 'Waiting for a room' }}</span>
          <span v-if="!where" class="text-xs text-muted-foreground"
            >The school will place {{ child.firstName }} in a hostel room.</span
          >
        </span>
        <StatusBadge label="Boarder" tone="info" :dot="false" />
      </div>
      <div
        v-for="s in place?.houseStaff ?? []"
        :key="s.staffId"
        class="flex min-h-13 items-center justify-between gap-3 px-3.5 py-2"
      >
        <span class="flex min-w-0 flex-col">
          <span class="truncate text-sm font-medium">{{ s.name }}</span>
          <span class="truncate text-xs text-muted-foreground">{{ s.role }}</span>
        </span>
        <Button v-if="canMessage" as-child variant="outline" size="sm" class="h-10 shrink-0">
          <RouterLink
            :to="{
              name: routesPath.messages.create.name,
              query: { staff: s.staffId, student: child.id },
            }"
            :aria-label="`Message ${s.name}`"
            >Message</RouterLink
          >
        </Button>
      </div>
      <ListRow title="Exeats, pickups and more" :to="{ name: routesPath.boarding.name }" />
    </div>
  </section>
</template>
