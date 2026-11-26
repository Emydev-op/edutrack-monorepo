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
