/** A school's SMS in the back office: prepaid units and its sender ID. */
export type SenderIdStatus = 'Not requested' | 'Pending approval' | 'Approved' | 'Rejected';

export interface SenderIdRequest {
  id: string;
  name: string;
  status: SenderIdStatus;
  requestedAt: string;
  requestedBy: string;
  decidedAt: string | null;
  note: string;
}

export interface SmsLedgerLine {
  id: string;
  at: string;
  /** Plan allowance · Top-up · Used · Returned · Adjustment. */
  kind: string;
  /** Signed: positive adds units. */
  units: number;
  detail: string;
  by: string;
}

export interface SchoolSms {
  school: string;
  plan: string;
  /** SMS units the plan includes each term. */
  allowancePerTerm: number;
  balance: number;
  usedThisTerm: number;
  /** What SMS goes out as now ("EDUTRACK" until a sender ID is approved). */
  sender: string;
  senderId: { name: string; status: SenderIdStatus };
  requests: SenderIdRequest[];
  ledger: SmsLedgerLine[];
}

export interface SmsTopUpPayload {
  units: number;
  reference: string;
  note: string;
}
