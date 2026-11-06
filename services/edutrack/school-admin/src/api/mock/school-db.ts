/*
 * School section data (profile, branches, staff, users, roles, organogram) for the mock API,
 * per school. Seeded from the School Admin design.
 */
import type { FileRef, RoleScope, SchoolSection, TimelineEntry, UserStatus } from '@/types';

export interface ProfileRow {
  name: string;
  legalName: string;
  ownership: string;
  sections: SchoolSection[];
  brandColor: string;
  motto: string;
  founded: string;
  logo: FileRef | null;
  email: string;
  phone: string;
  website: string;
  street: string;
  city: string;
  lga: string;
  state: string;
  approvingBody: string;
  approvalNumber: string;
  cacNumber: string;
  certificate: FileRef | null;
  plan: {
    name: string;
    students: number;
    studentLimit: number;
    branchLimit: number;
    renews: string;
  };
  updatedAt: string;
}

export interface BranchRow {
  id: string;
  name: string;
  code: string;
  street: string;
  city: string;
  lga: string;
  state: string;
  phone: string;
  email: string;
  headId: string | null;
  sections: SchoolSection[];
  hasStore: boolean;
  status: 'Active' | 'Inactive';
  students: number;
  staff: number;
  classArms: number;
  /** Created at provisioning: can be deactivated but never deleted. */
  original: boolean;
}

export interface StaffRow {
  id: string;
  name: string;
  position: string;
  staffNumber: string;
  /** Branch names, or "All branches". */
  branch: string;
  left?: boolean;
}

export interface UserRow {
  id: string;
  staffId: string | null;
  name: string;
  email: string;
  position: string;
  roles: string[];
  scope: 'School' | 'Branch';
  branches: string[];
  status: UserStatus;
  lastActive: string;
  created: string;
  invited: string | null;
}

export interface RoleRow {
  id: string;
  name: string;
  type: 'Predefined' | 'Custom';
  scope: RoleScope;
  description: string;
  permissions: Record<string, string[]>;
}

export interface PositionRow {
  id: string;
  title: string;
  parentId: string | null;
  holderIds: string[];
  suggestedRoles: string[];
  responsibilities: string;
  approvals: string[];
}

export interface LogRow extends TimelineEntry {
  /** What the entry is about: "School", "Branch:mc", "User:okoro", "Role", "Org". */
  entity: string;
}

export interface SchoolData {
  /** The signed-in admin's staff id, who can't suspend or demote themself. */
  adminStaffId: string;
  profile: ProfileRow;
  branches: BranchRow[];
  staff: StaffRow[];
  users: UserRow[];
  roles: RoleRow[];
  positions: PositionRow[];
  log: LogRow[];
}

const ALL_SECTIONS: SchoolSection[] = [
  'Nursery',
  'Primary',
  'Junior Secondary',
  'Senior Secondary',
];

const ALL_PERMISSIONS = {
  students: ['view', 'create', 'edit', 'archive', 'promote'],
  academics: ['view', 'configure', 'timetable'],
  results: ['view', 'enter', 'review', 'approve', 'publish', 'correct'],
  finance: ['view', 'invoice', 'payment', 'refund', 'expenses', 'payroll'],
  inventory: ['view', 'request', 'issue', 'adjust'],
  comms: ['view', 'class', 'school'],
  settings: ['profile', 'branches', 'users', 'roles'],
};

const role = (
  id: string,
  name: string,
  type: RoleRow['type'],
  scope: RoleScope,
  description: string,
  permissions: Record<string, string[]>,
): RoleRow => ({ id, name, type, scope, description, permissions });

