/**
 * Boarding house management: exeats (leave), the gate, roll calls, the sick bay, visiting days,
 * incidents and boarders' property. Times are sent as local Lagos times ("YYYY-MM-DDTHH:mm");
 * responses give ISO strings plus friendly labels ("Fri 4 Dec, 15:00").
 */

/* ---------------- Dashboard ---------------- */

export interface VisitingDay {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  /** HH:mm. */
  startsAt: string;
  endsAt: string;
  campus: string;
  branchId: string;
  note: string | null;
}

export interface VisitingDayPayload {
  branchId?: string;
  date: string;
  startsAt: string;
  endsAt: string;
  note?: string;
}

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

/* ---------------- Exeats ---------------- */

export type ExeatKind =
  'Weekend' | 'Medical' | 'Family event' | 'Emergency' | 'Term break' | 'Other';
export type ExeatStatus = 'Requested' | 'Approved' | 'Declined' | 'Cancelled' | 'Out' | 'Returned';

export interface ExeatStudent {
  id: string;
  name: string;
  admissionNo: string;
  className: string;
  hostel: string | null;
  room: string | null;
}

export interface ExeatPickup {
  pickupPersonId: string;
  name: string;
  relationship: string;
  phone: string;
  note: string | null;
}

/** Someone the gate may hand the boarder to: `pickup:<id>` or `guardian:<id>`. */
export interface ExeatCollector {
  key: string;
  name: string;
  relationship: string;
}

export interface Exeat {
  id: string;
  student: ExeatStudent;
  campus: string;
  kind: ExeatKind;
  reason: string | null;
  leaveAt: string;
  returnBy: string;
  /** "Fri 4 Dec, 15:00". */
  leaves: string;
  returns: string;
  /** Null when a parent collects. */
  pickup: ExeatPickup | null;
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

export interface ExeatQuery {
  status?: string;
  branchId?: string;
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
  leaveAt: string;
  returnBy: string;
  pickupPersonId?: string | null;
}

export interface TermBreakPayload {
  branchId: string;
  hostelId?: string;
  leaveAt: string;
  returnBy: string;
  reason?: string;
}

export interface TermBreakResult {
  created: number;
  skipped: number;
  batchId: string;
}

/* ---------------- Gate ---------------- */

export interface GateVisitor {
  id: string;
  name: string;
  phone: string | null;
  purpose: string;
  /** The boarder being visited, if any. */
  visiting: string | null;
  inAt: string;
}

export interface GateView {
  /** Approved exeats leaving within about a day. */
  leaving: Exeat[];
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

/* ---------------- Pickup people ---------------- */

export interface PickupPerson {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  note: string | null;
}

export interface PickupPayload {
  name: string;
  relationship: string;
  phone: string;
  note?: string;
}

/* ---------------- Roll calls ---------------- */

export type RollCallMark = 'Present' | 'Absent' | 'Excused';
export type RollCallAutomatic = 'On exeat' | 'Sick bay';

export interface RollCallCounts {
  total: number;
  present: number;
  absent: number;
  exeat: number;
  sickBay: number;
  excused: number;
  unmarked: number;
}

export interface RollCallSlotSummary extends RollCallCounts {
  slot: string;
  taken: boolean;
  takenAt: string | null;
}

export interface RollCallHostel {
  id: string;
  name: string;
  campus: string;
  /** Boarders placed in the hostel now (a slot's `total` counts only a taken roll call). */
  boarders?: number;
  slots: RollCallSlotSummary[];
}

export interface RollCallDay {
  date: string;
  hostels: RollCallHostel[];
}

export interface RollCallBoarder {
  studentId: string;
  name: string;
  admissionNo: string;
  className: string;
  floor: string | null;
  room: string | null;
  bed: string | null;
  /** Marked by the system and locked: away on exeat or in the sick bay. */
  automatic: RollCallAutomatic | null;
  mark: RollCallMark | RollCallAutomatic | null;
  note: string | null;
}

export interface RollCallSheet {
  hostel: { id: string; name: string };
  /** The floor a floor master sees, or null for the whole hostel. */
  scope: string | null;
  date: string;
  slot: string;
  slots: string[];
  taken: boolean;
  takenAt: string | null;
  takenBy: string | null;
  editable: boolean;
  boarders: RollCallBoarder[];
  counts: Partial<RollCallCounts>;
}

export interface RollCallPayload {
  date?: string;
  slot: string;
  marks: { studentId: string; mark: RollCallMark; note?: string }[];
}

/* ---------------- Sick bay ---------------- */

export type SickBayOutcome = 'Back to class' | 'Admitted' | 'Sent home' | 'Referred to hospital';

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
  seenAt: string;
  /** "Fri 4 Dec, 15:00". */
  seen: string;
  complaint: string;
  assessment: string | null;
  treatment: string | null;
  medication: string | null;
  outcome: SickBayOutcome;
  inSickBay: boolean;
  dischargedAt: string | null;
  notes: string | null;
  recordedBy: string | null;
}

export interface SickBayQuery {
  studentId?: string;
  branchId?: string;
  days?: number;
}

export interface SickBayList {
  inSickBay: SickBayVisit[];
  visits: SickBayVisit[];
}

export interface SickVisitPayload {
  studentId: string;
  complaint: string;
  assessment?: string;
  treatment?: string;
  medication?: string;
  outcome: SickBayOutcome;
  notes?: string;
  seenAt?: string;
}

/* ---------------- Incidents ---------------- */

export type IncidentStatus = 'Open' | 'Closed';

export interface Incident {
  id: string;
  student: { id: string; name: string; admissionNo: string };
  hostel: string | null;
  occurredAt: string;
  when: string;
  category: string;
  description: string;
  action: string | null;
  status: IncidentStatus;
  sharedWithParent: boolean;
  reportedBy: string | null;
}

export interface IncidentQuery {
  studentId?: string;
  hostelId?: string;
  status?: string;
}

export interface IncidentList {
  categories: string[];
  incidents: Incident[];
}

export interface IncidentPayload {
  studentId: string;
  category: string;
  description: string;
  action?: string;
  occurredAt?: string;
  shareWithParent?: boolean;
}

/* ---------------- Property ---------------- */

export interface PropertyChecklistItem {
  id: string;
  name: string;
}

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

export type PropertyKind = 'Check-in' | 'Check-out';

export interface StudentProperty {
  term: string | null;
  items: PropertyChecklistItem[];
  checkIn: PropertyCheck | null;
  checkOut: PropertyCheck | null;
}

export interface PropertyPayload {
  kind: PropertyKind;
  items: { item: string; present: boolean; quantity?: number; note?: string }[];
  note?: string;
}
