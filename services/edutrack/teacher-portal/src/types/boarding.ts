/** My hostel (`GET /v1/my-hostel`): the hostels a teacher looks after as house staff. */
export type HostelGender = 'Boys' | 'Girls' | 'Mixed';
export type HostelStaffRole = 'House master / mistress' | 'Floor master / mistress' | 'Assistant';

export interface BoarderParent {
  guardianId: string;
  name: string;
  /** "Mother", "Father", "Guardian"… */
  relationship: string;
  phone: string;
}

export interface HostelBoarder {
  studentId: string;
  name: string;
  admissionNo: string;
  gender: string;
  className: string;
  bed: string | null;
  /** The parent to contact, if the student has one. */
  parent: BoarderParent | null;
  /** Allergies and other medical notes; empty when there are none. */
  medicalNotes: string;
}

export interface HostelRoom {
  id: string;
  name: string;
  floor: string | null;
  capacity: number;
  boarders: HostelBoarder[];
}

export interface MyHostelEntry {
  id: string;
  name: string;
  campus: string;
  gender: HostelGender;
  /** My role in this hostel. */
  role: HostelStaffRole;
  /** The floor I look after, for floor masters / mistresses. */
  floor: string | null;
  rooms: HostelRoom[];
  totals: { rooms: number; places: number; boarders: number };
}

export interface MyHostel {
  session: string | null;
  /** Empty for staff who aren't house staff. */
  hostels: MyHostelEntry[];
}

/* ---------- Boarding management (`/v1/staff-boarding/...`) ---------- */

export interface VisitingDay {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" */
  startsAt: string;
  endsAt: string;
  campus: string;
  branchId: string;
  note: string | null;
}

/** `GET dashboard`, scoped to the hostels I may see. */
export interface BoardingDashboard {
  session: string | null;
  boarders: number;
  placed: number;
  needingPlace: number;
  places: number;
  freePlaces: number;
  onCampus: number;
  exeats: { requested: number; out: number; overdue: number; leavingSoon: number };
  sickBay: number;
  visitorsOnSite: number;
  incidentsOpen: number;
  rollCalls: { expected: number; taken: number; absentToday: number };
  nextVisitingDay: VisitingDay | null;
}

export type ExeatKind =
  'Weekend' | 'Medical' | 'Family event' | 'Emergency' | 'Term break' | 'Other';
export type ExeatStatus = 'Requested' | 'Approved' | 'Declined' | 'Cancelled' | 'Out' | 'Returned';

export interface PickupPerson {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  note: string | null;
}

export interface ExeatCollector {
  /** `pickup:<id>` or `guardian:<id>`: send as `collector` when signing out. */
  key: string;
  name: string;
  relationship: string;
}

export interface Exeat {
  id: string;
  student: {
    id: string;
    name: string;
    admissionNo: string;
    className: string;
    hostel: string | null;
    room: string | null;
  };
  campus: string;
  kind: ExeatKind;
  reason: string | null;
  /** ISO */
  leaveAt: string;
  returnBy: string;
  /** "Fri 4 Dec, 15:00" */
  leaves: string;
  returns: string;
  pickup: {
    pickupPersonId: string;
    name: string;
    relationship: string;
    phone: string;
    note: string | null;
  } | null;
  collectors: ExeatCollector[];
  status: ExeatStatus;
  requestedBy: 'Parent' | 'School';
  requestedByName: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  signedOutAt: string | null;
  collectedBy: string | null;
  signedInAt: string | null;
  overdue: boolean;
  lateReturn: boolean;
}

export interface ExeatFilters {
  status?: ExeatStatus | '';
  hostelId?: string;
  q?: string;
  from?: string;
  to?: string;
}

export interface ExeatList {
  exeats: Exeat[];
  totals: { requested: number; out: number; overdue: number };
}

export interface ExeatPayload {
  studentId: string;
  kind: ExeatKind;
  reason?: string;
  /** Local "YYYY-MM-DDTHH:mm" */
  leaveAt: string;
  returnBy: string;
  pickupPersonId?: string;
}

export interface GateVisitor {
  id: string;
  name: string;
  phone: string | null;
  purpose: string;
  /** The boarder they came to see. */
  visiting: string | null;
  /** ISO */
  inAt: string;
}

