// POST {password, path} -> a one-time signed upload URL for exactly that new object. The browser then PUTs the file
// straight to Supabase, so large zips never pass through this function (Vercel caps request bodies at 4.5 MB).
// Only the study pages' own file names are accepted (see KINDS), and existing files are never overwritten.
const { sb, BUCKET, KINDS, send, guard } = require('./_sb');

module.exports = async (req, res) => {
  const b = guard(req, res); if (!b) return;
  const path = String(b.path || '');
  if (!Object.values(KINDS).some(k => k.path.test(path))) return send(res, 400, { error: 'path not allowed' });
  try {
    const { data, error } = await sb().storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) return send(res, /exist/i.test(error.message) ? 409 : 502, { error: error.message });
    send(res, 200, { url: data.signedUrl, path: data.path });
  } catch (e) { send(res, e.status || 500, { error: e.message }); }
};
