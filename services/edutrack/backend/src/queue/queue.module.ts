import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';

/**
 * Root BullMQ connection. Feature modules register their own queues with
 * `BullModule.registerQueue({ name: '...' })` and add `@Processor` workers.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = new URL(config.get('REDIS_URL', { infer: true }));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            username: url.username || undefined,
            password: url.password || undefined,
            // redis://host:6379/15 selects database 15 (the e2e tests use their own).
            db: Number(url.pathname.replace('/', '') || 0),
            tls: url.protocol === 'rediss:' ? {} : undefined,
          },
          prefix: 'edutrack',
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: 1_000,
            removeOnFail: 5_000,
          },
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
