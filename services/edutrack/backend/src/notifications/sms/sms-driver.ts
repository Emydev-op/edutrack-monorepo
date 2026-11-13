import { Logger } from '@nestjs/common';

/** Sends one SMS. Implementations: `LogSmsDriver` now; Termii when the account is set up. */
export interface SmsDriver {
  readonly name: string;
  send(message: { to: string; body: string; senderId: string }): Promise<{ id?: string }>;
}

export const SMS_DRIVER = Symbol('SMS_DRIVER');

/** Development driver: writes the SMS to the log instead of sending it. */
export class LogSmsDriver implements SmsDriver {
  readonly name = 'log';
  private readonly logger = new Logger('SMS');

  send(message: { to: string; body: string; senderId: string }) {
    // Mask the middle of the number; the body is shown so links can be clicked locally.
    const to = message.to.replace(/^(\+\d{4})\d+(\d{3})$/, '$1•••$2');
    this.logger.log({ msg: 'SMS (log driver)', to, from: message.senderId, body: message.body });
    return Promise.resolve({});
  }
}
