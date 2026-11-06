import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import { useDeleteRoleMutation } from '@/api/services/users';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { routesPath } from '@/router/routes-path';
import type { Role } from '@/types';

import { roleDraft } from './role-draft';

/** Duplicate and delete for roles, shared by the roles table and the role drawer. */
export function useRoleActions() {
  const router = useRouter();
  const confirm = useConfirm();
  const remove = useDeleteRoleMutation();

  function duplicate(role: Role) {
    roleDraft.value = {
      name: `${role.name} (copy)`,
      description: role.description,
      permissions: structuredClone(role.permissions),
      step: 1,
    };
    void router.push({ name: routesPath.settings.createRole.name });
  }

  function deleteRole(role: Role, onDeleted?: () => void) {
    if (role.activeUsers) {
      return confirm({
        title: `Can't delete ${role.name}`,
        description: `${role.activeUsers} user${role.activeUsers > 1 ? 's still have' : ' still has'} this role. Move them to another role first.`,
        confirmLabel: 'Go to users',
        action: () => router.push({ name: routesPath.users.list.name }),
      });
    }
    return confirm({
      title: `Delete role ${role.name}?`,
      details: [
        ['Users', 'None assigned'],
        ['Reversible', 'No. You would need to recreate it.'],
      ],
      confirmLabel: 'Delete role',
      tone: 'destructive',
      action: async () => {
        await remove.mutateAsync(role.id);
        onDeleted?.();
        toast.success('Role deleted.');
      },
    });
  }

  return { duplicate, deleteRole };
}
