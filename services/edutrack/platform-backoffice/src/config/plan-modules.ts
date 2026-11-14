/** The plan module catalog lives in @edutrack/shared so the API checks plans against the same list. */
export {
  CORE_MODULES,
  MODULE_BY_ID,
  MODULE_GROUPS,
  OPTIONAL_MODULES,
  PLAN_MODULES,
  PORTAL_MODULES,
  dependentsOf,
  moduleName,
  requirementsOf,
  type ModuleGroup,
  type PlanModule,
} from '@edutrack/shared';
