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
  totals: { floors: number; rooms: number; places: number };
}

export interface HostelTotals {
  hostels: number;
  rooms: number;
  places: number;
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
