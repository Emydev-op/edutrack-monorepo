import { shallowRef } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

export interface SuccessRequest {
  title: string;
  description: string;
  primary: { label: string; to: RouteLocationRaw };
  secondary?: { label: string; to: RouteLocationRaw };
}

const current = shallowRef<SuccessRequest | null>(null);

/** A celebratory confirmation after a multi-step flow, with where to go next. */
export function useSuccessDialog() {
  return {
    current,
    show: (request: SuccessRequest) => (current.value = request),
    close: () => (current.value = null),
  };
}
