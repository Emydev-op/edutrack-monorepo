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
  /**
   * The first-sign-in foundation is in place: school profile confirmed, the current session with
   * its terms started, class levels and arms set. Until then every screen except the Setup Center
   * and the ones its foundation steps open redirects to the Setup Center.
   */
  foundationComplete: boolean;
  /** The steps that make up the foundation, shown first in the Setup Center. */
  foundationSteps: string[];
}
