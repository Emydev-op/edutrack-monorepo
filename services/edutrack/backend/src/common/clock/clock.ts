import { Global, Injectable, Module } from '@nestjs/common';

/**
 * The time source for anything with expiry or windows (tokens, lockouts, invitations). Inject
 * `Clock` instead of calling `new Date()` so tests can move time (`FixedClock`).
 */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }

  nowMs(): number {
    return this.now().getTime();
  }
}

/** A clock tests can set and advance. */
export class FixedClock extends Clock {
  private current: number;

  constructor(start: Date | number = Date.now()) {
    super();
    this.current = typeof start === 'number' ? start : start.getTime();
  }

  override now(): Date {
    return new Date(this.current);
  }

  set(at: Date | number) {
    this.current = typeof at === 'number' ? at : at.getTime();
  }

  advance(ms: number) {
    this.current += ms;
  }
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

@Global()
@Module({ providers: [Clock], exports: [Clock] })
export class ClockModule {}
