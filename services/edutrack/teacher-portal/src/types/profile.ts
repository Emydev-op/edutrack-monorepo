export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export interface Profile {
  id: string;
  title: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  staffNo: string;
  gender: 'Male' | 'Female';
  phone: string;
  address: string;
  emergencyContact: EmergencyContact | null;
  position: string;
  department: string | null;
  roles: string[];
  branches: string[];
  employment: 'Full-time' | 'Part-time';
  joinedOn: string;
  classTeacherOf: string | null;
  /** Classes this (active) term, "JSS 2B · Mathematics". */
  teaching: string[];
}

export interface ProfilePayload {
  phone: string;
  address: string;
  emergencyContact: EmergencyContact | null;
}

export interface ChangePasswordPayload {
  current: string;
  next: string;
}
