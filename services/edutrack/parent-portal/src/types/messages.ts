/* ---------------- Messages ---------------- */

export type ConversationKind = 'Teacher' | 'School';

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  subject: string;
  /** The other side: the teacher's name or the school's name. */
  with: string;
  /** The child the conversation is about, if any. */
  about: string | null;
  /** Preview (up to 140 characters); `at` is ISO. */
  lastMessage: { body: string; at: string; fromMe: boolean } | null;
  unread: number;
}

export interface ConversationList {
  conversations: ConversationSummary[];
  /** Unread messages across every conversation. */
  unread: number;
}

export interface ChatMessage {
  id: string;
  body: string;
  /** ISO. */
  at: string;
  sender: 'Parent' | 'Teacher' | 'School';
  mine: boolean;
  from: string;
}

export interface Thread {
  id: string;
  kind: ConversationKind;
  subject: string;
  with: string;
  about: string | null;
  /** False once the teacher has left the school. */
  canReply: boolean;
  messages: ChatMessage[];
}

export interface MessageContacts {
  school: string;
  children: {
    studentId: string;
    name: string;
    /** False once the child has left: the parent can only write to the school about them. */
    onRoll: boolean;
    className: string | null;
    teachers: { staffId: string; name: string; roles: string[] }[];
  }[];
}

export interface NewMessagePayload {
  to: 'school' | 'teacher';
  staffId?: string;
  studentId?: string;
  subject: string;
  body: string;
}
