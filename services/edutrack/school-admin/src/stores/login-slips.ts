import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

import type { StudentLoginsResult } from '@/types';

/**
 * The login slips just created, for the print page. Kept in memory only (never in storage or the
 * URL): the one-time passwords are shown once, and leaving the page or reloading drops them.
 */
export const useLoginSlipsStore = defineStore('login-slips', () => {
  const result = shallowRef<StudentLoginsResult | null>(null);
  const set = (r: StudentLoginsResult) => (result.value = r);
  const clear = () => (result.value = null);
  return { result, set, clear };
});
