import { BullModule } from '@nestjs/bullmq';
import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import { NodeEnv, type Env } from '../config/env.validation.js';
import { createMailTransport, MAIL_TRANSPORT } from './mail.transport.js';
import { NotificationsProcessor } from './notifications.processor.js';
import { NOTIFICATIONS_QUEUE, NotificationsService } from './notifications.service.js';
import { LogSmsDriver, SMS_DRIVER } from './sms/sms-driver.js';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE })],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => createMailTransport(config),
    },
    {
      provide: SMS_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        if (config.get('NODE_ENV', { infer: true }) === NodeEnv.Production)
          new Logger('SMS').warn('SMS_DRIVER=log in production: SMS are written to the log only');
        return new LogSmsDriver();
      },
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule implements OnApplicationShutdown {
  constructor(@Inject(MAIL_TRANSPORT) private readonly mail: Transporter) {}

  onApplicationShutdown() {
    this.mail.close();
  }
}
