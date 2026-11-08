// GET /api/status → { setup: true } when no Super Admin exists yet (first run).
import { handler, method, loadPeople } from './_lib.js';

export default handler(async (req, res) => {
  method(req, 'GET');
  const people = await loadPeople();
  res.json({ setup: !people.some((p) => p.role === 'super_admin' && p.active && p.codeHash) });
});
