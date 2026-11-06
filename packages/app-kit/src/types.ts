/** Shared shapes the app-kit components accept. */
export interface TimelineEntry {
  id: string;
  title: string;
  detail?: string;
  when: string;
  tone?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  /** In-app link for the entry, when it points at a record. */
  to?: string;
}