export interface GateView {
  /** Approved exeats leaving within about a day. */
  leaving: Exeat[];
  /** Boarders out now (with `overdue`). */
  out: Exeat[];
  overdue: number;
  visitors: GateVisitor[];
}

export interface VisitorPayload {
  branchId: string;
  name: string;
  phone?: string;
  purpose: string;
  studentId?: string;
}

/* Roll calls */

export interface RollCallSlotSummary {
  slot: string;
  taken: boolean;
  takenAt: string | null;
  total: number;
  present: number;
  absent: number;
  exeat: number;
  sickBay: number;
  excused: number;
  unmarked: number;
}

export interface RollCallDay {
  date: string;
  hostels: {
    id: string;
    name: string;
    campus: string;
    /** Boarders placed in the hostel now (a slot's `total` counts only a taken roll call). */
    boarders?: number;
    slots: RollCallSlotSummary[];
  }[];
}

export type RollCallMark = 'Present' | 'Absent' | 'Excused';
export type RollCallAutomatic = 'On exeat' | 'Sick bay';

export interface RollCallBoarder {
  studentId: string;
  name: string;
  admissionNo: string;
  className: string;
  floor: string | null;
  room: string | null;
  bed: string | null;
  automatic: RollCallAutomatic | null;
  mark: RollCallMark | RollCallAutomatic | null;
  note: string | null;
}

export interface RollCallSheet {
  hostel: { id: string; name: string };
  /** The floor I take roll call for (floor masters), or null for the whole hostel. */
  scope: string | null;
  date: string;
  slot: string;
  slots: string[];
  taken: boolean;
  takenAt: string | null;
  takenBy: string | null;
  editable: boolean;
  boarders: RollCallBoarder[];
  counts: Partial<Record<string, number>>;
}

export interface RollCallPayload {
  date?: string;
  slot: string;
  marks: { studentId: string; mark: RollCallMark; note?: string }[];
}

/* Sick bay */

export type VisitOutcome = 'Back to class' | 'Admitted' | 'Sent home' | 'Referred to hospital';

export interface SickBayVisit {
  id: string;
  student: {
    id: string;
    name: string;
    admissionNo: string;
    className: string;
    boarder: boolean;
    medicalNotes: string | null;
  };
  campus: string;
  /** ISO */
  seenAt: string;
  /** Friendly label. */
  seen: string;
  complaint: string;
  assessment: string | null;
  treatment: string | null;
  medication: string | null;
  outcome: VisitOutcome;
  inSickBay: boolean;
  dischargedAt: string | null;
  notes: string | null;
  recordedBy: string | null;
}

export interface SickBayView {
  inSickBay: SickBayVisit[];
  visits: SickBayVisit[];
}

export interface VisitPayload {
  studentId: string;
  complaint: string;
  assessment?: string;
  treatment?: string;
  medication?: string;
  outcome: VisitOutcome;
  notes?: string;
  seenAt?: string;
}

/* Incidents */

export interface BoardingIncident {
  id: string;
  student: { id: string; name: string; admissionNo: string };
  hostel: string | null;
  occurredAt: string;
  when: string;
  category: string;
  description: string;
  action: string | null;
  status: 'Open' | 'Closed';
  sharedWithParent: boolean;
  reportedBy: string | null;
}

export interface IncidentList {
  categories: string[];
  incidents: BoardingIncident[];
}

export interface IncidentFilters {
  studentId?: string;
  hostelId?: string;
  status?: 'Open' | 'Closed' | '';
}

export interface IncidentPayload {
  studentId: string;
  category: string;
  description: string;
  action?: string;
  occurredAt?: string;
  shareWithParent?: boolean;
}

/* Property */

export interface ChecklistItem {
  id: string;
  name: string;
}

export type PropertyKind = 'Check-in' | 'Check-out';

export interface PropertyLine {
  item: string;
  present: boolean;
  quantity: number | null;
  note: string | null;
}

export interface PropertyCheck {
  checkedAt: string;
  note: string | null;
  items: PropertyLine[];
}

export interface PropertyRecord {
  term: string | null;
  items: ChecklistItem[];
  checkIn: PropertyCheck | null;
  checkOut: PropertyCheck | null;
}

export interface PropertyPayload {
  kind: PropertyKind;
  items: { item: string; present: boolean; quantity?: number; note?: string }[];
  note?: string;
}
