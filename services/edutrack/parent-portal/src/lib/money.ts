import { formatNaira } from '@edutrack/app-kit/lib/format';

/** "₦45,000"; whole naira as the school bills them. */
export const naira = (n: number | null | undefined) => formatNaira(Math.round(n ?? 0));
