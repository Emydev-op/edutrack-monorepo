import {
  FileIcon,
  FileTextIcon,
  ImageIcon,
  PresentationIcon,
  VideoIcon,
  type LucideIcon,
} from '@lucide/vue';

import { fileSize } from '@/components/assignments/assignment-format';
import type { MaterialRow, MaterialType } from '@/types';

export const MATERIAL_ICON: Record<MaterialType, LucideIcon> = {
  PDF: FileTextIcon,
  Document: FileIcon,
  Presentation: PresentationIcon,
  Image: ImageIcon,
  'Video link': VideoIcon,
};

/** "algebra.pdf · 1.8 MB" or "youtube.com" */
export function materialSource(m: Pick<MaterialRow, 'file' | 'link'>) {
  if (m.link) {
    try {
      return new URL(m.link).hostname.replace(/^www\./, '');
    } catch {
      return m.link;
    }
  }
  return m.file ? `${m.file.name} · ${fileSize(m.file.bytes)}` : '';
}
