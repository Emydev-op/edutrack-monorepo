import { defineStore } from 'pinia';
import { ref } from 'vue';

import type { ChildSummary } from '@/types';

const KEY = 'edutrack.parent-portal.child';

/**
 * Which child the portal shows: the one asked for if it is still linked, else the one chosen last
 * time on this device, else the first (children come sorted by first name).
 */
export function pickChild(
  children: Pick<ChildSummary, 'id'>[],
  wanted?: string | null,
  remembered?: string | null,
): string | null {
  const has = (id?: string | null) => !!id && children.some((c) => c.id === id);
  if (has(wanted)) return wanted!;
  if (has(remembered)) return remembered!;
  return children[0]?.id ?? null;
}

function recall(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** The child switcher under the header: every child screen reads `selectedId`. */
export const useChildrenStore = defineStore('children', () => {
  const selectedId = ref<string | null>(recall());

  function select(id: string) {
    selectedId.value = id;
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // Private windows can refuse storage; the choice still holds for this visit.
    }
  }

  /** Keeps the choice valid when the children list (re)loads. */
  function sync(children: Pick<ChildSummary, 'id'>[]) {
    const next = pickChild(children, selectedId.value, recall());
    if (next && next !== selectedId.value) select(next);
    if (!next) selectedId.value = null;
  }

  function clear() {
    selectedId.value = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing stored.
    }
  }

  return { selectedId, select, sync, clear };
});
