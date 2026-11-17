"""Cup IMU measures per participant x technique x cup, computed the same way as the analysis page.

For every measured, non-warm-up, successful trial with a cup (60/75/90 mm), over the samples logged while the
trial was running:
  - angular velocity RMS (deg/s)              -> H2
  - maximum tilt change from the trial's start (deg) -> H3
  - linear acceleration RMS (m/s^2)            -> auxiliary
Trial values are averaged per participant x technique x cup.

Gravity direction is tracked with a complementary filter: the gyro rotates the previous estimate and the
accelerometer pulls it back while the cup is near 1 g (time constant 1 s). Samples are taken in receive-time
order (t_ms, ties in file order); the 16-bit packet counter (seq) restarts every 65536 samples and cannot order
a whole session. Calibration comes from session.json (offsets and scale from the calibration file, gyro bias
from the session's still check).

    python3 analysis/imu_metrics.py <folder with P*_final.zip> <out.csv>
"""
import glob
import json
import os
import sys
import zipfile

import numpy as np
import pandas as pd

G = 9.80665


def unit(x):
    n = np.linalg.norm(x)
    return x / n if n > 0 else np.array([0.0, 0.0, 1.0])


def read(z, suffix, **kw):
    return pd.read_csv(z.open(next(n for n in z.namelist() if n.endswith(suffix))), **kw)


def participant(path):
    z = zipfile.ZipFile(path)
    s = json.load(z.open(next(n for n in z.namelist() if n.endswith('session.json'))))
    cal = s['imu']['calib']
    cpd = s['imu'].get('counts_per_dps_used') or cal['gyro_counts_per_dps']
    bias = np.array(s['imu'].get('session_check', {}).get('gyro_bias') or cal['gyro_bias'])
    pid = int(s.get('pid') or os.path.basename(path)[1:3])

    trials = read(z, 'trials.csv')
    ok = trials[(trials.step == 'measure') & (trials.warmup == 0) & (trials.success == 1)
                & (trials.cup.astype(str) != 'none')]

    im = read(z, 'imu.csv', low_memory=False)
    im['row'] = np.arange(len(im))
    im = im.sort_values(['t_ms', 'row']).reset_index(drop=True)
    acc = (im[['ax_raw', 'ay_raw', 'az_raw']].values - np.array(cal['accel_offset'])) / np.array(cal['accel_counts_per_g'])
    gyr = (im[['gx_raw', 'gy_raw', 'gz_raw']].values - bias) / cpd
    t_us = im.t_us.values.astype(np.int64)

    grav = np.zeros_like(acc)
    lin = np.zeros(len(acc))
    v, prev = None, None
    for i in range(len(acc)):
        dt = np.inf if prev is None else ((t_us[i] - prev) % 2**32) / 1e6   # sensor clock is uint32 microseconds
        prev = t_us[i]
        if v is None or not (0 < dt <= 0.2):                                  # first sample or a gap: restart
            v = unit(acc[i]); grav[i] = v
            continue
        w = np.radians(gyr[i])
        trust = max(0.0, 1 - abs(np.linalg.norm(acc[i]) - 1) / 0.05)
        v = unit(v - np.cross(w, v) * dt + trust * dt * (unit(acc[i]) - v))
        grav[i] = v
        lin[i] = np.linalg.norm(acc[i] - v) * G

    per_trial = {}
    run = im[(im.phase == 'running') & im.trial_uid.notna()]
    for uid, g in run.groupby('trial_uid'):
        if len(g) < 10:
            continue
        ix = g.index.values
        tilt = np.degrees(np.arccos(np.clip(grav[ix] @ grav[ix[0]], -1, 1))).max()
        per_trial[uid] = (np.sqrt((gyr[ix] ** 2).sum(1).mean()), tilt, np.sqrt((lin[ix] ** 2).mean()))

    rows = []
    for (tech, cup), g in ok.groupby(['technique', 'cup']):
        vals = [per_trial[u] for u in g.trial_uid if u in per_trial]
        if vals:
            rms, tilt, lin_rms = np.mean(vals, axis=0)
            rows.append(dict(pid=pid, technique=tech, cup=str(cup), ang_rms_dps=rms, tilt_max_deg=tilt,
                             lin_rms_ms2=lin_rms, n_trials=len(vals), n_missing_imu=len(g) - len(vals)))
    return rows


def main(src, out):
    rows = []
    for path in sorted(glob.glob(os.path.join(src, 'P*_final.zip'))):
        rows += participant(path)
    d = pd.DataFrame(rows)
    d.to_csv(out, index=False)
    print(d.groupby('technique')[['ang_rms_dps', 'tilt_max_deg', 'lin_rms_ms2']].mean().round(2))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
