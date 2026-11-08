// GET /api/me → the signed-in person; Super Admin also gets everyone and the carpenter list.
import { handler, method, requireUser, loadPeople, readJson, publicPerson, CARPENTERS } from './_lib.js';

export default handler(async (req, res) => {
  method(req, 'GET');
  const me = await requireUser(req);
  const admin = me.role === 'super_admin';
  res.json({
    user: publicPerson(me),
    people: admin ? (await loadPeople()).map(publicPerson) : [publicPerson(me)],
    carpenterList: admin ? await readJson(CARPENTERS, null) : null,
  });
});
