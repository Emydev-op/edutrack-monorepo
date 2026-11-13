/**
 * Shapes shared by several feature areas (classes, students, schemes). Feature-specific types
 * live in their own file.
 */
export type Section = 'JSS' | 'SSS';

export interface SchemeComponent {
  key: 'CA1' | 'CA2' | 'EXAM';
  name: string;
  max: number;
  /** Percent of the total. */
  weight: number;
}

export interface GradeBand {
  grade: string;
  min: number;
  max: number;
  remark: string;
  points: number;
  pass: boolean;
}

export interface AssessmentScheme {
  section: Section;
  components: SchemeComponent[];
  scaleName: string;
  scale: GradeBand[];
}

export interface StudentSummary {
  id: string;
  name: string;
  admissionNo: string;
  gender: 'Male' | 'Female';
  armId: string;
  armName: string;
  status: 'Active' | 'Transferred';
}

export interface Period {
  id: string;
  label: string;
  start: string;
  end: string;
  isBreak: boolean;
}

export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri';
