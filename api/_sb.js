// Shared Supabase access for the Vercel functions. The secret key lives only in Vercel's environment
// variables (never in the repo, never sent to a browser). It bypasses RLS, so every route checks its own input.
const { createClient } = require('@supabase/supabase-js');

const BUCKET = process.env.SUPABASE_BUCKET || 'gripspread';
let client = null;
function sb() {
  if (client) return client;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw Object.assign(new Error('server is missing SUPABASE_URL or SUPABASE_SECRET_KEY'), { status: 500 });
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
// for tests
function _setClient(c) { client = c; }

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}

module.exports = { sb, _setClient, BUCKET, send, body };
