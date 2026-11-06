/** Injection token for the shared ioredis client (cache, locks, rate limiting). */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
