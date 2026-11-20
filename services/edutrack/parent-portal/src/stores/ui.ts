import { defineStore } from 'pinia';
import { ref } from 'vue';

/** Sheets any screen can open: Contact school and the sign-out confirmation. */
export const useUiStore = defineStore('ui', () => {
  const contactOpen = ref(false);
  const signOutOpen = ref(false);
  return { contactOpen, signOutOpen };
});
