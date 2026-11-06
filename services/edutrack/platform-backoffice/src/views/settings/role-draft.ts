import { ref } from 'vue';

import type { PermissionSet } from '@/types';

export interface RoleDraft {
  name: string;
  description: string;
  permissions: PermissionSet;
  step: number;
}

/** A role to prefill the role builder with, set by "Duplicate role". Consumed once. */
export const roleDraft = ref<RoleDraft | null>(null);
