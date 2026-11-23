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

/** A back-office notification sent by email or SMS (the staff member's channel preferences). */
export interface PlatformAlertData {
  firstName: string;
  title: string;
  detail: string;
  /** Full back-office URL to open. */
  link: string;
}

/** Sign-in email changed by an administrator; sent to the old and the new address. */
export interface EmailChangedData {
  firstName: string;
  oldEmail: string;
  newEmail: string;
  changedBy: string;
  when: string;
  /** Which address this copy goes to. */
  recipient: 'old' | 'new';
  /** Sign-in page of the portal the account uses. */
  link: string;
}

/** A support ticket update for a school administrator (reply, waiting on them, resolved). */
export interface SupportUpdateData {
  firstName: string;
  /** "SUP-1042". */
  number: string;
  subject: string;
  /** "EduTrack support replied", "Support marked it resolved". */
  title: string;
  /** The reply or what to do next. */
  detail: string;
  /** The ticket in School Admin. */
  link: string;
}

/**
 * A school's own message: an announcement or an automatic message (absence alert, report card
 * ready…) already worded from the school's template. The body is plain text; blank lines split
 * paragraphs.
 */
export interface AnnouncementData {
  subject: string;
  body: string;
  schoolName: string;
}

/** A new message in a conversation (Parent Portal, Teacher Workspace or the school office). */
export interface ChatMessageData {
  /** "Mrs. Funke Adeyemi", "Mr. Gabriel Okafor", "Greenfield Academy office". */
  recipientName: string;
  /** Who wrote it, as the recipient sees them. */
  from: string;
  subject: string;
  /** The start of the message. */
  preview: string;
  /** The conversation in the recipient's portal. */
  link: string;
  schoolName: string;
}

export interface TemplateDataMap {
  invitation: InvitationData;
  'password-reset': PasswordResetData;
  'password-changed': PasswordChangedData;
  'new-sign-in': NewSignInData;
  'renewal-reminder': RenewalReminderData;
  'platform-alert': PlatformAlertData;
  'email-changed': EmailChangedData;
  'support-update': SupportUpdateData;
  announcement: AnnouncementData;
  'chat-message': ChatMessageData;
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
    case 'platform-alert': {
      const d = data as PlatformAlertData;
      const lines = [`Hello ${d.firstName},`, d.title, ...(d.detail ? [d.detail] : [])];
      return {
        subject: d.title,
        text: `${lines.join('\n\n')}\n\nOpen in the back office: ${d.link}`,
        html: layout(lines, { label: 'Open in the back office', href: d.link }),
      };
    }
    case 'email-changed': {
      const d = data as EmailChangedData;
      const lines =
        d.recipient === 'new'
          ? [
              `Hello ${d.firstName},`,
              `${d.changedBy} changed the email on your EduTrack account to ${d.newEmail} on ${d.when}.`,
              `From now on, sign in with this address. Your password stays the same, and ${d.oldEmail} no longer works for signing in.`,
            ]
          : [
              `Hello ${d.firstName},`,
              `${d.changedBy} changed the email on your EduTrack account from ${d.oldEmail} to ${d.newEmail} on ${d.when}. This address no longer works for signing in.`,
              'If you didn’t expect this, contact your EduTrack administrator straight away.',
            ];
      return {
        subject: 'The email on your EduTrack account was changed',
        text:
          d.recipient === 'new'
            ? `${lines.join('\n\n')}\n\nSign in: ${d.link}\n\n${SECURITY_FOOTER}`
            : `${lines.join('\n\n')}\n\n${SECURITY_FOOTER}`,
        html: layout(
          lines,
          d.recipient === 'new' ? { label: 'Sign in', href: d.link } : undefined,
          SECURITY_FOOTER,
        ),
      };
    }
    case 'support-update': {
      const d = data as SupportUpdateData;
      const lines = [`Hello ${d.firstName},`, `${d.title} on ${d.number}: ${d.subject}.`, d.detail];
      return {
        subject: `${d.number}: ${d.title}`,
        text: `${lines.join('\n\n')}\n\nOpen the ticket: ${d.link}`,
        html: layout(lines, { label: 'Open the ticket', href: d.link }),
      };
    }
    case 'announcement': {
      const d = data as AnnouncementData;
      const lines = d.body
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
      const footer = `Sent by ${d.schoolName} through EduTrack.`;
      return {
        subject: d.subject,
        text: `${lines.join('\n\n')}\n\n${footer}`,
        html: layout(lines, undefined, footer),
      };
    }
    case 'chat-message': {
      const d = data as ChatMessageData;
      const lines = [
        `Hello ${d.recipientName},`,
        `${d.from} sent you a message about “${d.subject}”:`,
        d.preview,
        'Open the conversation to read it all and reply.',
      ];
      const footer = `Sent by ${d.schoolName} through EduTrack. Reply in the portal, not to this email.`;
      return {
        subject: `New message from ${d.from}: ${d.subject}`,
        text: `${lines.join('\n\n')}\n\n${d.link}\n\n${footer}`,
        html: layout(lines, { label: 'Open the conversation', href: d.link }, footer),
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
    case 'platform-alert': {
      const d = data as PlatformAlertData;
      return `EduTrack: ${d.title} ${d.link}`;
    }
    case 'email-changed': {
      const d = data as EmailChangedData;
      return `Your EduTrack sign-in email is now ${d.newEmail}. Not expected? Contact your administrator.`;
    }
    case 'support-update': {
      const d = data as SupportUpdateData;
      return `EduTrack support · ${d.number}: ${d.title}. ${d.link}`;
    }
    case 'announcement':
      return (data as AnnouncementData).body;
    case 'chat-message': {
      const d = data as ChatMessageData;
      return `${d.from} sent you a message: ${d.subject}. ${d.link}`;
    }
    default:
      throw new Error(`Unknown SMS template: ${String(template)}`);
  }
}
