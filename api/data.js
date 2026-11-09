// POST {password, kind} -> short-lived signed download URLs; the browser downloads the files straight from Supabase.
//   kind 'experiment' (default): per participant folder, the newest final zip (or else the newest checkpoint)
//   kind 'pilot': every pilot result file
const { sb, BUCKET, send, guard, list, isFolder } = require('./_sb');

async function experimentFiles() {
  const pick = [];
  for (const p of (await list('experiment')).filter(isFolder)) {
    const files = [];
    for (const s of (await list(`experiment/${p.name}`)).filter(isFolder))
      for (const f of await list(`experiment/${p.name}/${s.name}`))
        if (/\.zip$/.test(f.name)) files.push({ path: `experiment/${p.name}/${s.name}/${f.name}`, session: s.name, name: f.name });
    if (!files.length) continue;
    const finals = files.filter(f => /_final\.zip$/.test(f.name)).sort((x, y) => x.path.localeCompare(y.path));
    const pool = finals.length ? finals : files.sort((x, y) => (x.session + x.name).localeCompare(y.session + y.name));
    pick.push(pool[pool.length - 1]);
  }
  return pick;
}
async function pilotFiles() {
  return (await list('pilot')).filter(f => !isFolder(f) && /\.json$/.test(f.name)).map(f => ({ path: `pilot/${f.name}`, name: f.name }));
}

module.exports = async (req, res) => {
  const b = guard(req, res); if (!b) return;
  const kind = b.kind === 'pilot' ? 'pilot' : 'experiment';
  try {
    const pick = kind === 'pilot' ? await pilotFiles() : await experimentFiles();
    let urls = [];
    if (pick.length) {
      const { data, error } = await sb().storage.from(BUCKET).createSignedUrls(pick.map(f => f.path), 600);
      if (error) throw Object.assign(new Error('sign failed: ' + error.message), { status: 502 });
      urls = data;
    }
    const top = await list('');
    send(res, 200, {
      kind,
      files: pick.map((f, i) => ({ name: f.name, path: f.path, final: /_final\.zip$/.test(f.name), url: urls[i] && urls[i].signedUrl })),
      has_test: top.some(e => e.name === '_test'),
      bucket_empty: top.length === 0,
    });
  } catch (e) { send(res, e.status || 500, { error: e.message }); }
};
