import { isValidScore, ordinal, rankPositions, totalOf, type Scheme } from './scoring.js';

const scheme = (over: Partial<Scheme> = {}): Scheme => ({
  id: 's',
  sessionId: 'x',
  sectionId: 'y',
  mode: 'SCORES',
  components: [
    { id: 'a', key: 'CA1', name: 'CA 1', max: 20, weight: 20, when: '' },
    { id: 'b', key: 'CA2', name: 'CA 2', max: 20, weight: 20, when: '' },
    { id: 'c', key: 'EXAM', name: 'Examination', max: 100, weight: 60, when: '' },
  ],
  scale: [],
  scaleName: '',
  passMark: 40,
  rounding: 'ONE_DECIMAL',
  showPosition: true,
  lockedAt: null,
  reweightExempt: true,
  ...over,
});

describe('result scoring', () => {
  it('accepts numbers within the max with one decimal, ABS, EXM and blanks', () => {
    expect(isValidScore(17.5, 20)).toBe(true);
    expect(isValidScore(null, 20)).toBe(true);
    expect(isValidScore('ABS', 20)).toBe(true);
    expect(isValidScore(20.5, 20)).toBe(false);
    expect(isValidScore(1.25, 20)).toBe(false);
    expect(isValidScore('X', 20)).toBe(false);
  });

  it('totals with the scheme’s rounding; blanks and ABS leave no total', () => {
    expect(totalOf(scheme(), [18, 17.5, 50])).toBe(65.5);
    expect(totalOf(scheme({ rounding: 'WHOLE_NUMBER' }), [18, 17.5, 50])).toBe(66);
    expect(totalOf(scheme(), [18, null, 50])).toBeNull();
    expect(totalOf(scheme(), [18, 'ABS', 50])).toBeNull();
  });

  it('re-weights an exempt component, or counts it as 0 when the school says so', () => {
    // 20/20 of CA 2 and 50/100 of the exam: (20 + 30) / 80 = 62.5.
    expect(totalOf(scheme(), ['EXM', 20, 50])).toBe(62.5);
    expect(totalOf(scheme({ reweightExempt: false }), ['EXM', 20, 50])).toBe(50);
  });

  it('shares positions on a tie and skips the next', () => {
    const p = rankPositions([
      { id: 'a', value: 80 },
      { id: 'b', value: 70 },
      { id: 'c', value: 70 },
      { id: 'd', value: 60 },
      { id: 'e', value: null },
    ]);
    expect([p.get('a'), p.get('b'), p.get('c'), p.get('d'), p.get('e')]).toEqual([
      1,
      2,
      2,
      4,
      undefined,
    ]);
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '103rd',
    ]);
  });
});
