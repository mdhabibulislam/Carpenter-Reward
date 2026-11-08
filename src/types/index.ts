export type Role = 'super_admin' | 'gm' | 'dgm' | 'zsm' | 'asm' | 'sr';
export type EmpRole = Exclude<Role, 'super_admin'>;
export const ROLE_LEVEL: Record<Role, number> = { super_admin: 1, gm: 2, dgm: 3, zsm: 4, asm: 5, sr: 6 };
export const ROLE_ORDER: Role[] = ['super_admin', 'gm', 'dgm', 'zsm', 'asm', 'sr'];
export type UnitType = 'COMPANY' | 'REGION' | 'ZONE' | 'AREA' | 'TERRITORY';
export interface OrgUnit { id: string; name: string; type: UnitType; parentId?: string }
export interface Assignment { id: string; employeeId: string; unitId?: string; managerId?: string; from: string; to?: string; active: boolean; by: string }
export type PaymentStatus = 'PAID' | 'PENDING' | 'FAILED' | 'NOT_SENT';
export type DataSource = 'DEMO' | 'COMPANY_API' | 'MANUAL_IMPORT';

export interface Territory { id: string; name: string; region: string }
export interface Employee {
  id: string; name: string; role: EmpRole; designation: string;
  managerId?: string;          // undefined only for GM (reports to Super Admin)
  unitId: string;              // organisational unit (region/zone/area/territory)
  territoryId?: string;        // SR only
  asmId?: string;              // SR only — kept equal to managerId for legacy code
  mobile: string; email: string; active: boolean;
}

export interface Carpenter {
  id: string; name: string; mobile: string; bkash: string;
  territoryId: string; srId: string; asmId: string;
  eligibleAmount: number; eligibility: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'ON_HOLD';
  isActive: boolean; source: DataSource; lastSyncedAt: string;
}

export interface PaymentPeriod { id: string; code: string; label: string; start: string; end: string; status: 'DRAFT' | 'OPEN' | 'CLOSED' }

export interface PaymentAttempt { no: number; at: string; status: PaymentStatus; amount: number; txnId?: string; reason?: string; batchNo?: string }
export interface Followup { id: string; at: string; by: string; role: Role; comment: string; resolution?: string }
export interface HistoryEntry { at: string; by: string; change: string }

export interface PaymentRecord {
  id: string; carpenterId: string; periodId: string; batchId?: string;
  // snapshot of assignment at time of record creation
  territoryId: string; srId: string; asmId: string; zsmId: string; dgmId: string; gmId: string; bkashSnapshot: string;
  eligibleAmount: number; paidAmount: number; status: PaymentStatus;
  txnId?: string; paymentDate?: string; failureReason?: string; failureNote?: string;
  attempts: PaymentAttempt[]; followups: Followup[]; history: HistoryEntry[];
}

export interface PaymentBatch {
  id: string; batchNo: string; periodId: string;
  status: 'DRAFT' | 'PREPARED' | 'EXPORTED' | 'RESULTS_UPLOADED' | 'RECONCILED';
  recordIds: string[]; totalAmount: number; createdAt: string; createdBy: string;
  unmatched: { txnId: string; carpenterId: string; amount: number; status: string; note: string; uploadedAt?: string }[];
}

export interface SyncLog {
  id: string; trigger: 'MANUAL' | 'SCHEDULED' | 'INITIAL'; mode: 'FULL' | 'INCREMENTAL';
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED'; startedAt: string; finishedAt: string;
  total: number; created: number; updated: number; skipped: number; failed: number;
  errors: { id: string; error: string }[];
}

export interface AuditLog { id: string; at: string; actor: string; role: Role; action: string; entity: string; entityId: string; detail: string }

export interface AppUser {
  id: string; name: string; email: string; role: Role; employeeId?: string; active: boolean; lastLogin?: string;
  /** One-way hash of the login code — the code itself is never stored. */
  codeHash?: string; codeSetAt?: string;
}

export const FAILURE_REASONS = [
  'Invalid bKash Number', 'Inactive bKash Account', 'Account Restricted', 'Information Mismatch', 'Duplicate Entry',
  'Technical Issue', 'Insufficient Balance', 'Approval Pending', 'Verification Pending', 'Not Included in Payment Batch', 'Other',
] as const;

export const STATUS_LABEL: Record<PaymentStatus, string> = { PAID: 'Paid', PENDING: 'Pending', FAILED: 'Failed', NOT_SENT: 'Not Sent' };
export const ROLE_LABEL: Record<Role, string> = { super_admin: 'Super Admin', gm: 'GM', dgm: 'DGM', zsm: 'ZSM', asm: 'ASM', sr: 'SR' };
export const DESIGNATION: Record<Role, string> = {
  super_admin: 'Super Admin', gm: 'General Manager', dgm: 'Deputy General Manager', zsm: 'Zonal Sales Manager', asm: 'Area Sales Manager', sr: 'Sales Representative',
};
