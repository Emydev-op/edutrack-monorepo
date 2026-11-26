/** Boarding: which sections board at each campus, and the hostels with their floors and rooms. */

export interface BoardingLevel {
  id: string;
  name: string;
}

export interface BoardingSectionSetting {
  sectionId: string;
  name: string;
  boarding: boolean;
  /** The class levels that board. Empty means every level in the section. */
  levelIds: string[];
  levels: BoardingLevel[];
}

export interface BoardingCampus {
  branchId: string;
  name: string;
  sections: BoardingSectionSetting[];
}

export interface BoardingSettings {
  enabled: boolean;
  campuses: BoardingCampus[];
}

export interface BoardingSettingsPayload {
  campuses: {
    branchId: string;
    sections: { sectionId: string; boarding: boolean; levelIds?: string[] }[];
  }[];
}

export type HostelGender = 'Boys' | 'Girls' | 'Mixed';
export type HostelStaffRole = 'House master / mistress' | 'Floor master / mistress' | 'Assistant';

export interface HostelStaff {
  id: string;
  staffId: string;
  name: string;
  role: HostelStaffRole;
  floorId: string | null;
  active: boolean;
}

export interface HostelFloor {
  id: string;
  name: string;
  rooms: number;
  places: number;
  staff: HostelStaff[];
}

export interface HostelRoom {
  id: string;
  name: string;
  floorId: string | null;
  capacity: number;
  beds: string[];
  /** Places taken by boarders this session. */
  taken: number;
}

export interface Hostel {
  id: string;
  name: string;
  branchId: string;
  campus: string;
  gender: HostelGender;
  levelIds: string[];
  /** Class names, or ['All boarding classes']. */
  levels: string[];
  note: string;
  floors: HostelFloor[];
  rooms: HostelRoom[];
  staff: HostelStaff[];
  totals: { floors: number; rooms: number; places: number; taken: number; free: number };
}

export interface HostelTotals {
  hostels: number;
  rooms: number;
  places: number;
  taken: number;
}

export interface HostelList {
  hostels: Hostel[];
  totals: HostelTotals;
}

export interface HostelPayload {
  branchId: string;
  name: string;
  gender: HostelGender;
  levelIds?: string[];
  note?: string;
}

export interface RoomPayload {
  name: string;
  capacity: number;
  floorId?: string | null;
  /** One label per place, or none. */
  beds?: string[];
}

export type BedStyle = 'none' | 'numbers' | 'letters';

export interface GenerateRoomsPayload {
  floorId?: string | null;
  count: number;
  prefix?: string;
  startAt?: number;
  capacity: number;
  bedStyle?: BedStyle;
}

export interface HostelStaffEntry {
  staffId: string;
  role: HostelStaffRole;
  floorId?: string | null;
}

export interface RoomImportRow {
  line: number;
  campus: string;
  hostel: string;
  gender: string;
  floor: string;
  room: string;
  capacity: number;
  beds: string[];
  newHostel: boolean;
  newFloor: boolean;
  errors: string[];
  warnings: string[];
}

export interface RoomImportBatch {
  id: string;
  fileName: string;
  rows: RoomImportRow[];
}

export interface RoomImportResult {
  imported: number;
  hostels: number;
  skipped: number;
  problems: string[];
}

/* ---------------- Boarders and beds ---------------- */

export type BoardingStatus = 'Boarder' | 'Day';

export interface HouseStaffMember {
  staffId: string;
  name: string;
  role: string;
}

/** Where a boarder sleeps this session. */
export interface BoardingPlace {
  hostelId: string;
  hostel: string;
  floor: string | null;
  roomId: string;
  room: string;
  bed: string | null;
}

/** A student's boarding this session (the student record's Boarding tab). */
export interface StudentBoarding {
  studentId: string;
  name: string;
  session: string;
  campus: string;
  className: string;
  /** Their campus and class take boarders; `reason` says why not. */
  eligible: boolean;
  reason: string | null;
  boarding: boolean;
  status: BoardingStatus;
  place: (BoardingPlace & { since: string; houseStaff: HouseStaffMember[] }) | null;
  editable: boolean;
  /** Returned after a boarding change: what happened to this term's boarding fees. */
  fees?: BoardingFeeChange | null;
}

export interface BoardingFeeChange {
  change: 'added' | 'removed' | 'kept' | 'none';
  amount: number;
  note: string | null;
}

export interface StudentBoardingPayload {
  boarding: boolean;
  roomId?: string;
  bed?: string | null;
  confirm?: boolean;
}

export interface MarkBoardingResult {
  results: { studentId: string; name: string; done: boolean; reason: string | null }[];
  changed: number;
}

export interface AllocationPayload {
  studentId: string;
  roomId: string;
  bed?: string | null;
  /** Goes ahead despite warnings (another gender's hostel, other classes). */
  confirm?: boolean;
}

export interface BoarderRow {
  studentId: string;
  name: string;
  admissionNo: string;
  gender: 'Female' | 'Male';
  campus: string;
  branchId: string;
  levelId: string;
  className: string;
  place: BoardingPlace | null;
}

export interface BoarderQuery {
  branchId?: string;
  hostelId?: string;
  levelId?: string;
  /** Only boarders without a room. */
  unplaced?: boolean;
  q?: string;
}

export interface BoarderList {
  session: string;
  boarders: BoarderRow[];
  totals: { boarders: number; placed: number; unplaced: number };
}

export interface RoomOccupant {
  studentId: string;
  name: string;
  gender: 'Female' | 'Male';
  className: string;
  bed: string | null;
}

export interface OccupancyRoom {
  id: string;
  name: string;
  floorId: string | null;
  capacity: number;
  beds: string[];
  taken: number;
  free: number;
  occupants: RoomOccupant[];
}

export interface HostelOccupancy {
  session: string;
  hostel: { id: string; name: string; campus: string; gender: HostelGender };
  floors: { id: string; name: string }[];
  rooms: OccupancyRoom[];
  totals: { places: number; taken: number; free: number };
}

export interface AutoAllocateResult extends HostelOccupancy {
  placed: number;
  waiting: number;
}
