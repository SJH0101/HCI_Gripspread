// POST {password} -> for each participant folder, the newest final zip (or else the newest checkpoint),
// as short-lived signed download URLs. Participant data is readable only with the researcher password
// (Vercel env RESEARCHER_PASSWORD); the browser downloads the files directly from Supabase.
const crypto = require('crypto');
const { sb, BUCKET, send, body } = require('./_sb');

function samePassword(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

async function list(prefix) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb().storage.from(BUCKET).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw Object.assign(new Error('list failed: ' + error.message), { status: 502 });
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
const isFolder = e => e.id == null;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const want = process.env.RESEARCHER_PASSWORD;
  if (!want) return send(res, 500, { error: 'server is missing RESEARCHER_PASSWORD' });
  if (!samePassword(body(req).password || '', want)) return send(res, 401, { error: 'wrong password' });
  try {
    const top = await list('');
    const pick = [];
    for (const p of top.filter(e => isFolder(e) && !e.name.startsWith('_'))) {
      const files = [];
      for (const s of (await list(p.name)).filter(isFolder))
        for (const f of await list(`${p.name}/${s.name}`))
          if (/\.zip$/.test(f.name)) files.push({ path: `${p.name}/${s.name}/${f.name}`, session: s.name, name: f.name });
      if (!files.length) continue;
      const finals = files.filter(f => /_final\.zip$/.test(f.name)).sort((x, y) => x.path.localeCompare(y.path));
      const pool = finals.length ? finals : files.sort((x, y) => (x.session + x.name).localeCompare(y.session + y.name));
      pick.push(pool[pool.length - 1]);
    }
    let urls = [];
    if (pick.length) {
      const { data, error } = await sb().storage.from(BUCKET).createSignedUrls(pick.map(f => f.path), 600);
      if (error) throw Object.assign(new Error('sign failed: ' + error.message), { status: 502 });
      urls = data;
    }
    send(res, 200, {
      files: pick.map((f, i) => ({ name: f.name, path: f.path, final: /_final\.zip$/.test(f.name), url: urls[i] && urls[i].signedUrl })),
      has_test: top.some(e => e.name === '_test'),
      bucket_empty: top.length === 0,
    });
  } catch (e) { send(res, e.status || 500, { error: e.message }); }
};
