// Team documents edited on the site (docs.html). Markdown files in the same bucket:
//   docs/<name>.md                        current version
//   docs/_history/<name>/<time>.md        every earlier version (written before each save)
// POST {password, action, ...}
//   list                                   -> { docs: [{ name, updated_at, size }] }
//   get      {name}                        -> { content, sha, updated_at } (content null if never saved)
//   save     {name, content, base, force}  -> { sha }  409 { current, sha } when someone saved since `base`
//   history  {name}                        -> { versions: [{ ver, size }] } newest first
//   version  {name, ver}                   -> { content }
const crypto = require('crypto');
const { sb, BUCKET, send, guard, list, isFolder } = require('./_sb');

const NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const VER = /^[0-9TZ-]{10,40}$/;
const MAX = 300 * 1024;
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const store = () => sb().storage.from(BUCKET);

async function read(path) {
  const { data, error } = await store().download(path);
  if (error) {
    if (/not.?found|404|Object not found/i.test(error.message || '') || error.statusCode === '404' || error.status === 404) return null;
    throw Object.assign(new Error('download failed: ' + error.message), { status: 502 });
  }
  return await data.text();
}
async function write(path, text) {
  const { error } = await store().upload(path, Buffer.from(text, 'utf8'), { contentType: 'text/markdown; charset=utf-8', upsert: true });
  if (error) throw Object.assign(new Error('upload failed: ' + error.message), { status: 502 });
}

module.exports = async (req, res) => {
  const b = guard(req, res); if (!b) return;
  try {
    if (b.action === 'list') {
      const docs = (await list('docs')).filter(f => !isFolder(f) && /\.md$/.test(f.name))
        .map(f => ({ name: f.name.replace(/\.md$/, ''), updated_at: f.updated_at || f.created_at, size: (f.metadata && f.metadata.size) || 0 }));
      return send(res, 200, { docs });
    }
    if (!NAME.test(String(b.name || ''))) return send(res, 400, { error: 'bad name' });
    const path = `docs/${b.name}.md`;

    if (b.action === 'get') {
      const content = await read(path);
      return send(res, 200, { content, sha: content == null ? null : sha(content) });
    }
    if (b.action === 'save') {
      if (typeof b.content !== 'string') return send(res, 400, { error: 'content must be text' });
      if (Buffer.byteLength(b.content, 'utf8') > MAX) return send(res, 413, { error: 'too large' });
      const current = await read(path);
      if (current != null && !b.force && sha(current) !== b.base) return send(res, 409, { error: 'changed', current, sha: sha(current) });
      if (current === b.content) return send(res, 200, { sha: sha(current), unchanged: true });
      if (current != null) await write(`docs/_history/${b.name}/${new Date().toISOString().replace(/[:.]/g, '-')}.md`, current);
      await write(path, b.content);
      return send(res, 200, { sha: sha(b.content) });
    }
    if (b.action === 'history') {
      const versions = (await list(`docs/_history/${b.name}`)).filter(f => !isFolder(f) && /\.md$/.test(f.name))
        .map(f => ({ ver: f.name.replace(/\.md$/, ''), size: (f.metadata && f.metadata.size) || 0 })).reverse();
      return send(res, 200, { versions });
    }
    if (b.action === 'version') {
      if (!VER.test(String(b.ver || ''))) return send(res, 400, { error: 'bad ver' });
      const content = await read(`docs/_history/${b.name}/${b.ver}.md`);
      if (content == null) return send(res, 404, { error: 'no such version' });
      return send(res, 200, { content });
    }
    send(res, 400, { error: 'unknown action' });
  } catch (e) { send(res, e.status || 500, { error: e.message }); }
};
