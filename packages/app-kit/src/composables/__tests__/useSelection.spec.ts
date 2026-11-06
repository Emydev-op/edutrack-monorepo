import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';

import { useSelection } from '../useSelection';

describe('useSelection', () => {
  it('toggles rows, selects all and clears when the rows change', async () => {
    const rows = ref([{ id: 'a' }, { id: 'b' }]);
    const selection = useSelection(rows, (r) => r.id);

    selection.toggle(rows.value[0]!);
    expect(selection.count.value).toBe(1);
    expect(selection.someSelected.value).toBe(true);

    selection.toggleAll();
    expect(selection.allSelected.value).toBe(true);
    expect(selection.selectedRows().map((r) => r.id)).toEqual(['a', 'b']);

    rows.value = [{ id: 'c' }];
    await nextTick();
    expect(selection.count.value).toBe(0);
  });
});
