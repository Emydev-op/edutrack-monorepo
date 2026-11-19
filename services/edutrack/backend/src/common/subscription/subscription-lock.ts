import type { SubscriptionStatus } from '../../generated/prisma/enums.js';

/**
 * A school whose subscription is restricted, expired or cancelled: School Admin can sign in and
 * look at everything but change nothing (except Support, so they can sort the subscription out),
 * and the Teacher Workspace, Parent Portal and Student Portal don't open at all.
 */
export const LOCKED_SUBSCRIPTION: readonly SubscriptionStatus[] = [
  'RESTRICTED',
  'EXPIRED',
  'CANCELLED',
];

export const isSubscriptionLocked = (status: SubscriptionStatus | null | undefined) =>
  !!status && LOCKED_SUBSCRIPTION.includes(status);

/** What a teacher, parent or pupil is told when their school's subscription has lapsed. */
export const lapsedMessage = (schoolName: string) =>
  `${schoolName}’s EduTrack subscription has lapsed, so this portal is closed for now. Contact the school.`;

/** What a School Admin is told when they try to change something while it's locked. */
export const readOnlyMessage = (schoolName: string) =>
  `${schoolName}’s EduTrack subscription has lapsed, so School Admin is view-only until it’s renewed. You can still raise a support ticket.`;
