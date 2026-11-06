import type { RevenueRange } from '@/types';

import { issues, schools } from '../db';
import { mock } from '@edutrack/web-core/mock';
import { isOpenIssue } from './shared';

const REVENUE: Record<
  RevenueRange,
  {
    label: string;
    total: number;
    previous: number;
    points: [string, number][];
    renewals: number;
    overdue: number;
  }
> = {
  '7d': {
    label: 'Last 7 days',
    total: 6.2,
    previous: 5.8,
    points: [
      ['2 Dec', 0.6],
      ['3', 1.1],
      ['4', 0.4],
      ['5', 1.9],
      ['6', 0.2],
      ['7', 0.9],
      ['8', 1.1],
    ],
    renewals: 3,
    overdue: 1,
  },
  '30d': {
    label: 'Last 30 days',
    total: 28.4,
    previous: 24.1,
    points: [
      ['Wk 45', 5.1],
      ['Wk 46', 7.6],
      ['Wk 47', 6.9],
      ['Wk 48', 8.8],
    ],
    renewals: 14,
    overdue: 3,
  },
  '3m': {
    label: 'Last 3 months',
    total: 96.7,
    previous: 81.3,
    points: [
      ['Oct', 31.2],
      ['Nov', 37.1],
      ['Dec', 28.4],
    ],
    renewals: 41,
    overdue: 5,
  },
  '6m': {
    label: 'Last 6 months',
    total: 171.2,
    previous: 149.8,
    points: [
      ['Jul', 11.4],
      ['Aug', 44.9],
      ['Sep', 52.6],
      ['Oct', 31.2],
      ['Nov', 37.1],
      ['Dec', 28.4],
    ],
    renewals: 96,
    overdue: 5,
  },
  '12m': {
    label: 'Last 12 months',
    total: 312.4,
    previous: 268,
    points: [
      ['Jan', 21],
      ['Feb', 12],
      ['Mar', 9],
      ['Apr', 18],
      ['May', 8],
      ['Jun', 7],
      ['Jul', 11],
      ['Aug', 45],
      ['Sep', 53],
      ['Oct', 31],
      ['Nov', 37],
      ['Dec', 28],
    ],
    renewals: 186,
    overdue: 5,
  },
};
// Share of each period that came from new schools; the rest is renewals and upgrades.
const NEW_SHARE = [0.18, 0.12, 0.22, 0.15, 0.2, 0.14, 0.17, 0.11, 0.19, 0.16, 0.13, 0.21];

const suspendedCount = () => 4 + schools.filter((s) => s.status === 'Suspended').length;

mock.get('/v1/dashboard/summary', () => ({
  greetingName: 'Tolu',
  generatedAt: 'Tuesday 8 December 2026, 09:30 WAT',
  totals: {
    schools: 205 + schools.length,
    active: 186,
    activeShare: '87% of schools',
    onboarding: 12 + schools.filter((s) => s.status === 'Onboarding').length,
    stalledOnboarding: 6,
    suspended: suspendedCount(),
    expired: 9,
    students: 148320,
    teachers: 9812,
    activeBranches: 341,
    createdBranches: 352,
  },
}));

mock.get('/v1/dashboard/revenue', ({ query }) => {
  const range = (query.range as RevenueRange) in REVENUE ? (query.range as RevenueRange) : '30d';
  const r = REVENUE[range];
  const ratio = r.previous / r.total;
  return {
    label: r.label,
    total: r.total,
    previousTotal: r.previous,
    points: r.points.map(([label, value], i) => {
      const newSchools = +(value * NEW_SHARE[i % 12]!).toFixed(1);
      const upgrades = +(value * 0.08).toFixed(1);
      return {
        label,
        newSchools,
        upgrades,
        renewals: +(value - newSchools - upgrades).toFixed(1),
        previous: +(value * ratio * (0.92 + ((i * 37) % 17) / 100)).toFixed(1),
      };
    }),
    stats: {
      activeSubscriptions: 186,
      renewals: r.renewals,
      overdue: r.overdue,
      overdueAmount: '₦8.9M',
      expiringSoon: 12,
    },
  };
});

mock.get('/v1/dashboard/growth', ({ query }) => {
  const year: [string, number, number, number, number][] = [
    ['Jan', 6, 151, 2, 3],
    ['Feb', 4, 154, 2, 3],
    ['Mar', 3, 156, 3, 4],
    ['Apr', 7, 161, 3, 4],
    ['May', 5, 165, 3, 5],
    ['Jun', 4, 169, 3, 5],
    ['Jul', 3, 172, 3, 6],
    ['Aug', 11, 179, 4, 7],
    ['Sep', 14, 184, 4, 8],
    ['Oct', 5, 185, 5, 8],
    ['Nov', 4, 186, 5, 9],
    ['Dec', 1, 186, suspendedCount(), 9],
  ];
  const months = query.range === '12m' ? year : year.slice(6);
  return {
    months: months.map(([month, onboarded, active, suspended, expired]) => ({
      month,
      onboarded,
      active,
      suspended,
      expired,
    })),
  };
});

mock.get('/v1/dashboard/subscription-health', () => [
  { label: 'Active', status: 'Active', schools: 186, tone: 'success' },
  { label: 'Expiring soon', status: 'Expiring', schools: 12, tone: 'warning' },
  { label: 'Grace period', status: 'Grace period', schools: 3, tone: 'warning' },
  { label: 'Restricted', status: 'Restricted', schools: 2, tone: 'error' },
  { label: 'Expired', status: 'Expired', schools: 9, tone: 'neutral' },
]);

mock.get('/v1/dashboard/attention', () => {
  const urgent = issues.filter((i) => i.priority === 'Urgent' && isOpenIssue(i)).length;
  const unassigned = issues.filter((i) => !i.assignee && i.status === 'Open').length;
  return [
    {
      id: 'unity',
      status: 'Grace period',
      text: 'Unity Model College: renewal ended 1 Dec, grace period ends 15 Dec',
      context: 'Subscription · ₦1,850,000 due',
      action: 'Manage',
      to: '/schools/unity/subscription',
    },
    {
      id: 'royal',
      status: 'Restricted',
      text: 'Royal Crest Schools restricted since 24 Nov · read-only for staff',
      context: 'Payment failed twice · Paystack',
      action: 'Open',
      to: '/schools/royal/subscription',
    },
    {
      id: 'support',
      status: 'Urgent',
      text: `${urgent} urgent and ${unassigned} unassigned support issues`,
      context: 'SUP-1182 Kingsway · result publication',
      action: 'Support',
      to: '/support',
    },
    {
      id: 'brook',
      status: 'Onboarding',
      text: 'Brookfield Schools stuck at 46% setup for 34 days',
      context: 'Next step: Fees · admin Toyin Bello',
      action: 'Open',
      to: '/schools/brook',
    },
    {
      id: 'lagoon',
      status: 'Pending',
      text: "Lagoon View College admin hasn't accepted the invitation (13 days)",
      context: 'Peter Okon · invitation expires in 1 day',
      action: 'Resend',
      to: '/schools/lagoon/administrators',
    },
    {
      id: 'kings',
      status: 'Review needed',
      text: 'Kingsway sent 14,200 SMS this week, 3× its usual volume',
      context: 'Usage · possible bulk reminder loop',
      action: 'Investigate',
      to: '/schools/kings/usage',
    },
  ];
});

mock.get('/v1/dashboard/onboarding', () =>
  schools.filter((s) => s.status === 'Onboarding' || s.setupProgress < 100),
);
