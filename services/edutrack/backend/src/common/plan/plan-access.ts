import { HttpStatus, SetMetadata } from '@nestjs/common';
import { PLAN_MODULES } from '@edutrack/shared';
import type { Portal } from '../../generated/prisma/enums.js';
import { AppException } from '../errors/app.exception.js';

/** The plan module each school portal needs (School Admin is always included). */
export const PORTAL_MODULE: Partial<Record<Portal, string>> = {
  TEACHER: 'teacher',
  PARENT: 'parent',
  STUDENT: 'student',
};

const CORE = new Set(PLAN_MODULES.filter((m) => m.core).map((m) => m.id));

/**
 * Does the school's plan include this module? Core modules come with every plan; a school with no
 * plan on record (shouldn't happen) isn't locked out.
 */
export function planIncludes(modules: string[] | null | undefined, id: string): boolean {
  if (CORE.has(id) || !modules) return true;
  return modules.includes(id);
}

/** Every module id the plan gives the school (core ones always), for the screens to lock the rest. */
export function planModules(modules: string[] | null | undefined): string[] {
  return PLAN_MODULES.filter((m) => !m.comingSoon && planIncludes(modules, m.id)).map((m) => m.id);
}

export const moduleName = (id: string) => PLAN_MODULES.find((m) => m.id === id)?.name ?? id;

/** 403 MODULE_NOT_IN_PLAN: the screens show it as a locked feature with "Upgrade your plan". */
export function moduleLocked(id: string, plan?: string | null) {
  return new AppException(
    HttpStatus.FORBIDDEN,
    `${moduleName(id)} isn’t included in your${plan ? ` ${plan}` : ''} plan. Upgrade your plan to use it.`,
    'MODULE_NOT_IN_PLAN',
  );
}

export const REQUIRES_MODULE = 'plan:requires-module';

/** The plan module a School Admin or Teacher route belongs to (checked by PlanModuleGuard). */
export const RequiresModule = (id: string) => SetMetadata(REQUIRES_MODULE, id);
