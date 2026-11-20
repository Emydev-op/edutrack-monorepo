import { onBeforeUnmount, onMounted, toValue, type MaybeRefOrGetter } from 'vue';

const KEY = 'edutrack.last-activity';
const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

/**
 * Signs a staff member out after `minutes` without using the page (mouse, keyboard, touch,
 * scrolling) in any tab of this portal. Background refreshes don't count as activity. Pass
 * `null` minutes to switch it off (e.g. "Remember this device").
 */
export function useIdleSignOut(
  minutes: MaybeRefOrGetter<number | null | undefined>,
  onIdle: () => void,
) {
  let last = Date.now();
  let timer: ReturnType<typeof setInterval> | undefined;
  let fired = false;

  const mark = () => {
    const now = Date.now();
    // Writing on every mouse move is wasteful; once every few seconds is plenty.
    if (now - last < 5_000) return;
    last = now;
    try {
      localStorage.setItem(KEY, String(now));
    } catch {
      // Private windows can refuse storage; this tab still keeps its own time.
    }
  };

  const shared = () => {
    try {
      return Number(localStorage.getItem(KEY)) || 0;
    } catch {
      return 0;
    }
  };

  const check = () => {
    const m = toValue(minutes);
    if (!m || fired) return;
    const lastActive = Math.max(last, shared());
    if (Date.now() - lastActive >= m * 60_000) {
      fired = true;
      onIdle();
    }
  };

  onMounted(() => {
    last = Date.now();
    for (const e of EVENTS) window.addEventListener(e, mark, { passive: true });
    document.addEventListener('visibilitychange', check);
    timer = setInterval(check, 15_000);
  });

  onBeforeUnmount(() => {
    for (const e of EVENTS) window.removeEventListener(e, mark);
    document.removeEventListener('visibilitychange', check);
    if (timer) clearInterval(timer);
  });
}
