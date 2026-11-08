// POST /api/login { code } → { token, user }
import { handler, method, body, loadPeople, hashCode, validCode, signSession, publicPerson, throttle, ipOf, HttpError } from './_lib.js';

export default handler(async (req, res) => {
  method(req, 'POST');
  const t = throttle(ipOf(req));
  const { code } = body(req);
  const h = validCode(code) ? hashCode(code) : null;
  const p = h && (await loadPeople()).find((x) => x.active && x.codeHash === h);
  if (!p) { t.fail(); throw new HttpError(401, 'That login code is not valid.'); }
  t.ok();
  res.json({ token: signSession(p.id), user: publicPerson(p) });
});
