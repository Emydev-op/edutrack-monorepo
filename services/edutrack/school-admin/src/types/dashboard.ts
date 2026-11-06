import type { StatusTone } from '@edutrack/ui/lib/status';
import type { RouteLocationRaw } from 'vue-router';

import type { TimelineEntry } from './common';

export interface DashboardMetric {
  label: string;
  value: string;
  hint: string;
  /** Colour of the hint: good news, something to look at, or a problem. */
  hintTone: 'success' | 'warning' | 'error' | 'neutral';
}

export interface AttentionItem {
  id: string;
  badge: { label: string; tone: StatusTone };
  text: string;
  area: string;
  action: string;
  to: RouteLocationRaw;
}

export type CalendarEventType =
  'Examination' | 'Results' | 'Meeting' | 'PTA' | 'Event' | 'Term' | 'Break' | 'Holiday';

export interface DashboardSummary {
  /** False for a school with no students, staff or classes yet. */
  hasData: boolean;
  metrics: DashboardMetric[];
  attention: AttentionItem[];
  upcoming: { date: string; title: string; type: CalendarEventType }[];
  /** Students per session, oldest first. */
  enrollment: { label: string; value: number }[];
  /** Average of approved result sheets, per subject. */
  performance: { label: string; percent: number }[];
  activity: TimelineEntry[];
}

/** Fee figures come from the finance service and can fail on their own. */
export interface DashboardFinance {
  /** Receipts per week in naira; the last week is still in progress. */
  weekly: { label: string; value: number }[];
  /** Share of First Term fees collected, by section. */
  sections: { label: string; percent: number }[];
}
