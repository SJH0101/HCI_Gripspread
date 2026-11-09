// Shared Supabase access for the Vercel functions. The secret key lives only in Vercel's environment
// variables (never in the repo, never sent to a browser). It bypasses RLS, so every route checks its own input,
// and every route needs the researcher password (Vercel env RESEARCHER_PASSWORD), typed once per browser.
//
// Storage layout (one bucket, one folder per kind):
//   experiment/P01/<started>/P01_015_final.zip    study sessions (checkpoints + final zip)
//   practice/P01/<started>/P01_015_final.zip      rehearsals and test runs (same format, never in the study analysis)
//   pilot/pilot_T1_<time>.json                     pilot tuning results, one per pilot participant
//   params/gripspread_params_<time>.json           merged pilot values the study loads (newest wins)
//   imu_calib/imu_calib_<time>.json                cup IMU sensor calibration (newest wins)
//   _test/<time>.txt                               connection tests
//   _trash/<time>/<original path>                  files moved away on the admin page (restorable)
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const BUCKET = process.env.SUPABASE_BUCKET || 'gripspread';
const TS = '[0-9TZ-]{10,40}';
const KINDS = {
  experiment: { dir: 'experiment', path: new RegExp(`^experiment/P\\d{2}/${TS}/P\\d{2}_\\d{3}_(final|after-step-\\d{1,3})\\.zip$`) },
  practice:   { dir: 'practice',   path: new RegExp(`^practice/P\\d{2}/${TS}/P\\d{2}_\\d{3}_(final|after-step-\\d{1,3})\\.zip$`) },
  pilot:      { dir: 'pilot',      path: new RegExp(`^pilot/pilot_[A-Za-z0-9-]{1,20}_${TS}\\.json$`) },
  params:     { dir: 'params',     path: new RegExp(`^params/gripspread_params_${TS}\\.json$`) },
  imu_calib:  { dir: 'imu_calib',  path: new RegExp(`^imu_calib/imu_calib_${TS}\\.json$`) },
  test:       { dir: '_test',      path: new RegExp(`^_test/${TS}\\.txt$`) },
};

let client = null;
function sb() {
  if (client) return client;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw Object.assign(new Error('server is missing SUPABASE_URL or SUPABASE_SECRET_KEY'), { status: 500 });
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
function _setClient(c) { client = c; }   // tests

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
// POST only + researcher password; returns the parsed body, or null after sending the error
function guard(req, res) {
  if (req.method !== 'POST') { send(res, 405, { error: 'POST only' }); return null; }
  const want = process.env.RESEARCHER_PASSWORD;
  if (!want) { send(res, 500, { error: 'server is missing RESEARCHER_PASSWORD' }); return null; }
  const b = body(req), h = x => crypto.createHash('sha256').update(String(x)).digest();
  if (!crypto.timingSafeEqual(h(b.password || ''), h(want))) { send(res, 401, { error: 'wrong password' }); return null; }
  return b;
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

module.exports = { sb, _setClient, BUCKET, KINDS, send, guard, list, isFolder };