const predefinedRoles = (): RoleRow[] => [
  role(
    'owner',
    'Owner',
    'Predefined',
    'School',
    'Full access including subscription and payroll approval',
    ALL_PERMISSIONS,
  ),
  role(
    'admin',
    'School Admin',
    'Predefined',
    'School',
    'Configure the school, users and academic structure',
    {
      students: ['view', 'create', 'edit', 'archive', 'promote'],
      academics: ['view', 'configure', 'timetable'],
      results: ['view', 'publish'],
      finance: ['view'],
      inventory: ['view'],
      comms: ['view', 'class', 'school'],
      settings: ['profile', 'branches', 'users', 'roles'],
    },
  ),
  role(
    'principal',
    'Principal',
    'Predefined',
    'Branch',
    'Publish results, confirm promotion, approve refunds',
    {
      students: ['view', 'edit', 'promote'],
      academics: ['view'],
      results: ['view', 'approve', 'publish', 'correct'],
      finance: ['view', 'refund'],
      comms: ['view', 'class', 'school'],
    },
  ),
  role(
    'acad',
    'Academic Head',
    'Predefined',
    'Section',
    'Approve results, manage curriculum and timetable',
    {
      students: ['view', 'edit', 'promote'],
      academics: ['view', 'configure', 'timetable'],
      results: ['view', 'review', 'approve'],
      comms: ['view', 'class'],
    },
  ),
  role('hod', 'HOD', 'Predefined', 'Department', 'Review results for their subjects', {
    students: ['view'],
    academics: ['view'],
    results: ['view', 'enter', 'review'],
    comms: ['view', 'class'],
  }),
  role(
    'teacher',
    'Teacher',
    'Predefined',
    'Assigned classes',
    'Enter scores, assignments, materials',
    {
      students: ['view'],
      academics: ['view'],
      results: ['view', 'enter'],
      comms: ['view', 'class'],
    },
  ),
  role('bursar', 'Bursar', 'Predefined', 'School', 'Fees, payments, expenses, payroll review', {
    students: ['view'],
    finance: ['view', 'invoice', 'payment', 'refund', 'expenses', 'payroll'],
    inventory: ['view'],
  }),
  role('accountant', 'Accountant', 'Predefined', 'Branch', 'Record and verify payments', {
    students: ['view'],
    finance: ['view', 'payment'],
  }),
  role('inventory', 'Inventory Officer', 'Predefined', 'Store', 'Stock movements and counts', {
    inventory: ['view', 'request', 'issue', 'adjust'],
  }),
  role('branch', 'Branch Admin', 'Predefined', 'Branch', 'Run one campus', {
    students: ['view', 'create', 'edit'],
    academics: ['view', 'timetable'],
    results: ['view'],
    finance: ['view'],
    inventory: ['view', 'request'],
    comms: ['view', 'class', 'school'],
  }),
];

/* ---------------- Greenfield Academy ---------------- */

const GF_STAFF: [
  string,
  string,
  string,
  string,
  string,
  UserStatus | 'No account',
  string,
  string,
  boolean?,
][] = [
  // id, name, position, staff no., branch, account, roles, since, left
  [
    'ogunbiyi',
    'Dr. Folasade Ogunbiyi',
    'Proprietor',
    'GFA-ST-0001',
    'All branches',
    'Active',
    'Owner',
    'Sep 2009',
  ],
  [
    'okonkwo',
    'Mrs. Adaeze Okonkwo',
    'Principal',
    'GFA-ST-0004',
    'Main Campus',
    'Active',
    'School Admin · Principal',
    'Jan 2015',
  ],
  [
    'eze',
    'Mrs. Chioma Eze',
    'Vice Principal (Academics)',
    'GFA-ST-0021',
    'Main Campus',
    'Active',
    'Academic Head · Teacher',
    'Sep 2016',
  ],
  [
    'bello',
    'Mr. Ibrahim Bello',
    'HOD Sciences · Physics Teacher',
    'GFA-ST-0045',
    'Main Campus',
    'Active',
    'HOD · Teacher',
    'Sep 2017',
  ],
  [
    'ade',
    'Mr. Samuel Ade',
    'Mathematics Teacher',
    'GFA-ST-0117',
    'Main Campus + Lekki Campus',
    'Active',
    'Teacher',
    'Sep 2019',
  ],
  [
    'okafor',
    'Mrs. Grace Okafor',
    'English Teacher · Class Teacher JSS 2B',
    'GFA-ST-0098',
    'Main Campus',
    'Active',
    'Teacher',
    'Sep 2018',
  ],
  [
    'adebayo',
    'Mr. Femi Adebayo',
    'Head of Campus, Lekki',
    'GFA-ST-0062',
    'Lekki Campus',
    'Active',
    'Branch Admin',
    'Sep 2018',
  ],
  [
    'nwachukwu',
    'Mrs. Ifeoma Nwachukwu',
    'Nursery Coordinator',
    'GFA-ST-0071',
    'Main Campus',
    'Active',
    'Academic Head · Teacher',
    'Jan 2019',
  ],
  [
    'bakare',
    'Mr. Kunle Bakare',
    'Bursar',
    'GFA-ST-0033',
    'All branches',
    'Active',
    'Bursar',
    'Mar 2017',
  ],
  [
    'lawal',
    'Ms. Kemi Lawal',
    'Accounts Officer',
    'GFA-ST-0151',
    'Main Campus',
    'Invited',
    'Accountant',
    'Nov 2026',
  ],
  [
    'okoro',
    'Mr. Chidi Okoro',
    'ICT Administrator',
    'GFA-ST-0088',
    'All branches',
    'Suspended',
    'School Admin · Teacher',
    'Sep 2018',
  ],
  [
    'yakubu',
    'Mr. Musa Yakubu',
    'Store Keeper',
    'GFA-ST-0103',
    'Main Campus',
    'Active',
    'Inventory Officer',
    'Feb 2019',
  ],
  [
    'adamu',
    'Mr. Peter Adamu',
    'Driver',
    'GFA-ST-0126',
    'Main Campus',
    'No account',
    '',
    'May 2021',
  ],
  [
    'ojo',
    'Mr. Tunde Ojo',
    'Chemistry Teacher',
    'GFA-ST-0079',
    'Main Campus',
    'Deactivated',
    '',
    'Sep 2018',
    true,
  ],
];
const LAST_ACTIVE = ['Today', '2 hr ago', 'Yesterday', '3 Dec'];

