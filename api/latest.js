// POST {password, kind: 'params' | 'imu_calib'} -> the newest file of that kind, parsed ({ name, data }),
// or { name: null } when there is none yet. File names carry an ISO time, so the last name is the newest.
const { sb, BUCKET, KINDS, send, guard, list, isFolder } = require('./_sb');

module.exports = async (req, res) => {
  const b = guard(req, res); if (!b) return;
  const k = KINDS[b.kind];
  if (!k || !['params', 'imu_calib'].includes(b.kind)) return send(res, 400, { error: 'kind must be params or imu_calib' });
  try {
    const files = (await list(k.dir)).filter(f => !isFolder(f) && /\.json$/.test(f.name)).sort((x, y) => x.name.localeCompare(y.name));
    if (!files.length) return send(res, 200, { name: null });
    const f = files[files.length - 1];
    const { data, error } = await sb().storage.from(BUCKET).download(`${k.dir}/${f.name}`);
    if (error) throw Object.assign(new Error('download failed: ' + error.message), { status: 502 });
    send(res, 200, { name: f.name, data: JSON.parse(await data.text()) });
  } catch (e) { send(res, e.status || 500, { error: e.message }); }
};
