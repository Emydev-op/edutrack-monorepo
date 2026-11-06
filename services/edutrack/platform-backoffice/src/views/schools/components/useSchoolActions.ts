import { toast } from 'vue-sonner';

import { useReactivateSchoolMutation, useSuspendSchoolsMutation } from '@/api/services/schools';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { formatCount } from '@edutrack/app-kit/lib/format';
import type { School } from '@/types';

/** Suspend and reactivate, with the confirmations the design requires, for one or many schools. */
export function useSchoolActions() {
  const confirm = useConfirm();
  const suspendMutation = useSuspendSchoolsMutation();
  const reactivateMutation = useReactivateSchoolMutation();

  function suspend(schools: School[]) {
    const many = schools.length > 1;
    // Roughly how many staff, parent and student accounts lose access.
    const accounts = schools.reduce((sum, s) => sum + Math.round(s.students * 1.6), 0);
    return confirm({
      title: many ? `Suspend ${schools.length} schools?` : `Suspend ${schools[0]!.name}?`,
      description: `${many ? `This action will affect ${schools.length} schools. ` : ''}School administrators and staff will no longer be able to use operational features while suspended. Parents and students see a maintenance notice. Existing school data is preserved.`,
      details: [
        ['Affects', schools.map((s) => s.name).join(', ')],
        ['Users signed out', `${formatCount(accounts)} accounts (approx.)`],
        ['Data', 'Kept in full. Nothing is deleted.'],
        ['Reversible', 'Yes. Reactivate at any time.'],
      ],
      input: {
        label: "Reason (shared with the school's administrators)",
        placeholder: 'e.g. Proprietor requested a temporary suspension',
        required: true,
      },
      confirmLabel: many ? `Suspend ${schools.length} schools` : 'Suspend school',
      tone: 'destructive',
      action: async ({ text }) => {
        await suspendMutation.mutateAsync({ ids: schools.map((s) => s.id), reason: text });
        toast.success(
          many ? `${schools.length} schools suspended.` : `${schools[0]!.name} suspended.`,
        );
      },
    });
  }

  function reactivate(school: School) {
    return confirm({
      title: `Reactivate ${school.name}?`,
      details: [
        ['Current status', school.status],
        ['Subscription', `${school.plan} · renews ${school.renews}`],
        [
          'Access restored',
          'Sign-in for all staff, parents and students. Scheduled messages resume.',
        ],
        ['Logged as', 'Your account · platform audit'],
      ],
      confirmLabel: 'Reactivate school',
      action: async () => {
        await reactivateMutation.mutateAsync(school.id);
        toast.success(`${school.name} reactivated.`);
      },
    });
  }

  return { suspend, reactivate };
}
