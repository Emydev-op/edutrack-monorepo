import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Env } from '../config/env.validation.js';

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/** SMTP transport: Mailpit locally (localhost:1025, no auth), the provider's SMTP when deployed. */
export function createMailTransport(config: ConfigService<Env, true>) {
  const user = config.get('SMTP_USER', { infer: true });
  const pass = config.get('SMTP_PASSWORD', { infer: true });
  return nodemailer.createTransport({
    host: config.get('SMTP_HOST', { infer: true }),
    port: config.get('SMTP_PORT', { infer: true }),
    secure: config.get('SMTP_SECURE', { infer: true }),
    ...(user && { auth: { user, pass } }),
    // Fail a stuck delivery so BullMQ retries it instead of holding the worker.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}
