// Data model for the simplified Carpenter Reward Disbursement Status app.
import type { Role } from '../types';

export type DStatus = 'PAID' | 'RETURN' | 'PENDING';

/** One carpenter's reward for one month, as listed in the uploaded workbook. */
export interface Disbursement {
  month: string;        // YYYY-MM
  carpenterId: string;
  name: string;
  bkash: string;
  territory: string;    // as written in the sheet
  area: string;
  zone: string;
  amount: number;
  status: DStatus;
  date?: string;        // YYYY-MM-DD when available
}

export interface SheetReport {
  sheet: string;
  month?: string;
  used: boolean;
  reason?: string;
  rows: number;
  paid: number; ret: number; pending: number; // amounts
  skippedRows: number;
  noTerritory?: number; // rows kept but with a blank Territory (not visible to SR / managers)
}

export interface DataSet {
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  rows: Disbursement[];
  sheets: SheetReport[];
}

/** A person who can sign in. Scope is a list of territory / area / zone names from the workbook. */
export interface Person {
  id: string;
  name: string;
  role: Role;
  scope: string[];      // sr: territories · asm: areas · zsm/dgm: zones · gm/super_admin: [] (everything)
  codeHash?: string;
  codeSetAt?: string;
  active: boolean;
  createdAt: string;
}

export const SCOPE_LEVEL: Record<Role, 'territory' | 'area' | 'zone' | 'all'> = {
  sr: 'territory', asm: 'area', zsm: 'zone', dgm: 'zone', gm: 'all', super_admin: 'all',
};
