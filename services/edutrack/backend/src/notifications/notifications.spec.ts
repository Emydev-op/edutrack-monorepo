import type { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { Transporter } from 'nodemailer';
import { DEV_JWT_SECRET, validateEnv } from '../config/env.validation.js';
import { NotificationsProcessor } from './notifications.processor.js';
import type { NotificationJob } from './notifications.service.js';
import type { SmsDriver } from './sms/sms-driver.js';
import { renderEmail, renderSms } from './templates/templates.js';

describe('templates', () => {
  it('renders the reset email with the link in text and escaped HTML', () => {
    const email = renderEmail('password-reset', {
      firstName: '<b>Ada</b>',
      link: 'http://localhost:5171/reset-password?token=abc&x=1',
      expiresInMinutes: 60,
    });
    expect(email.subject).toBe('Reset your EduTrack password');
    expect(email.text).toContain('http://localhost:5171/reset-password?token=abc&x=1');
    expect(email.html).toContain('reset-password?token=abc&amp;x=1');
    expect(email.html).not.toContain('<b>Ada</b>');
    expect(email.html).toContain('&lt;b&gt;Ada&lt;/b&gt;');
  });

  it('renders every template for email and SMS', () => {
    const invitation = {
      firstName: 'Chukwudi',
      invitedBy: 'Mrs. Adaeze Okonkwo · Principal',
      organisation: 'Greenfield Academy',
      position: 'Teacher',
      link: 'https://greenfield.edutrack.ng/teacher/accept-invitation/t',
      expiresOn: '20 Nov 2026',
    };
    expect(renderEmail('invitation', invitation).subject).toContain('Greenfield Academy');
    expect(renderSms('invitation', invitation)).toContain(invitation.link);
    expect(
      renderEmail('password-changed', { firstName: 'A', when: 'now', how: 'changed' }).text,
    ).toContain('signed out');
    expect(
      renderEmail('new-sign-in', {
        firstName: 'A',
        device: 'Chrome on macOS',
        when: 'now',
        portalName: 'School Admin',
      }).text,
    ).toContain('Chrome on macOS');
  });
});

describe('NotificationsProcessor', () => {
  const config = {
    get: (key: string) =>
      ({ MAIL_FROM: 'EduTrack <no-reply@edutrack.ng>', SMS_SENDER_ID: 'EduTrack' })[key],
  } as unknown as ConfigService;
  const job = (data: NotificationJob) => ({ id: '1', data }) as Job<NotificationJob>;

  it('sends email through the transport and SMS through the driver', async () => {
    const sendMail = vi.fn(() => Promise.resolve({ messageId: '<m1>' }));
    const send = vi.fn(() => Promise.resolve({ id: 's1' }));
    const sms: SmsDriver = { name: 'fake', send };
    const processor = new NotificationsProcessor(
      { sendMail } as unknown as Transporter,
      sms,
      config as never,
    );
    const data = { firstName: 'A', link: 'http://x/reset-password?token=t', expiresInMinutes: 60 };

    await processor.process(
      job({ channel: 'email', to: 'a@b.ng', template: 'password-reset', data }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@b.ng',
        from: 'EduTrack <no-reply@edutrack.ng>',
        subject: 'Reset your EduTrack password',
      }),
    );
    await processor.process(
      job({ channel: 'sms', to: '+2348030000000', template: 'password-reset', data }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+2348030000000', senderId: 'EduTrack' }),
    );
  });

  it('lets delivery errors propagate so BullMQ retries', async () => {
    const sendMail = vi.fn(() => Promise.reject(new Error('SMTP down')));
    const processor = new NotificationsProcessor(
      { sendMail } as unknown as Transporter,
      { name: 'fake', send: vi.fn() },
      config as never,
    );
    await expect(
      processor.process(
        job({
          channel: 'email',
          to: 'a@b.ng',
          template: 'password-changed',
          data: { firstName: 'A', when: 'now', how: 'x' },
        }),
      ),
    ).rejects.toThrow('SMTP down');
  });
});

describe('environment', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@db:5432/edutrack',
    REDIS_URL: 'redis://redis:6379',
    S3_REGION: 'eu-west-1',
    S3_BUCKET: 'b',
    S3_ACCESS_KEY_ID: 'k',
    S3_SECRET_ACCESS_KEY: 's',
  };
  const production = {
    ...base,
    NODE_ENV: 'production',
    JWT_SECRET: 'a-real-secret-that-is-long-enough-0123456789',
    APP_BASE_DOMAIN: 'edutrack.ng',
    PLATFORM_PORTAL_URL: 'https://backoffice.edutrack.ng',
    SCHOOL_ADMIN_PORTAL_URL: 'https://admin.edutrack.ng',
  };

  it('has safe development defaults', () => {
    const env = validateEnv(base);
    expect(env.JWT_SECRET).toBe(DEV_JWT_SECRET);
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
  });

  it('boots in production with real settings, with secure cookies by default', () => {
    expect(validateEnv(production).COOKIE_SECURE).toBe(true);
  });

  it('refuses to boot in production with development secrets or insecure cookies', () => {
    expect(() => validateEnv({ ...production, JWT_SECRET: undefined })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...production, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...production, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    expect(() => validateEnv({ ...production, APP_BASE_DOMAIN: 'localhost' })).toThrow(
      /APP_BASE_DOMAIN/,
    );
  });
});
