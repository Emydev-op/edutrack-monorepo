/**
 * Transactional message templates: plain text plus a small HTML version for email, and a short
 * text for SMS. Every value is escaped before it goes into HTML.
 */

export interface InvitationData {
  firstName: string;
  invitedBy: string;
  /** "Greenfield Academy" or "EduTrack" for platform staff. */
  organisation: string;
  position?: string | null;
  link: string;
  expiresOn: string;
}

export interface PasswordResetData {
  firstName: string;
  link: string;
  expiresInMinutes: number;
}

export interface PasswordChangedData {
  firstName: string;
  when: string;
  /** How it changed: "reset with an emailed link", "changed in your account settings". */
  how: string;
}

export interface NewSignInData {
  firstName: string;
  device: string;
  when: string;
  ip?: string | null;
  portalName: string;
}

export interface RenewalReminderData {
  /** The billing contact, or the school's name when there is none. */
  name: string;
  schoolName: string;
  plan: string;
  /** `31 Aug 2027`. */
  renewsOn: string;
  /** `₦1,850,000`. */
  amount: string;
}

export interface TemplateDataMap {
  invitation: InvitationData;
  'password-reset': PasswordResetData;
  'password-changed': PasswordChangedData;
  'new-sign-in': NewSignInData;
  'renewal-reminder': RenewalReminderData;
}

export type TemplateName = keyof TemplateDataMap;

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Wraps paragraphs (and an optional button) in a minimal, client-safe HTML layout. */
function layout(paragraphs: string[], button?: { label: string; href: string }, footer?: string) {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p)}</p>`)
    .join('');
  const cta = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.href)}" style="background:#1F6FEB;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(button.label)}</a></p>` +
      `<p style="margin:0 0 16px;font-size:13px;color:#555">Or paste this link into your browser:<br>${escapeHtml(button.href)}</p>`
    : '';
  const foot = footer
    ? `<p style="margin:24px 0 0;font-size:12px;color:#777">${escapeHtml(footer)}</p>`
    : '';
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px">${body}${cta}${foot}</body></html>`;
}

const SECURITY_FOOTER =
  'EduTrack will never ask for your password by email, phone or SMS. If you didn’t expect this message, you can ignore it.';

export function renderEmail<T extends TemplateName>(
  template: T,
  data: TemplateDataMap[T],
): RenderedEmail {
  switch (template) {
    case 'invitation': {
      const d = data as InvitationData;
      const role = d.position ? ` as ${d.position}` : '';
      const lines = [
        `Hello ${d.firstName},`,
        `${d.invitedBy} has invited you to join ${d.organisation} on EduTrack${role}.`,
        `Accept the invitation to set your password and sign in. The link expires on ${d.expiresOn}.`,
      ];
      return {
        subject: `You’re invited to ${d.organisation} on EduTrack`,
        text: `${lines.join('\n\n')}\n\nAccept the invitation: ${d.link}\n\n${SECURITY_FOOTER}`,
        html: layout(lines, { label: 'Accept invitation', href: d.link }, SECURITY_FOOTER),
      };
    }
    case 'password-reset': {
      const d = data as PasswordResetData;
      const lines = [
        `Hello ${d.firstName},`,
        'We received a request to reset your EduTrack password.',
        `The link below works once and expires in ${d.expiresInMinutes} minutes. If you didn’t ask for this, ignore this email: your password stays the same.`,
      ];
      return {
        subject: 'Reset your EduTrack password',
        text: `${lines.join('\n\n')}\n\nReset your password: ${d.link}\n\n${SECURITY_FOOTER}`,
        html: layout(lines, { label: 'Reset password', href: d.link }, SECURITY_FOOTER),
      };
    }
    case 'password-changed': {
      const d = data as PasswordChangedData;
      const lines = [
        `Hello ${d.firstName},`,
        `Your EduTrack password was ${d.how} on ${d.when}. Other devices were signed out.`,
        'If this wasn’t you, reset your password straight away and tell your school administrator.',
      ];
      return {
        subject: 'Your EduTrack password was changed',
        text: `${lines.join('\n\n')}\n\n${SECURITY_FOOTER}`,
        html: layout(lines, undefined, SECURITY_FOOTER),
      };
    }
    case 'new-sign-in': {
      const d = data as NewSignInData;
      const where = d.ip ? ` (IP ${d.ip})` : '';
      const lines = [
        `Hello ${d.firstName},`,
        `Your account was used to sign in to ${d.portalName} from a new device: ${d.device}${where}, on ${d.when}.`,
        'If this was you, there’s nothing to do. If not, change your password and sign out other devices from your profile.',
      ];
      return {
        subject: 'New sign-in to your EduTrack account',
        text: `${lines.join('\n\n')}\n\n${SECURITY_FOOTER}`,
        html: layout(lines, undefined, SECURITY_FOOTER),
      };
    }
    case 'renewal-reminder': {
      const d = data as RenewalReminderData;
      const lines = [
        `Hello ${d.name},`,
        `${d.schoolName}’s EduTrack ${d.plan} subscription renews on ${d.renewsOn}. The renewal is ${d.amount}.`,
        'Renew before that date to keep every feature running for your staff, parents and students. If you have already paid, thank you: you can ignore this reminder.',
      ];
      return {
        subject: `${d.schoolName}: your EduTrack subscription renews on ${d.renewsOn}`,
        text: lines.join('\n\n'),
        html: layout(lines),
      };
    }
    default:
      throw new Error(`Unknown email template: ${String(template)}`);
  }
}

/** SMS bodies: short, one link, no HTML. */
export function renderSms<T extends TemplateName>(template: T, data: TemplateDataMap[T]): string {
  switch (template) {
    case 'invitation': {
      const d = data as InvitationData;
      return `${d.organisation} invited you to EduTrack. Accept by ${d.expiresOn}: ${d.link}`;
    }
    case 'password-reset': {
      const d = data as PasswordResetData;
      return `Reset your EduTrack password (expires in ${d.expiresInMinutes} min): ${d.link}`;
    }
    case 'password-changed':
      return 'Your EduTrack password was changed. If this wasn’t you, reset it now.';
    case 'new-sign-in': {
      const d = data as NewSignInData;
      return `New EduTrack sign-in on ${d.device}. Not you? Change your password.`;
    }
    case 'renewal-reminder': {
      const d = data as RenewalReminderData;
      return `${d.schoolName}: your EduTrack subscription renews on ${d.renewsOn} (${d.amount}).`;
    }
    default:
      throw new Error(`Unknown SMS template: ${String(template)}`);
  }
}
