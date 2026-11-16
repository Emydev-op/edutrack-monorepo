import { BackpackIcon, HeartHandshakeIcon, PresentationIcon } from '@lucide/vue';
import type { Component } from 'vue';

export interface PortalEntry {
  id: 'teacher' | 'parent' | 'student';
  label: string;
  description: string;
  /** Same address, the portal's own path. */
  href: string;
  icon: Component;
}

/** The three ways into a school, in the order the page lists them. */
export const PORTALS: PortalEntry[] = [
  {
    id: 'teacher',
    label: 'Teacher',
    description: 'Your classes, registers, scores and lesson notes.',
    href: '/teacher/',
    icon: PresentationIcon,
  },
  {
    id: 'parent',
    label: 'Parent',
    description: 'Your children’s results, attendance and school news.',
    href: '/parent/',
    icon: HeartHandshakeIcon,
  },
  {
    id: 'student',
    label: 'Student',
    description: 'Your timetable, assignments and results.',
    href: '/student/',
    icon: BackpackIcon,
  },
];
