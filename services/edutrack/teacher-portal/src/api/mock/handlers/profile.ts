import { mock } from '@edutrack/web-core/mock';

import type { Profile, ProfilePayload } from '@/types';

import { DEPARTMENTS, type StaffRecord } from '../school-db';
import {
  activeTerm,
  assignmentsOf,
  branchOf,
  classArmOf,
  classLabel,
  currentTeacher,
} from '../scope';
import { invalid, isNigerianMobile } from './shared';

const PHONE = 'Enter a Nigerian mobile number, like 0803 412 7781.';

function profileOf(s: StaffRecord): Profile {
  const term = activeTerm();
  const arm = classArmOf(s.id, term.id);
  return {
    id: s.id,
    title: s.title,
    firstName: s.firstName,
    lastName: s.lastName,
    name: s.name,
    email: s.email,
    staffNo: s.staffNo,
    gender: s.gender,
    phone: s.phone,
    address: s.address,
    emergencyContact: s.emergencyContact ? { ...s.emergencyContact } : null,
    position: s.position,
    department: DEPARTMENTS.find((d) => d.id === s.departmentId)?.name ?? null,
    roles: s.roles.map((r) =>
      r === 'HOD' ? `HOD · ${DEPARTMENTS.find((d) => d.hodId === s.id)?.name ?? ''}` : r,
    ),
    branches: s.branchIds.map((b) => branchOf(b).name),
    employment: s.employment,
    joinedOn: s.joinedOn,
    classTeacherOf: arm ? `${arm.name} · ${branchOf(arm.branchId).name}` : null,
    teaching: assignmentsOf(s.id, term.id).map((a) => classLabel(a.armId, a.subject)),
  };
}

mock.get('/v1/profile', (req) => profileOf(currentTeacher(req)));

/**
 * Phone (required, Nigerian mobile after removing spaces), address and emergency contact.
 * Name, email, staff number and roles are kept by the school office.
 */
mock.put('/v1/profile', (req) => {
  const s = currentTeacher(req);
  const body = (req.body ?? {}) as Partial<ProfilePayload>;
  const phone = String(body.phone ?? '').trim();
  if (!phone || !isNigerianMobile(phone)) invalid(PHONE);
  const address = String(body.address ?? '').trim();
  if (address.length > 200) invalid('Keep the address under 200 characters.');
  const ec = body.emergencyContact;
  let emergencyContact: StaffRecord['emergencyContact'] = null;
  if (ec && (ec.name?.trim() || ec.phone?.trim() || ec.relationship?.trim())) {
    if (!ec.name?.trim()) invalid('Enter the emergency contact’s name.');
    if (!ec.phone?.trim() || !isNigerianMobile(ec.phone))
      invalid('Enter the emergency contact’s Nigerian mobile number, like 0803 412 7781.');
    emergencyContact = {
      name: ec.name.trim(),
      phone: ec.phone.trim(),
      relationship: ec.relationship?.trim() ?? '',
    };
  }
  Object.assign(s, { phone, address, emergencyContact });
  return profileOf(s);
});
