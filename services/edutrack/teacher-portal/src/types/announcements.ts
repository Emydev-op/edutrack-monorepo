export interface AnnouncementSummary {
  id: string;
  title: string;
  /** First lines of the body. */
  summary: string;
  audience: 'Teachers' | 'Whole school';
  /** "All campuses" or a campus name. */
  campuses: string;
  author: string;
  authorRole: string;
  publishedAt: string;
  /** "7 Dec 2026" / "Today 09:00" on the API's clock. */
  when: string;
  pinned: boolean;
}

export interface AnnouncementDetail extends AnnouncementSummary {
  body: string;
}
