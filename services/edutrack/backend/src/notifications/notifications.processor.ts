import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { Transporter } from 'nodemailer';
import type { Env } from '../config/env.validation.js';
import { MAIL_TRANSPORT } from './mail.transport.js';
import { NOTIFICATIONS_QUEUE, type NotificationJob } from './notifications.service.js';
import { SMS_DRIVER, type SmsDriver } from './sms/sms-driver.js';
import { renderEmail, renderSms } from './templates/templates.js';

/** Delivers queued email (SMTP via nodemailer) and SMS (the configured driver). Throws to retry. */
@Processor(NOTIFICATIONS_QUEUE, { concurrency: 5 })
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private readonly from: string;
  private readonly replyTo?: string;
  private readonly senderId: string;

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly mail: Transporter,
    @Inject(SMS_DRIVER) private readonly sms: SmsDriver,
    config: ConfigService<Env, true>,
  ) {
    super();
    this.from = config.get('MAIL_FROM', { infer: true });
    this.replyTo = config.get('MAIL_REPLY_TO', { infer: true });
    this.senderId = config.get('SMS_SENDER_ID', { infer: true });
  }

  async process(job: Job<NotificationJob>): Promise<{ id?: string }> {
    const { channel, to, template, data } = job.data;
    if (channel === 'email') {
      const { subject, text, html } = renderEmail(template, data);
      const info = (await this.mail.sendMail({
        from: this.from,
        ...(this.replyTo && { replyTo: this.replyTo }),
        to,
        subject,
        text,
        html,
      })) as { messageId?: string };
      this.logger.log({ msg: 'Email sent', template, jobId: job.id, messageId: info.messageId });
      return { id: info.messageId };
    }
    const result = await this.sms.send({
      to,
      body: renderSms(template, data),
      senderId: this.senderId,
    });
    this.logger.log({ msg: 'SMS sent', template, jobId: job.id, driver: this.sms.name });
    return result;
  }
}
