import { getApiErrorCode, getApiErrorFields, getApiErrorMessage } from '@edutrack/web-core/http';

import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useAllocateMutation } from '@/api/services/boarding';
import type { AllocationPayload, StudentBoarding } from '@/types';

/**
 * Places a boarder in a room. A hostel for the other gender or for other classes comes back as a
 * warning (409 ALLOCATION_WARNING): the admin is asked "Place anyway?" and it is sent again with
 * `confirm`. Resolves with the student's boarding, or null when they chose not to. Other errors
 * (a full room, a taken bed) are thrown for the caller to show.
 */
export function useAllocate() {
  const confirm = useConfirm();
  const allocate = useAllocateMutation();

  async function place(p: AllocationPayload): Promise<StudentBoarding | null> {
    try {
      return await allocate.mutateAsync(p);
    } catch (e) {
      if (getApiErrorCode(e) !== 'ALLOCATION_WARNING') throw e;
      const warnings = getApiErrorFields(e).warnings || getApiErrorMessage(e);
      let result: StudentBoarding | null = null;
      const ok = await confirm({
        title: 'Place anyway?',
        description: warnings,
        confirmLabel: 'Place anyway',
        action: async () => {
          result = await allocate.mutateAsync({ ...p, confirm: true });
        },
      });
      return ok ? result : null;
    }
  }

  return { place, pending: allocate.isPending };
}
