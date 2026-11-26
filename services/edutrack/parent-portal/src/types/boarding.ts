/* Shapes of the Parent Portal boarding API (`/v1/parent/boarding/*`), as the backend returns them. */

export type ExeatKind =
  'Weekend' | 'Medical' | 'Family event' | 'Emergency' | 'Term break' | 'Other';
export type ExeatStatus = 'Requested' | 'Approved' | 'Declined' | 'Cancelled' | 'Out' | 'Returned';

/** Someone other than a parent who may collect the child at the gate. */
export interface PickupPerson {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  note: string | null;
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
  /** ISO. */
  leaveAt: string;
  returnBy: string;
  /** Labels: "Fri 4 Dec, 15:00". */
  leaves: string;
  returns: string;
  pickup: {
    pickupPersonId: string;
    name: string;
    relationship: string;
    phone: string;
    note: string | null;
  } | null;
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

export interface SickBayVisit {
  id: string;
  /** Label: "Tue 1 Dec, 10:20". */
  seen: string;
  seenAt: string;
  complaint: string;
  treatment: string | null;
  medication: string | null;
  outcome: 'Back to class' | 'Admitted' | 'Sent home' | 'Referred to hospital';
  inSickBay: boolean;
}

export interface VisitingDay {
  id: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:mm". */
  startsAt: string;
  endsAt: string;
  campus: string;
  branchId: string | null;
  note: string | null;
}

/** An incident the boarding house shared with parents. */
export interface BoardingIncident {
  id: string;
  when: string;
  category: string;
  description: string;
  action: string | null;
}

export interface PropertyCheck {
  checkedAt: string;
  note: string | null;
  items: { item: string; present: boolean; quantity: number; note: string }[];
}

export interface BoardingProperty {
  term: string | null;
  items: { id: string; name: string }[];
  checkIn: PropertyCheck | null;
  checkOut: PropertyCheck | null;
}

export interface ParentBoarding {
  boarder: boolean;
  pickups: PickupPerson[];
  /** Newest leave date first. */
  exeats: Exeat[];
  sickBay: SickBayVisit[];
  /** Upcoming only, soonest first. */
  visitingDays: VisitingDay[];
  incidents: BoardingIncident[];
  property: BoardingProperty;
}

export interface ExeatRequestPayload {
  kind: Exclude<ExeatKind, 'Term break'>;
  reason?: string;
  /** Lagos time, "YYYY-MM-DDTHH:mm". */
  leaveAt: string;
  returnBy: string;
  /** Null: a parent collects. */
  pickupPersonId: string | null;
}

export interface PickupPayload {
  name: string;
  relationship: string;
  phone: string;
  note?: string;
}
