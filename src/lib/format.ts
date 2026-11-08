export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const bdt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const money = (n: number) => `৳${bdt.format(Math.round(n))}`;
export const moneyShort = (n: number) =>
  n >= 1e7 ? `৳${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `৳${(n / 1e5).toFixed(2)} L` : money(n);
export const num = (n: number) => bdt.format(n);
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export const maskPhone = (p?: string) => (p && p.length >= 8 ? `${p.slice(0, 3)}****${p.slice(-4)}` : p || '—');

export const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const uid = () => Math.random().toString(36).slice(2, 10);
