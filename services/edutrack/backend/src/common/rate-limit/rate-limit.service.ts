import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants.js';
import { AppException } from '../errors/app.exception.js';

export interface RateLimitRule {
  /** Bucket name, e.g. `login:ip`. */
  name: string;
  /** Requests allowed per window. */
  limit: number;
  windowSeconds: number;
}

// INCR and set the expiry on the first hit, atomically; returns [count, ttl].
const HIT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('TTL', KEYS[1]) }
`;

/**
 * Fixed-window counters in Redis, shared by every API instance. Keys hash the subject so emails
 * and IPs never sit in Redis in clear text.
 */
@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Counts one hit against each rule and throws 429 (with Retry-After) when any is over. */
  async consume(rules: { rule: RateLimitRule; subject: string }[]): Promise<void> {
    for (const { rule, subject } of rules) {
      const key = `rl:${rule.name}:${hashSubject(subject)}`;
      const [count, ttl] = (await this.redis.eval(HIT, 1, key, rule.windowSeconds)) as [
        number,
        number,
      ];
      if (count > rule.limit) {
        const retryAfter = Math.max(1, ttl);
        throw new AppException(
          HttpStatus.TOO_MANY_REQUESTS,
          'Too many attempts. Wait a few minutes and try again.',
          'RATE_LIMITED',
          undefined,
          { 'Retry-After': String(retryAfter) },
        );
      }
    }
  }
}

const hashSubject = (subject: string) =>
  createHash('sha256').update(subject.trim().toLowerCase()).digest('base64url').slice(0, 32);
