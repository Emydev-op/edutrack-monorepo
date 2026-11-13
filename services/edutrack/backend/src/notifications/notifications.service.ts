import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import type { TemplateDataMap, TemplateName } from './templates/templates.js';

export const NOTIFICATIONS_QUEUE = 'notifications';

export type NotificationJob =
  | { channel: 'email'; to: string; template: TemplateName; data: TemplateDataMap[TemplateName] }
  | { channel: 'sms'; to: string; template: TemplateName; data: TemplateDataMap[TemplateName] };

/**
 * Jobs carry links with secrets (reset, invitation), so completed jobs are removed at once and
 * failed ones after a day; the tokens themselves expire well before that matters.
 */
const JOB_OPTIONS: JobsOptions = {
  attempts: 6,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: true,
  removeOnFail: { age: 24 * 3600 },
};

/**
 * Queues transactional email and SMS. Request handlers never send synchronously: they enqueue and
 * return; `NotificationsProcessor` delivers with retries and backoff.
 */
@Injectable()
export class NotificationsService {
  constructor(@InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue<NotificationJob>) {}

  async email<T extends TemplateName>(to: string, template: T, data: TemplateDataMap[T]) {
    await this.queue.add(
      `email:${template}`,
      { channel: 'email', to, template, data },
      JOB_OPTIONS,
    );
  }

  async sms<T extends TemplateName>(to: string, template: T, data: TemplateDataMap[T]) {
    await this.queue.add(`sms:${template}`, { channel: 'sms', to, template, data }, JOB_OPTIONS);
  }
}
