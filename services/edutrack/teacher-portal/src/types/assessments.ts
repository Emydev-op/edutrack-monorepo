/**
 * Types for the assessments area: the school's scheme (read-only here) and the components a
 * teacher schedules for a class.
 */
import type { TimelineEntry } from './common';
import type { SheetComponent } from './results';

export type AssessmentStatus = 'Scheduled' | 'Done' | 'Scored';

export interface AssessmentSummary {
  id: string;
  termId: string;
  armId: string;
  arm: string;
  subject: string;
  subjectName: string;
  branchName: string;
  componentKey: SheetComponent['key'];
  component: string;
  max: number;
  weight: number;
  /** "YYYY-MM-DD" */
  date: string;
  topics: string;
  /** Scheduled: still to come. Done: taken, scores still to enter. Scored: every student entered. */
  status: AssessmentStatus;
  students: number;
  /** Students with a number entered for this component. */
  scored: number;
  absent: number;
  exempt: number;
  missing: number;
  sheetId: string;
}

export interface AssessmentDetail extends AssessmentSummary {
  instructions: string;
  /** The date can still change (term active, not taken yet). */
  canReschedule: boolean;
  history: TimelineEntry[];
}

/** The school scheme for each section taught. */
export interface SchemeSummary {
  section: 'JSS' | 'SSS';
  scaleName: string;
  components: SheetComponent[];
}

/** `GET /v1/assessments?term=` */
export interface AssessmentsList {
  termId: string;
  editable: boolean;
  schemes: SchemeSummary[];
  rows: AssessmentSummary[];
}

/** `GET /v1/assessments/options?term=`: what can be scheduled for each class. */
export interface ScheduleOptions {
  termId: string;
  termStart: string;
  termEnd: string;
  today: string;
  classes: {
    assignmentId: string;
    armId: string;
    arm: string;
    subject: string;
    subjectName: string;
    branchName: string;
    section: 'JSS' | 'SSS';
    /** Components not yet scheduled for this class this term. */
    available: SheetComponent[];
  }[];
}

export interface SchedulePayload {
  armId: string;
  subject: string;
  componentKey: SheetComponent['key'];
  date: string;
  topics: string;
  instructions?: string;
}

export interface ReschedulePayload {
  date: string;
  topics: string;
  instructions?: string;
}