function greenfield(): SchoolData {
  const staff: StaffRow[] = GF_STAFF.map(
    ([id, name, position, staffNumber, branch, , , , left]) => ({
      id,
      name,
      position,
      staffNumber,
      branch,
      ...(left && { left }),
    }),
  );
  const users: UserRow[] = GF_STAFF.filter((s) => s[5] !== 'No account').map(
    ([id, name, position, , branch, account, roles, since], i) => ({
      id,
      staffId: id,
      name,
      email: `${id}@greenfieldacademy.ng`,
      position,
      roles: roles ? roles.split(' · ') : [],
      scope: branch === 'All branches' ? 'School' : 'Branch',
      branches: branch === 'All branches' ? [] : branch.split(' + '),
      status: account as UserStatus,
      lastActive: account === 'Active' ? LAST_ACTIVE[i % 4]! : '—',
      created: since,
      invited: account === 'Invited' ? '4 Dec 2026' : null,
    }),
  );
  return {
    adminStaffId: 'okonkwo',
    profile: {
      name: 'Greenfield Academy',
      legalName: 'Greenfield Academy Limited',
      ownership: 'Private',
      sections: ALL_SECTIONS,
      brandColor: '#9B403C',
      motto: 'Knowledge · Character · Service',
      founded: '2009',
      logo: null,
      email: 'info@greenfieldacademy.ng',
      phone: '+234 803 555 0142',
      website: 'greenfieldacademy.ng',
      street: '14 Adeniyi Jones Avenue',
      city: 'Ikeja',
      lga: 'Ikeja',
      state: 'Lagos',
      approvingBody: 'Lagos State Ministry of Basic & Secondary Education',
      approvalNumber: 'LSMOE/PS/2009/0418',
      cacNumber: 'RC 1184206',
      certificate: { name: 'approval-certificate.pdf', size: '412 KB' },
      plan: {
        name: 'Growth',
        students: 1248,
        studentLimit: 1500,
        branchLimit: 5,
        renews: '31 Aug 2027',
      },
      updatedAt: '2 Sep 2026',
    },
    branches: [
      {
        id: 'mc',
        name: 'Main Campus',
        code: 'GFA-MC',
        street: '14 Adeniyi Jones Ave',
        city: 'Ikeja',
        lga: 'Ikeja',
        state: 'Lagos',
        phone: '+234 803 555 0142',
        email: 'main@greenfieldacademy.ng',
        headId: 'okonkwo',
        sections: ALL_SECTIONS,
        hasStore: true,
        status: 'Active',
        students: 842,
        staff: 76,
        classArms: 31,
        original: true,
      },
      {
        id: 'lk',
        name: 'Lekki Campus',
        code: 'GFA-LK',
        street: '7 Admiralty Way, Lekki Phase 1',
        city: 'Lekki',
        lga: 'Eti Osa',
        state: 'Lagos',
        phone: '+234 803 555 0150',
        email: 'lekki@greenfieldacademy.ng',
        headId: 'adebayo',
        sections: ['Nursery', 'Primary', 'Senior Secondary'],
        hasStore: true,
        status: 'Active',
        students: 406,
        staff: 36,
        classArms: 17,
        original: true,
      },
      {
        id: 'aj',
        name: 'Ajah Annex',
        code: 'GFA-AJ',
        street: 'Abraham Adesanya Estate',
        city: 'Ajah',
        lga: 'Eti Osa',
        state: 'Lagos',
        phone: '',
        email: '',
        headId: null,
        sections: ['Nursery'],
        hasStore: false,
        status: 'Inactive',
        students: 0,
        staff: 0,
        classArms: 0,
        original: true,
      },
    ],
    staff,
    users,
    roles: [
      ...predefinedRoles(),
      role(
        'admissions',
        'Admissions Officer',
        'Custom',
        'Branch',
        'Process applications and admissions only',
        {
          students: ['view', 'create'],
          comms: ['view'],
        },
      ),
      role(
        'exams',
        'Exams Officer',
        'Custom',
        'Section',
        'Assessment setup and result completion tracking',
        {
          academics: ['view', 'configure'],
          results: ['view', 'review'],
        },
      ),
    ],
    positions: [
      [
        'prop',
        'Proprietor',
        null,
        ['ogunbiyi'],
        ['Owner'],
        'Sets school policy and fees. Chairs the Board of Governors.',
        ['Payroll: final approval', 'Refunds above ₦500,000'],
      ],
      [
        'principal',
        'Principal',
        'prop',
        ['okonkwo'],
        ['School Admin', 'Principal'],
        'Leads academics and operations. Signs report cards.',
        [
          'Results: publish',
          'Promotion: confirm',
          'Refunds up to ₦500,000',
          'Session and term closure',
        ],
      ],
      [
        'vpa',
        'Vice Principal (Academics)',
        'principal',
        ['eze'],
        ['Academic Head', 'Teacher'],
        'Curriculum, timetable and assessments.',
        ['Results: approve', 'Promotion: decide', 'Result corrections'],
      ],
      [
        'bursar',
        'Bursar',
        'principal',
        ['bakare'],
        ['Bursar'],
        'Fees, payments, expenses and payroll.',
        ['Payroll: review', 'Expenses up to ₦250,000'],
      ],
      [
        'lekki',
        'Head of Campus, Lekki',
        'principal',
        ['adebayo'],
        ['Branch Admin'],
        'Runs Lekki Campus day to day.',
        ['Admissions', 'Stock requests: approve'],
      ],
      [
        'ict',
        'ICT Administrator',
        'principal',
        ['okoro'],
        ['School Admin', 'Teacher'],
        'User accounts, devices and Computer Studies.',
        ['User invitations'],
      ],
      [
        'hods',
        'HOD Sciences',
        'vpa',
        ['bello'],
        ['HOD', 'Teacher'],
        'Sciences department, 14 teachers.',
        ['Results: review'],
      ],
      [
        'hodl',
        'HOD Languages',
        'vpa',
        [],
        ['HOD', 'Teacher'],
        'Languages department, 11 teachers.',
        ['Results: review'],
      ],
      [
        'nur',
        'Nursery Coordinator',
        'vpa',
        ['nwachukwu'],
        ['Academic Head', 'Teacher'],
        'Nursery section, both campuses.',
        ['Results: review'],
      ],
      [
        'math',
        'Mathematics Teacher',
        'hods',
        ['ade'],
        ['Teacher'],
        'Teaches Mathematics across JSS and SSS.',
        ['Results: enter and submit'],
      ],
      [
        'acct',
        'Accounts Officer',
        'bursar',
        ['lawal'],
        ['Accountant'],
        'Receipts and reconciliation.',
        ['Payroll: calculate'],
      ],
      [
        'store',
        'Store Keeper',
        'ict',
        ['yakubu'],
        ['Inventory Officer'],
        'Main Store.',
        ['Stock issue'],
      ],
    ].map(([id, title, parentId, holderIds, suggestedRoles, responsibilities, approvals]) => ({
      id: id as string,
      title: title as string,
      parentId: parentId as string | null,
      holderIds: holderIds as string[],
      suggestedRoles: suggestedRoles as string[],
      responsibilities: responsibilities as string,
      approvals: approvals as string[],
    })),
    log: [
      {
        id: 'l1',
        entity: 'School',
        title: 'Logo updated',
        detail: 'Chidi Okoro · logo-2026.png replaced logo-2019.png',
        when: '2 Sep',
      },
      {
        id: 'l2',
        entity: 'Branch:lk',
        title: 'Senior Secondary added',
        detail: 'Adaeze Okonkwo',
        when: '15 Aug',
      },
      {
        id: 'l3',
        entity: 'School',
        title: 'Subscription renewed · Growth · Annual',
        detail: 'Dr. Folasade Ogunbiyi',
        when: '1 Aug',
      },
      {
        id: 'l4',
        entity: 'Branch:mc',
        title: 'Timetable v2 published',
        detail: 'First Term · effective 14 Sep',
        when: '12 Sep',
      },
      {
        id: 'l5',
        entity: 'Branch:lk',
        title: 'Mr. Samuel Ade assigned (part-time)',
        detail: 'Further Mathematics · SSS 1A',
        when: '1 Sep',
      },
      {
        id: 'l6',
        entity: 'User:okoro',
        title: 'Suspended account',
        detail: 'Adaeze Okonkwo · On leave until January',
        when: '28 Nov',
      },
    ],
  };
}

