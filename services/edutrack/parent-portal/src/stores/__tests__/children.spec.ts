import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { pickChild, useChildrenStore } from '../children';

const kids = [{ id: 'emmanuel' }, { id: 'michael' }];

describe('pickChild', () => {
  it('prefers the child asked for, then the one remembered, then the first', () => {
    expect(pickChild(kids, 'michael', 'emmanuel')).toBe('michael');
    expect(pickChild(kids, null, 'michael')).toBe('michael');
    expect(pickChild(kids, undefined, undefined)).toBe('emmanuel');
  });

  it('ignores children that are no longer linked', () => {
    expect(pickChild(kids, 'someone-else', 'gone')).toBe('emmanuel');
    expect(pickChild([], 'michael', 'michael')).toBeNull();
  });
});

describe('children store (the switcher)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('remembers the chosen child on this device', () => {
    const store = useChildrenStore();
    store.select('michael');
    expect(store.selectedId).toBe('michael');
    setActivePinia(createPinia());
    expect(useChildrenStore().selectedId).toBe('michael');
  });

  it('keeps the choice valid when the children list loads', () => {
    const store = useChildrenStore();
    store.sync(kids);
    expect(store.selectedId).toBe('emmanuel');
    store.select('michael');
    store.sync(kids);
    expect(store.selectedId).toBe('michael');
    // Michael left more than two years ago and is no longer listed.
    store.sync([{ id: 'emmanuel' }]);
    expect(store.selectedId).toBe('emmanuel');
  });

  it('forgets the choice on sign-out', () => {
    const store = useChildrenStore();
    store.select('michael');
    store.clear();
    expect(store.selectedId).toBeNull();
    expect(localStorage.getItem('edutrack.parent-portal.child')).toBeNull();
  });
});
