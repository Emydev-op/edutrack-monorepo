import { describe, expect, it } from 'vitest';

import { lgasOf, NIGERIAN_STATES } from '@edutrack/app-kit/lib/nigeria-locations';
import { provisionSchema } from '@/schema/school';

const errorsFor = async (state: string, lga: string) => {
  const result = await provisionSchema.parse({ state, lga } as never);
  return Object.fromEntries(
    result.errors
      .filter((e) => e.path === 'state' || e.path === 'lga')
      .map((e) => [e.path, e.errors[0]]),
  );
};

describe('school location', () => {
  it('lists all 36 states and the FCT with their 774 LGAs', () => {
    expect(NIGERIAN_STATES).toHaveLength(37);
    expect(NIGERIAN_STATES.reduce((n, s) => n + lgasOf(s).length, 0)).toBe(774);
    expect(lgasOf('FCT')).toContain('Bwari');
    expect(lgasOf('Lagos')).toContain('Surulere');
    expect(lgasOf('')).toEqual([]);
  });

  it('needs a known state and an LGA inside it', async () => {
    expect(await errorsFor('', '')).toEqual({ state: 'Select the state', lga: 'Select the LGA' });
    expect(await errorsFor('Lagos', 'Bwari')).toEqual({
      lga: 'Select an LGA in the chosen state',
    });
    expect(await errorsFor('Lagos', 'Ikeja')).toEqual({});
  });
});
