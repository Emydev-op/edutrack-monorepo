<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';

import type { SheetStatus } from '@/types';

import { SHEET_TONES, sheetStatusLabel } from './sheet-status';

/**
 * A result sheet's status, with the same words and tones as everywhere else:
 * `<SheetStatusBadge status="Submitted" with-hod />` reads "Submitted · with HOD".
 */
defineProps<{ status: SheetStatus; withHod?: boolean }>();
</script>

<template>
  <StatusBadge :label="sheetStatusLabel(status, withHod)" :tone="SHEET_TONES[status]" />
</template>
