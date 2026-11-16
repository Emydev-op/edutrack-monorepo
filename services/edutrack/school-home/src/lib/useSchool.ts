import { rememberBrandColor } from '@edutrack/app-kit/lib/brand-memory';
import { applyBrandTheme } from '@edutrack/app-kit/lib/brand-theme';
import type { PublicSchool } from '@edutrack/shared';
import { ref } from 'vue';

import { lookUpSchool, SchoolLookupError } from './school';

export type SchoolState =
  | { status: 'loading' }
  | { status: 'ready'; school: PublicSchool }
  | { status: 'not-found'; message: string }
  | { status: 'error'; message: string };

/**
 * Loads the school at this address and keeps the page in step with it: the tab title, the brand
 * colour (applied and remembered for next time) and which state the page shows.
 */
export function useSchool() {
  const state = ref<SchoolState>({ status: 'loading' });

  async function load() {
    state.value = { status: 'loading' };
    try {
      const result = await lookUpSchool();
      if (result.kind === 'found') {
        const { school } = result;
        applyBrandTheme(school.brandColor);
        rememberBrandColor(school.brandColor);
        document.title = school.name;
        state.value = { status: 'ready', school };
      } else {
        applyBrandTheme(null);
        rememberBrandColor(null);
        document.title = 'School not found · Edutrack';
        state.value = { status: 'not-found', message: result.message };
      }
    } catch (error) {
      // Keep whatever colour is showing: the school is probably fine, the connection isn't.
      state.value = {
        status: 'error',
        message:
          error instanceof SchoolLookupError
            ? error.message
            : 'Something went wrong. Please try again.',
      };
    }
  }

  return { state, load };
}
