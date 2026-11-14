/** A school-scoped query ran without a tenant: a programming error, answered with a 500. */
export class TenantContextError extends Error {
  constructor(model: string, operation: string) {
    super(
      `${model}.${operation} needs a school context. Run it in a request with a signed-in school, ` +
        'inside RequestContext.forSchool(), or use PrismaService (unscoped) for platform-wide work.',
    );
    this.name = 'TenantContextError';
  }
}

/** A query or write named a different school than the current tenant: answered with a 403. */
export class TenantMismatchError extends Error {
  constructor(model: string, operation: string) {
    super(`That record belongs to another school (${model}.${operation}).`);
    this.name = 'TenantMismatchError';
  }
}

/** A write was attempted under a read-only platform support session: answered with a 403. */
export class ReadOnlySupportSessionError extends Error {
  constructor(model: string, operation: string) {
    super(`Support access is read-only (${model}.${operation}).`);
    this.name = 'ReadOnlySupportSessionError';
  }
}
