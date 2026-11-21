import { addDays } from '../academics/academic-format.js';

/** A teaching week of a term, Monday to Friday, as the Teacher Workspace's lesson notes show it. */
export interface TermWeek {
  week: number;
  /** Monday "YYYY-MM-DD". */
  start: string;
  /** Friday "YYYY-MM-DD". */
  end: string;
  /** "Week 13 · 7–11 Dec". */
  label: string;
  /** The Friday before the week: when its lesson note is due. */
  due: string;
  /** Part of the week is the mid-term break. */
  midterm: boolean;
  /** "Mid-term break · Thu 29 Oct – Fri 30 Oct", public holidays, closures; null for none. */
  note: string | null;
}

/** A stretch with no classes: the mid-term break, a public holiday or a calendar closure. */
export interface Closure {
  from: string;
  to: string;
  name: string;
  midterm: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
/** "7 Dec". */
export const dayLabel = (iso: string) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
/** "Fri 11 Dec". */
export const shortDay = (iso: string) => `${DAYS[weekdayOf(iso)]} ${dayLabel(iso)}`;

function rangeLabel(from: string, to: string) {
  return from.slice(5, 7) === to.slice(5, 7)
    ? `${+from.slice(8, 10)}–${+to.slice(8, 10)} ${MONTHS[+to.slice(5, 7) - 1]}`
    : `${dayLabel(from)} – ${dayLabel(to)}`;
}

/**
 * The term's teaching weeks, Monday to Friday, numbered from the week the term starts in. A
 * week's note is due on the Friday before it; closures that fall in a week are listed on it.
 */
export function termWeeks(term: { start: string; end: string }, closures: Closure[]): TermWeek[] {
  const monday = addDays(term.start, -((weekdayOf(term.start) + 6) % 7));
  const out: TermWeek[] = [];
  for (let start = monday, week = 1; start <= term.end; start = addDays(start, 7), week++) {
    const end = addDays(start, 4);
    const inWeek = closures
      .filter((c) => c.from <= end && c.to >= start)
      .sort((a, b) => a.from.localeCompare(b.from));
    out.push({
      week,
      start,
      end,
      label: `Week ${week} · ${rangeLabel(start, end)}`,
      due: addDays(start, -3),
      midterm: inWeek.some((c) => c.midterm),
      note: inWeek.length
        ? inWeek
            .map((c) => {
              const from = c.from < start ? start : c.from;
              const to = c.to > end ? end : c.to;
              return from === to
                ? `${c.name} · ${shortDay(from)}`
                : `${c.name} · ${shortDay(from)} – ${shortDay(to)}`;
            })
            .join(' · ')
        : null,
    });
  }
  return out;
}

/** The week today falls in (0 before the term starts, the last week after it ends). */
export function currentWeek(weeks: TermWeek[], today: string) {
  if (!weeks.length || today < weeks[0]!.start) return 0;
  const w = weeks.find((x) => today >= x.start && today <= addDays(x.start, 6));
  return w?.week ?? weeks[weeks.length - 1]!.week;
}
