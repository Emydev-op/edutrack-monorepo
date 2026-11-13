import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { ClockModule } from './common/clock/clock.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { RequestContextMiddleware } from './common/logging/request-context.middleware.js';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RedisModule } from './redis/redis.module.js';
import { StorageModule } from './storage/storage.module.js';
import { TenancyModule } from './tenancy/tenancy.module.js';
import { TenantHostMiddleware } from './tenancy/tenant-host.middleware.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    ClockModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    StorageModule,
    TenancyModule,
    NotificationsModule,
    AuthModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Request context first (request id, ALS), then the Host's school.
    consumer.apply(RequestContextMiddleware, TenantHostMiddleware).forRoutes('*path');
  }
}
