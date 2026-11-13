import { TONE_CLASSES, type StatusTone } from '@edutrack/ui/lib/status';

/** One colour per campus, so a teacher on two campuses can tell lessons apart at a glance. */
const CAMPUS_TONE: Record<string, StatusTone> = { mc: 'brand', lk: 'info' };

export const campusTone = (branchId: string): StatusTone => CAMPUS_TONE[branchId] ?? 'neutral';
export const campusClasses = (branchId: string) => TONE_CLASSES[campusTone(branchId)];
