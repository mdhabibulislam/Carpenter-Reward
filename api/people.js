// PUT /api/people { people: [...] } (Super Admin) → saves the whole people list.
// codeHash per person: "set" = keep the current code, "new:CODE" = set this new code, empty = no code.
import { handler, method, body, requireUser, loadPeople, commit, hashCode, validCode, publicPerson, HttpError, PEOPLE } from './_lib.js';

const ROLES = new Set(['super_admin', 'gm', 'dgm', 'zsm', 'asm', 'sr']);

export default handler(async (req, res) => {
  method(req, 'PUT');
  const me = await requireUser(req, { admin: true });
  const byId = new Map((await loadPeople()).map((p) => [p.id, p]));
  const incoming = body(req).people;
  if (!Array.isArray(incoming) || incoming.length > 5000) throw new HttpError(400, 'Bad people list.');
  const now = new Date().toISOString();
  const seen = new Map();
  const next = incoming.map((x) => {
    if (!x || typeof x.id !== 'string' || !ROLES.has(x.role) || !String(x.name || '').trim()) throw new HttpError(400, 'Bad person in list.');
    const old = byId.get(x.id);
    let codeHash = old?.codeHash, codeSetAt = old?.codeSetAt;
    const c = String(x.codeHash || '');
    if (c.startsWith('new:')) {
      if (!validCode(c.slice(4))) throw new HttpError(400, `Login code for ${x.name} must be 8–20 letters or numbers.`);
      codeHash = hashCode(c.slice(4)); codeSetAt = now;
    } else if (c !== 'set') { codeHash = undefined; codeSetAt = undefined; }
    if (codeHash) {
      if (seen.has(codeHash)) throw new HttpError(409, `${x.name} and ${seen.get(codeHash)} would have the same login code.`);
      seen.set(codeHash, x.name);
    }
    return {
      id: x.id, name: String(x.name).trim().slice(0, 80), role: x.role,
      scope: Array.isArray(x.scope) ? x.scope.map(String).slice(0, 300) : [],
      codeHash, codeSetAt, active: x.active !== false, createdAt: old?.createdAt || now,
    };
  });
  const self = next.find((p) => p.id === me.id);
  if (!self || !self.active || self.role !== 'super_admin') throw new HttpError(400, 'You cannot remove, deactivate or demote yourself.');
  await commit([{ path: PEOPLE, content: JSON.stringify(next, null, 1) }], `People updated by ${me.name}`);
  res.json({ people: next.map(publicPerson) });
});
