// POST {password, action, paths?} -> manage the bucket from the admin page.
//   list:     every file with folder, size and dates
//   sign:     short-lived download URLs for paths
//   trash:    move paths to _trash/<time>/<path> (nothing is lost; the analysis never reads folders starting with _)
//   restore:  move _trash/<time>/<path> back to <path>
//   delete:   permanently remove paths, allowed only inside _trash/
const { sb, BUCKET, send, guard, list, isFolder } = require('./_sb');

async function walk(prefix, out) {
  for (const e of await list(prefix)) {
    const p = prefix ? `${prefix}/${e.name}` : e.name;
    if (isFolder(e)) await walk(p, out);
    else out.push({ path: p, size: (e.metadata && e.metadata.size) || 0, created_at: e.created_at, updated_at: e.updated_at });
  }
  return out;
}
const asPaths = v => (Array.isArray(v) ? v : []).map(String).filter(p => p && !p.includes('..') && !p.startsWith('/'));

module.exports = async (req, res) => {
  const b = guard(req, res); if (!b) return;
  const st = () => sb().storage.from(BUCKET), paths = asPaths(b.paths);
  try {
    if (b.action === 'list') return send(res, 200, { files: await walk('', []) });
    if (!paths.length || paths.length > 500) return send(res, 400, { error: 'give 1-500 paths' });
    if (b.action === 'sign') {
      const { data, error } = await st().createSignedUrls(paths, 600);
      if (error) throw new Error(error.message);
      return send(res, 200, { urls: data.map(d => d.signedUrl) });
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-'), done = [], failed = [];
    for (const p of paths) {
      let from = p, to = null;
      if (b.action === 'trash') { if (p.startsWith('_trash/')) { failed.push({ path: p, error: 'already in trash' }); continue; } to = `_trash/${stamp}/${p}`; }
      else if (b.action === 'restore') { const m = p.match(/^_trash\/[^/]+\/(.+)$/); if (!m) { failed.push({ path: p, error: 'not in trash' }); continue; } to = m[1]; }
      else if (b.action === 'delete') { if (!p.startsWith('_trash/')) { failed.push({ path: p, error: 'move to trash first' }); continue; } }
      else return send(res, 400, { error: 'unknown action' });
      const { error } = to ? await st().move(from, to) : await st().remove([from]);
      if (error) failed.push({ path: p, error: error.message }); else done.push(to ? { from, to } : { deleted: from });
    }
    send(res, 200, { done, failed });
  } catch (e) { send(res, e.status || 500, { error: e.message }); }
};
