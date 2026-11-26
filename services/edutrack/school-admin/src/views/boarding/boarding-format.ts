import type { StatusTone } from '@edutrack/ui/lib/status';

import type {
  BedStyle,
  BoardingCampus,
  BoardingSettings,
  HostelGender,
  HostelStaffRole,
} from '@/types';

export const GENDERS: HostelGender[] = ['Boys', 'Girls', 'Mixed'];
export const GENDER_TONE: Record<HostelGender, StatusTone> = {
  Boys: 'info',
  Girls: 'brand',
  Mixed: 'neutral',
};

export const STAFF_ROLES: HostelStaffRole[] = [
  'House master / mistress',
  'Floor master / mistress',
  'Assistant',
];
export const HOUSE_MASTER: HostelStaffRole = 'House master / mistress';
export const FLOOR_MASTER: HostelStaffRole = 'Floor master / mistress';

/** Most rooms the generator adds at once, and most places in one room (the API's limits). */
export const MAX_ROOMS_AT_ONCE = 200;
export const MAX_ROOM_CAPACITY = 200;

/** Bed labels for a room: none, 1…n, or A…Z then AA, AB… (as the API makes them). */
export function bedLabels(style: BedStyle, capacity: number): string[] {
  if (style === 'numbers') return Array.from({ length: capacity }, (_, i) => String(i + 1));
  if (style === 'letters')
    return Array.from({ length: capacity }, (_, i) => {
      let n = i;
      let s = '';
      do {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
      } while (n >= 0);
      return s;
    });
  return [];
}

/** "beds A–D", "beds 1–4", "beds Top, Bottom", or "" when the room has no bed labels. */
export function bedSummary(beds: string[]): string {
  if (!beds.length) return '';
  if (beds.length === 1) return `bed ${beds[0]}`;
  const letters = bedLabels('letters', beds.length);
  const numbers = bedLabels('numbers', beds.length);
  if (beds.every((b, i) => b === letters[i] || b === numbers[i]))
    return `beds ${beds[0]}–${beds[beds.length - 1]}`;
  return beds.length <= 3 ? `beds ${beds.join(', ')}` : `beds ${beds[0]}, ${beds[1]}…`;
}

/**
 * Class names, shortened where they run on: ["Primary 4", "Primary 5", "Primary 6"] → "Primary 4–6".
 */
export function levelRange(names: string[]): string {
  const parts: string[] = [];
  let run: { prefix: string; from: number; to: number } | null = null;
  const flush = () => {
    if (run) parts.push(`${run.prefix}${run.from}${run.to > run.from ? `–${run.to}` : ''}`);
    run = null;
  };
  for (const name of names) {
    const m = /^(.*?)(\d+)$/.exec(name);
    if (!m) {
      flush();
      parts.push(name);
      continue;
    }
    const prefix = m[1]!;
    const n = Number(m[2]);
    if (run && run.prefix === prefix && n === run.to + 1) run.to = n;
    else {
      flush();
      run = { prefix, from: n, to: n };
    }
  }
  flush();
  return parts.join(', ');
}

/** What boards at a campus: "Primary 4–6, Junior & Senior Secondary". */
export function campusBoarding(c: BoardingCampus): string {
  const parts: { text: string; whole: boolean }[] = [];
  for (const s of c.sections) {
    if (!s.boarding) continue;
    const picked = s.levels.filter((l) => s.levelIds.includes(l.id));
    const whole = !s.levelIds.length || picked.length === s.levels.length;
    parts.push({ text: whole ? s.name : levelRange(picked.map((l) => l.name)), whole });
  }
  // Neighbouring whole sections that share a last word: "Junior & Senior Secondary".
  const merged: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    const q = parts[i + 1];
    const [pw, qw] = [p.text.split(' '), q?.text.split(' ')];
    if (
      q &&
      p.whole &&
      q.whole &&
      pw.length > 1 &&
      qw!.length > 1 &&
      pw[pw.length - 1] === qw![qw!.length - 1]
    ) {
      merged.push(`${pw.slice(0, -1).join(' ')} & ${q.text}`);
      i++;
    } else merged.push(p.text);
  }
  return merged.join(', ');
}

/** "Boarding at 2 campuses: Main Campus (Senior Secondary), Lekki (Primary 4–6, …)". */
export function boardingSummary(s: Pick<BoardingSettings, 'campuses'>): string {
  const boarding = s.campuses.filter((c) => c.sections.some((x) => x.boarding));
  if (!boarding.length) return 'No campus takes boarders yet.';
  const list = boarding.map((c) => `${c.name} (${campusBoarding(c)})`).join(', ');
  return boarding.length === 1
    ? `Boarding at ${list}.`
    : `Boarding at ${boarding.length} campuses: ${list}.`;
}

/** The boarding classes of a campus, in order, for the hostel form's class chips. */
export function boardingLevels(c: BoardingCampus | undefined) {
  if (!c) return [];
  return c.sections
    .filter((s) => s.boarding)
    .flatMap((s) =>
      s.levelIds.length ? s.levels.filter((l) => s.levelIds.includes(l.id)) : s.levels,
    );
}
