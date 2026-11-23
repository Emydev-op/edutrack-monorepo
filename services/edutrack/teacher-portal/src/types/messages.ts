/** Messages between the teacher and parents (`/v1/messages`). */
export type ConversationKind = 'Teacher' | 'School';
export type MessageSender = 'Parent' | 'Teacher' | 'School';

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  subject: string;
  /** The parent, as the teacher sees them. */
  with: string;
  /** The child the conversation is about, if any. */
  about: string | null;
  /** The newest message: its first 140 characters, when (ISO) and whether the teacher sent it. */
  lastMessage: { body: string; at: string; fromMe: boolean } | null;
  unread: number;
}

export interface ConversationList {
  conversations: ConversationSummary[];
  /** Unread messages across every conversation, for the sidebar badge. */
  unread: number;
}

export interface ThreadMessage {
  id: string;
  body: string;
  /** ISO timestamp. */
  at: string;
  sender: MessageSender;
  mine: boolean;
  from: string;
}

export interface ConversationThread {
  id: string;
  kind: ConversationKind;
  subject: string;
  with: string;
  about: string | null;
  /** False once the teacher has left the school: replies return 409 CONVERSATION_CLOSED. */
  canReply: boolean;
  messages: ThreadMessage[];
}

export interface MessageContactParent {
  guardianId: string;
  name: string;
  /** "Mother", "Father", "Guardian"… */
  relationship: string;
}

export interface MessageContactStudent {
  studentId: string;
  name: string;
  className: string;
  parents: MessageContactParent[];
}

/** The students the teacher teaches this term, with their parents. */
export interface MessageContacts {
  students: MessageContactStudent[];
}

export interface NewMessagePayload {
  guardianId: string;
  studentId?: string;
  subject: string;
  body: string;
}

/** Limits the API enforces (422 beyond them). */
export const MESSAGE_LIMITS = { subject: 120, body: 2000 } as const;
