const key = (host: string) => `edutrack:brand-color:${host}`;

/**
 * The school colour this address showed last time, so a page can paint in it straight away
 * instead of flashing Edutrack's default colour while the school loads. A school's entry page and
 * its Teacher, Parent and Student portals share one address, so they share what's remembered.
 * Storage can be unavailable (private browsing, blocked site data), so every access is guarded.
 */
export function recallBrandColor(host: string = location.host): string | null {
  try {
    return localStorage.getItem(key(host));
  } catch {
    return null;
  }
}

/** Remembers (or, with null, forgets) the colour for this address. */
export function rememberBrandColor(colour: string | null, host: string = location.host) {
  try {
    if (colour) localStorage.setItem(key(host), colour);
    else localStorage.removeItem(key(host));
  } catch {
    // Not remembered: the next visit starts in the default colour. Nothing else changes.
  }
}
