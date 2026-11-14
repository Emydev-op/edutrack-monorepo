import { Controller, Get, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import { setTimeout as sleep } from 'node:timers/promises';
import { Public } from '../auth/decorators/auth.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.constants.js';
import { StorageService } from '../storage/storage.service.js';

/** A dependency that does not answer within this window is reported as down. */
const PROBE_TIMEOUT_MS = 3_000;

@ApiTags('health')
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Liveness: the process is up. Used by container orchestrators. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: every backing service is reachable. */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma, { timeout: PROBE_TIMEOUT_MS }),
      () => this.ping('redis', async () => void (await this.redis.ping())),
      () => this.ping('storage', () => this.storage.ping()),
    ]);
  }

  private async ping(key: string, probe: () => Promise<void>) {
    const indicator = this.indicator.check(key);
    try {
      await Promise.race([
        probe(),
        sleep(PROBE_TIMEOUT_MS).then(() => {
          throw new Error(`timed out after ${PROBE_TIMEOUT_MS}ms`);
        }),
      ]);
      return indicator.up();
    } catch (error) {
      return indicator.down({ message: error instanceof Error ? error.message : String(error) });
    }
  }
}
