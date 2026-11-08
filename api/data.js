// GET  /api/data → gzip JSON { fileName, uploadedAt, uploadedBy, sheets, rows } with ONLY the rows this person may see.
// POST /api/data { part: base64 }            (Super Admin) → { sha }  one gzip piece of the new data
// POST /api/data { commit: { meta, parts } } (Super Admin) → saves the new data in one commit
import { handler, method, body, requireUser, readJson, readGzParts, createBlob, commit, visibleRows, gzip, HttpError, MANIFEST } from './_lib.js';

export const config = { maxDuration: 60 };

export default handler(async (req, res) => {
  method(req, 'GET', 'POST');
  const me = await requireUser(req, { admin: req.method === 'POST' });

  if (req.method === 'GET') {
    const m = await readJson(MANIFEST, null);
    if (!m) return res.status(204).end();
    const rows = visibleRows(me, await readGzParts(m.parts));
    const out = gzip({ fileName: m.fileName, uploadedAt: m.uploadedAt, uploadedBy: m.uploadedBy, sheets: me.role === 'super_admin' ? m.sheets : [], rows });
    // Vercel responses are limited to ~4.5 MB, so large results are sent in pieces: ?i=0, ?i=1, …
    const PIECE = 3.5 * 1024 * 1024, n = Math.max(1, Math.ceil(out.length / PIECE));
    const i = Math.min(n - 1, Math.max(0, parseInt(req.query?.i ?? '0', 10) || 0));
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Parts', String(n));
    return res.end(out.subarray(i * PIECE, (i + 1) * PIECE));
  }

  const b = body(req);
  if (b.part) {
    const buf = Buffer.from(String(b.part), 'base64');
    if (!buf.length || buf.length > 3.2 * 1024 * 1024) throw new HttpError(400, 'Bad upload piece.');
    return res.json({ sha: await createBlob(buf) });
  }
  if (b.commit) {
    const { meta, parts } = b.commit;
    if (!Array.isArray(parts) || !parts.length || parts.length > 40 || parts.some((s) => !/^[0-9a-f]{40}$/.test(s))) throw new HttpError(400, 'Bad upload.');
    const rows = await readGzParts(parts); // proves the pieces form valid data before saving
    if (!Array.isArray(rows) || !rows.length) throw new HttpError(400, 'No rows to save.');
    const manifest = {
      fileName: String(meta?.fileName || 'upload.xlsx').slice(0, 200), uploadedAt: new Date().toISOString(), uploadedBy: me.name,
      sheets: Array.isArray(meta?.sheets) ? meta.sheets.slice(0, 200) : [], rows: rows.length, parts,
    };
    await commit([{ path: MANIFEST, content: JSON.stringify(manifest, null, 1) }, ...parts.map((sha, i) => ({ path: `data/part-${i}.gz`, sha }))], `Upload ${manifest.fileName} by ${me.name}`);
    return res.json({ uploadedAt: manifest.uploadedAt, uploadedBy: manifest.uploadedBy });
  }
  throw new HttpError(400, 'Nothing to do.');
});
