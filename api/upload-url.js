// POST {path} -> a one-time signed upload URL for exactly that new object. The browser then PUTs the zip
// straight to Supabase, so large files never pass through this function (Vercel caps request bodies at 4.5 MB).
// Only the experiment program's own file names are accepted, and existing files are never overwritten.
const { sb, BUCKET, send, body } = require('./_sb');

const OK_PATH = [
  /^P\d{2}\/[0-9TZ-]{10,40}\/P\d{2}_\d{3}_(final|after-step-\d{1,3})\.zip$/,   // participant checkpoints and final zip
  /^_test\/[0-9TZ-]{10,40}\.txt$/,                                              // connection test
];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const path = String(body(req).path || '');
  if (!OK_PATH.some(r => r.test(path))) return send(res, 400, { error: 'path not allowed' });
  try {
    const { data, error } = await sb().storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) return send(res, /exist/i.test(error.message) ? 409 : 502, { error: error.message });
    send(res, 200, { url: data.signedUrl, path: data.path });
  } catch (e) { send(res, e.status || 500, { error: e.message }); }
};
