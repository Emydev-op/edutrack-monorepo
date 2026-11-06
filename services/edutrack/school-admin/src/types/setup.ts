import type { RouteLocationRaw } from 'vue-router';

export type SetupGroup = 'Foundation' | 'Academic structure' | 'People' | 'Operations';

export interface SetupStep {
  id: string;
  group: SetupGroup;
  name: string;
  /** Where things stand, e.g. "48 arms across 17 class levels". */
  description: string;
  to: RouteLocationRaw;
  done: boolean;
  required: boolean;
  /** Steps this one depends on, e.g. "Needs: Staff, Subjects". */
  prerequisite: string | null;
  /**
   * Completes from its own screen (e.g. saving the school profile), so it has no "Mark done".
   * Steps whose screens come in later phases are marked done by hand for now.
   */
  auto: boolean;
}

export interface SetupProgress {
  /** How the steps were tailored to this school, e.g. which sections it runs. */
  intro: string;
  steps: SetupStep[];
  /** Setup was marked complete; the dashboard stops prompting and the sidebar link goes away. */
  finished: boolean;
  /** A newly provisioned school: the admin is guided step by step and lands in the Setup Center. */
  onboarding: boolean;
}
