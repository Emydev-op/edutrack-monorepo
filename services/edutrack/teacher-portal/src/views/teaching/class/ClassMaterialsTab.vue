<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { UploadIcon } from '@lucide/vue';
import { ref } from 'vue';
import { RouterLink } from 'vue-router';

import MaterialsTable from '@/components/materials/MaterialsTable.vue';
import { routesPath as r } from '@/router/routes-path';
import type { TeachingClassDetail } from '@/types';

/** The class page's Materials tab: what's shared with this class for the subject. */
const props = defineProps<{ detail: TeachingClassDetail }>();
const page = ref(1);
const pageSize = ref(10);
const c = props.detail.class;
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <p class="text-[13px] text-muted-foreground">
      Notes, slides and videos shared with {{ c.armName }} · {{ c.subjectName }}.
    </p>
    <Button v-if="!detail.readOnly" as-child size="sm"
      ><RouterLink
        :to="{ name: r.materials.upload.name, query: { class: c.armId, subject: c.subject } }"
        ><UploadIcon /> Upload material</RouterLink
      ></Button
    >
    <Button v-else size="sm" disabled :title="detail.lockReason ?? undefined"
      ><UploadIcon /> Upload material</Button
    >
  </div>
  <MaterialsTable
    v-model:page="page"
    v-model:page-size="pageSize"
    :arm-id="c.armId"
    :subject="c.subject"
    :empty-text="
      detail.readOnly
        ? 'No materials were shared with this class in this term.'
        : 'No materials for this class yet. Upload notes, slides or a video link.'
    "
  />
</template>
