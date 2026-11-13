import type { SheetStatus } from '@/types';

/**
 * How a sheet status reads in School Admin. Submitted means the sheet is with the department's
 * HOD; it reaches the academic office as Under review once the HOD forwards it.
 */
export const sheetStatusLabel = (s: SheetStatus) => (s === 'Submitted' ? 'With HOD' : s);
