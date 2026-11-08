// POST /api/setup { name, code } → first run only: creates the Super Admin.
import crypto from 'node:crypto';
import { handler, method, body, loadPeople, commit, hashCode, validCode, signSession, publicPerson, HttpError, PEOPLE } from './_lib.js';

export default handler(async (req, res) => {
  method(req, 'POST');
  const { name, code } = body(req);
  const people = await loadPeople();
  if (people.some((p) => p.role === 'super_admin' && p.active && p.codeHash)) throw new HttpError(409, 'Setup is already done.');
  if (!validCode(code)) throw new HttpError(400, 'Login code must be 8–20 letters or numbers.');
  const now = new Date().toISOString();
  const p = {
    id: `P-${crypto.randomBytes(6).toString('hex')}`, name: String(name || '').trim().slice(0, 80) || 'Super Admin',
    role: 'super_admin', scope: [], codeHash: hashCode(code), codeSetAt: now, active: true, createdAt: now,
  };
  await commit([{ path: PEOPLE, content: JSON.stringify([...people, p], null, 1) }], 'Create Super Admin');
  res.json({ token: signSession(p.id), user: publicPerson(p) });
});
