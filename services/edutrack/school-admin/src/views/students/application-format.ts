/** "12 Dec 2026" from a YYYY-MM-DD date, in UTC so it never shifts with the device's time zone. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "12 Dec 2026, 09:05" from an ISO date-time. */
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Today as YYYY-MM-DD (the device's date). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** An offer still out after its accept-by date (YYYY-MM-DD strings compare as dates). */
export const offerExpired = (a: { stage: string; offerExpiresOn: string | null }) =>
  a.stage === 'Offer sent' && !!a.offerExpiresOn && a.offerExpiresOn < todayIso();
