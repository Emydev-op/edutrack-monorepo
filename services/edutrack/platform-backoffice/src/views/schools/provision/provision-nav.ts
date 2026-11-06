import type { InjectionKey } from 'vue';

/** Lets the review step jump back to the step that owns a section. */
export const goToStepKey: InjectionKey<(step: number) => void> = Symbol('provisionGoToStep');
