import {
  annualOf,
  eligibilityOf,
  isException,
  listText,
  nextLevelOf,
  ruleText,
  suggestionOf,
  type OrderedLevel,
  type PromotionRule,
} from './promotion-rules.js';

const rule: PromotionRule = {
  minAverage: 45,
  passMark: 40,
  mustPass: [
    { id: 'eng', name: 'English Language' },
    { id: 'mth', name: 'Mathematics' },
  ],
};
const t = (subjectId: string, termId: string, total: number | null) => ({
  subjectId,
  termId,
  total,
});

describe('promotion rules', () => {
  it('words the rule', () => {
    expect(ruleText(rule)).toBe(
      'Annual average of 45% or more and a pass (40%) in English Language and Mathematics',
    );
    expect(ruleText({ ...rule, mustPass: [] })).toBe('Annual average of 45% or more');
    expect(ruleText({ ...rule, minAverage: null, mustPass: [rule.mustPass[1]!] })).toBe(
      'A pass (40%) in Mathematics',
    );
    expect(ruleText({ ...rule, minAverage: null, mustPass: [] })).toBeNull();
    expect(listText(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('averages each subject over its published terms, then the subjects', () => {
    const a = annualOf([
      t('eng', '1', 60),
      t('eng', '2', 50),
      t('eng', '3', null),
      t('mth', '1', 41),
    ]);
    expect(a.subjects.get('eng')).toBe(55);
    expect(a.subjects.get('mth')).toBe(41);
    expect(a.average).toBe(48);
    expect(annualOf([]).average).toBeNull();
  });

  it('is eligible on the average and every must-pass subject', () => {
    const ok = eligibilityOf(rule, annualOf([t('eng', '1', 50), t('mth', '1', 45)]));
    expect(ok).toEqual({ eligible: true, note: '' });
    const failed = eligibilityOf(rule, annualOf([t('eng', '1', 90), t('mth', '1', 35)]));
    expect(failed.eligible).toBe(false);
    expect(failed.note).toBe('Below the pass mark (40) in Mathematics');
    const low = eligibilityOf(rule, annualOf([t('eng', '1', 42), t('mth', '1', 42)]));
    expect(low).toEqual({ eligible: false, note: 'Annual average below 45%' });
  });

  it('leaves eligibility unknown without results or without a rule', () => {
    expect(eligibilityOf(rule, annualOf([])).eligible).toBeNull();
    expect(eligibilityOf(rule, annualOf([t('eng', '1', 70)])).note).toMatch(/Mathematics/);
    expect(eligibilityOf(null, annualOf([t('eng', '1', 70)]))).toEqual({
      eligible: null,
      note: '',
    });
  });

  it('suggests and spots exceptions', () => {
    expect(suggestionOf(true, false)).toBe('PROMOTE');
    expect(suggestionOf(true, true)).toBe('GRADUATE');
    expect(suggestionOf(false, false)).toBe('REPEAT');
    expect(suggestionOf(null, false)).toBeNull();
    expect(isException(true, 'REPEAT')).toBe(true);
    expect(isException(false, 'PROMOTE')).toBe(true);
    expect(isException(false, 'TRANSFER')).toBe(false);
    expect(isException(null, 'PROMOTE')).toBe(false);
  });

  it('promotes across section boundaries in order, and the final class has no next', () => {
    const lv = (id: string, sectionOrder: number, sortOrder: number): OrderedLevel => ({
      id,
      name: id,
      sectionId: String(sectionOrder),
      sectionOrder,
      sortOrder,
      nextLevelId: null,
    });
    const levels = [lv('JSS 1', 2, 0), lv('Primary 6', 1, 5), lv('JSS 3', 2, 2), lv('SSS 1', 3, 0)];
    expect(nextLevelOf(levels, 'Primary 6')?.id).toBe('JSS 1');
    expect(nextLevelOf(levels, 'JSS 3')?.id).toBe('SSS 1');
    expect(nextLevelOf(levels, 'SSS 1')).toBeNull();
    levels[1]!.nextLevelId = 'JSS 3';
    expect(nextLevelOf(levels, 'Primary 6')?.id).toBe('JSS 3');
  });
});
