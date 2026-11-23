import { getApiErrorMessage } from '@edutrack/web-core/http';
import { useRouter, type RouteLocationRaw } from 'vue-router';
import { toast } from 'vue-sonner';

import { useSwitchSchoolMutation } from '@/api/services/group';
import { useAuthStore } from '@/stores/auth';

/**
 * Opens a page in one of the group's schools from a group page: in the school the person is in,
 * straight away; in another, it moves them into that school first, then opens the page.
 */
export function useOpenInSchool() {
  const auth = useAuthStore();
  const router = useRouter();
  const switchSchool = useSwitchSchoolMutation();

  async function open(schoolId: string, school: string, to: RouteLocationRaw) {
    if (schoolId === auth.school?.id) return void router.push(to);
    try {
      await switchSchool.mutateAsync(schoolId);
      toast.success(`You’re now in ${school}.`);
      await router.push(to);
    } catch (e) {
      toast.error(getApiErrorMessage(e, 'That school couldn’t be opened. Try again.'));
    }
  }

  return { open, pending: switchSchool.isPending };
}