/* ---------------- Crestview College (new) ---------------- */

function crestview(): SchoolData {
  return {
    adminStaffId: 'udo',
    profile: {
      name: 'Crestview College',
      legalName: 'Crestview College Ltd',
      ownership: 'Private',
      sections: ['Junior Secondary', 'Senior Secondary'],
      brandColor: '#24497A',
      motto: '',
      founded: '',
      logo: null,
      email: 'info@crestviewcollege.ng',
      phone: '0809 555 0123',
      website: '',
      street: 'Dutse',
      city: 'Bwari',
      lga: 'Bwari',
      state: 'FCT',
      approvingBody: 'FCT Education Secretariat',
      approvalNumber: 'FCT/SEC/2015/0221',
      cacNumber: '',
      certificate: null,
      plan: {
        name: 'Starter',
        students: 0,
        studentLimit: 500,
        branchLimit: 2,
        renews: '4 Nov 2027',
      },
      updatedAt: 'when Edutrack created the school',
    },
    branches: [
      {
        id: 'cmc',
        name: 'Main Campus',
        code: 'CC-MC',
        street: 'Dutse',
        city: 'Bwari',
        lga: 'Bwari',
        state: 'FCT',
        phone: '',
        email: '',
        headId: 'udo',
        sections: ['Junior Secondary', 'Senior Secondary'],
        hasStore: true,
        status: 'Active',
        students: 0,
        staff: 1,
        classArms: 0,
        original: true,
      },
    ],
    staff: [
      {
        id: 'udo',
        name: 'Mr. Emem Udo',
        position: 'Principal',
        staffNumber: 'CC-ST-0001',
        branch: 'All branches',
      },
    ],
    users: [
      {
        id: 'udo',
        staffId: 'udo',
        name: 'Mr. Emem Udo',
        email: 'e.udo@crestviewcollege.ng',
        position: 'Principal',
        roles: ['School Admin', 'Principal'],
        scope: 'School',
        branches: [],
        status: 'Active',
        lastActive: 'Today',
        created: 'Nov 2026',
        invited: null,
      },
    ],
    roles: predefinedRoles(),
    positions: [
      {
        id: 'principal',
        title: 'Principal',
        parentId: null,
        holderIds: ['udo'],
        suggestedRoles: ['School Admin', 'Principal'],
        responsibilities: 'Leads academics and operations.',
        approvals: ['Results: publish', 'Promotion: confirm', 'Session and term closure'],
      },
    ],
    log: [
      {
        id: 'c1',
        entity: 'School',
        title: 'School created by Edutrack',
        detail: 'From provisioning · Starter plan',
        when: '4 Nov',
      },
    ],
  };
}

export const schoolData: Record<string, SchoolData> = {
  greenfield: greenfield(),
  crestview: crestview(),
};
