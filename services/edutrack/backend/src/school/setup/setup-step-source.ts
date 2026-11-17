/**
 * How a module tells the Setup Center where its step stands. Each Phase-1 module (School Profile,
 * Branches, Staff, Organogram & Roles, Academics) provides one source per step it owns under the
 * `SETUP_STEP_SOURCES` token; steps without a source (modules not built yet) keep their stored
 * state and are marked done by hand.
 *
 * ```ts
 * { provide: SETUP_STEP_SOURCES, useFactory: (...s: SetupStepSource[]) => s, inject: [...] }
 * ```
 */

/** A School Admin route, by name: `{ name: 'classes', query: { from: 'setup' } }`. */
export interface StepTarget {
  name: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

export interface SetupStepLiveState {
  /** Where things stand, e.g. "48 arms across 17 class levels". */
  description: string;
  /** The school confirmed the step (usually `SetupStateService.isConfirmed(id)`). */
  done: boolean;
  /** The screen that does the step. */
  to: StepTarget;
  /**
   * Why the step can't be marked complete yet, in the order the screen should fix them
   * ("Finish Academic Sections first."). Empty or absent: it can be completed.
   */
  blockers?: string[];
}

export interface SetupStepSource {
  /** The Setup Center step id: `school-profile`, `classes-arms`… */
  readonly id: string;
  state(): Promise<SetupStepLiveState>;
  /**
   * Optional custom completion. Without it the Setup Center refuses with the first blocker (422)
   * and otherwise stores the confirmation. Throw an `AppException` to refuse differently (School
   * Profile answers 409: it completes by saving the profile).
   */
  complete?(): Promise<void>;
}

/** Nest injection token: `SetupStepSource[]`. */
export const SETUP_STEP_SOURCES = Symbol('SETUP_STEP_SOURCES');
