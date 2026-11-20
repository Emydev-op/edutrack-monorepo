import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import { useIdleSignOut } from '../useIdleSignOut';

const host = (minutes: () => number | null, onIdle: () => void) =>
  mount(
    defineComponent({
      setup() {
        useIdleSignOut(minutes, onIdle);
        return () => h('div');
      },
    }),
  );

describe('useIdleSignOut', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it('signs out after the idle time without activity', () => {
    const onIdle = vi.fn();
    host(() => 30, onIdle);
    vi.advanceTimersByTime(29 * 60_000);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2 * 60_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('counts using the page as activity, in this tab or another', () => {
    const onIdle = vi.fn();
    host(() => 30, onIdle);
    vi.advanceTimersByTime(20 * 60_000);
    window.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(20 * 60_000);
    expect(onIdle).not.toHaveBeenCalled();
    // Another tab was used just now.
    localStorage.setItem('edutrack.last-activity', String(Date.now()));
    vi.advanceTimersByTime(25 * 60_000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('stays off for remembered devices', () => {
    const onIdle = vi.fn();
    const remembered = ref(true);
    host(() => (remembered.value ? null : 30), onIdle);
    vi.advanceTimersByTime(120 * 60_000);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
