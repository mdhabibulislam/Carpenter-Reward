// PUT /api/carpenters { list } (Super Admin) → saves the latest carpenter list (new bKash numbers).
import { handler, method, body, requireUser, commit, HttpError, CARPENTERS } from './_lib.js';

export default handler(async (req, res) => {
  method(req, 'PUT');
  const me = await requireUser(req, { admin: true });
  const { list } = body(req);
  if (!list || !Array.isArray(list.entries) || !list.entries.length) throw new HttpError(400, 'The list has no usable rows.');
  const saved = { fileName: String(list.fileName || 'list.xlsx').slice(0, 200), uploadedAt: new Date().toISOString(), uploadedBy: me.name, entries: list.entries };
  await commit([{ path: CARPENTERS, content: JSON.stringify(saved) }], `Carpenter list by ${me.name}`);
  res.json(saved);
});
