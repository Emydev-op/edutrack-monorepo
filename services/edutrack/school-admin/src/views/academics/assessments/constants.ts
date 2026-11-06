import type { AssessmentComponent, AssessmentScheme, GradeBand } from '@/types';

/** Presets offered when editing a scheme. Mirrors the defaults Edutrack suggests to new schools. */
export const COMPONENT_PRESETS: Record<string, [string, number, number, string][]> = {
  'CA1 20 · CA2 20 · Exam 60': [
    ['CA 1', 20, 20, 'Week 5'],
    ['CA 2', 20, 20, 'Week 9'],
    ['Examination', 100, 60, 'Weeks 11–12'],
  ],
  'CA 40 · Exam 60': [
    ['Continuous assessment', 40, 40, 'Through the term'],
    ['Examination', 100, 60, 'Weeks 11–12'],
  ],
  'Test · Project · Assignment · Exam': [
    ['Test', 20, 15, 'Week 4'],
    ['Project', 20, 15, 'Week 8'],
    ['Assignment', 10, 10, 'Through the term'],
    ['Examination', 100, 60, 'Weeks 11–12'],
  ],
};

export const SCALE_PRESETS: Record<string, [string, number, number, string, number, boolean][]> = {
  'A–F': [
    ['A', 70, 100, 'Excellent', 5, true],
    ['B', 60, 69, 'Very good', 4, true],
    ['C', 50, 59, 'Good', 3, true],
    ['D', 45, 49, 'Fair', 2, true],
    ['E', 40, 44, 'Pass', 1, true],
    ['F', 0, 39, 'Fail', 0, false],
  ],
  'WAEC (A1–F9)': [
    ['A1', 75, 100, 'Excellent', 9, true],
    ['B2', 70, 74, 'Very good', 8, true],
    ['B3', 65, 69, 'Good', 7, true],
    ['C4', 60, 64, 'Credit', 6, true],
    ['C5', 55, 59, 'Credit', 5, true],
    ['C6', 50, 54, 'Credit', 4, true],
    ['D7', 45, 49, 'Pass', 3, true],
    ['E8', 40, 44, 'Pass', 2, true],
    ['F9', 0, 39, 'Fail', 1, false],
  ],
};

export const RECOMMENDED_RATINGS: [string, string][] = [
  ['Exceeding', 'Beyond the expected level'],
  ['Secure', 'At the expected level'],
  ['Developing', 'Working towards the expected level'],
  ['Emerging', 'Early stage'],
];

export const components = (key: string): AssessmentComponent[] =>
  COMPONENT_PRESETS[key]!.map(([name, max, weight, when]) => ({ name, max, weight, when }));

export const scale = (key: string): GradeBand[] =>
  SCALE_PRESETS[key]!.map(([grade, min, max, remark, points, pass]) => ({
    grade,
    min,
    max,
    remark,
    points,
    pass,
  }));

export const ratings = () =>
  RECOMMENDED_RATINGS.map(([name, description]) => ({ name, description }));

/** A sensible starting scheme for a section code (NUR, PRI, JSS, SSS or custom). */
export function startingScheme(code: string): AssessmentScheme {
  if (code === 'NUR')
    return {
      mode: 'descriptive',
      components: components('CA 40 · Exam 60'),
      scale: scale('A–F'),
      ratings: ratings(),
    };
  return {
    mode: 'scores',
    components: components(code === 'PRI' ? 'CA 40 · Exam 60' : 'CA1 20 · CA2 20 · Exam 60'),
    scale: scale(code === 'SSS' ? 'WAEC (A1–F9)' : 'A–F'),
    ratings: ratings(),
  };
}

/** Same rules the server applies, so problems show while editing. */
export function schemeErrors(label: string, s: AssessmentScheme): string[] {
  const e: string[] = [];
  if (s.mode === 'scores') {
    if (!s.components.length) e.push(`${label}: add at least one component.`);
    const names = new Set<string>();
    for (const c of s.components) {
      const n = c.name.trim().toLowerCase();
      if (!n) e.push(`${label}: name every component.`);
      else if (names.has(n)) e.push(`${label}: two components are called ${c.name}.`);
      names.add(n);
      if (!(Number(c.max) >= 1))
        e.push(`${label}: ${c.name || 'a component'} needs a maximum of at least 1.`);
      if (!(Number(c.weight) > 0)) e.push(`${label}: ${c.name || 'a component'} needs a weight.`);
    }
    const total = totalWeight(s);
    if (Math.abs(total - 100) > 0.01)
      e.push(`${label}: weights add up to ${total}%. They must total 100%.`);
    e.push(...scaleErrors(label, s.scale));
  } else {
    const names = s.ratings.map((x) => x.name.trim()).filter(Boolean);
    if (names.length < 2) e.push(`${label}: add at least 2 ratings.`);
    if (s.ratings.some((x) => !x.name.trim())) e.push(`${label}: name every rating.`);
    if (new Set(names.map((x) => x.toLowerCase())).size !== names.length)
      e.push(`${label}: ratings must be different.`);
  }
  return e;
}

export const totalWeight = (s: AssessmentScheme) =>
  Math.round(s.components.reduce((n, c) => n + (Number(c.weight) || 0), 0) * 100) / 100;

export function scaleErrors(label: string, bands: GradeBand[]): string[] {
  const e: string[] = [];
  const grades = new Set<string>();
  for (const g of bands) {
    if (!g.grade.trim()) e.push(`${label}: every band needs a grade.`);
    else if (grades.has(g.grade.trim().toUpperCase()))
      e.push(`${label}: grade ${g.grade} appears twice.`);
    grades.add(g.grade.trim().toUpperCase());
    if (!(g.min >= 0 && g.max <= 100 && g.min <= g.max))
      e.push(`${label}: ${g.grade || 'a band'} has an invalid range.`);
  }
  if (e.length) return e;
  const sorted = [...bands].sort((a, b) => b.max - a.max);
  if (!sorted.length) return [`${label}: add grades.`];
  if (sorted[0]!.max !== 100) return [`${label}: the top grade must end at 100.`];
  if (sorted[sorted.length - 1]!.min !== 0) return [`${label}: the lowest grade must start at 0.`];
  sorted.forEach((g, i) => {
    const next = sorted[i + 1];
    if (next && next.max !== g.min - 1)
      e.push(
        next.max >= g.min
          ? `${label}: ${g.grade} and ${next.grade} overlap.`
          : `${label}: there is a gap between ${next.grade} and ${g.grade}.`,
      );
  });
  return e;
}
