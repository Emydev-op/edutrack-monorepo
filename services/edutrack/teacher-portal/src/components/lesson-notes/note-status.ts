import type { StatusTone } from '@edutrack/ui/lib/status';

import type { LessonNoteSlotStatus } from '@/types';

/** One tone per lesson-note status, the same on the list, the note and the review queue. */
export const NOTE_TONES: Record<LessonNoteSlotStatus, StatusTone> = {
  'Not written': 'neutral',
  Draft: 'neutral',
  Submitted: 'info',
  Approved: 'success',
  Returned: 'error',
};

/** "123 KB" / "2.4 MB" */
export function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
