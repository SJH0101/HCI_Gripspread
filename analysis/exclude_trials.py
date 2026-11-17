"""Copy participant zips, dropping trials that the analysis excludes. The original zips are never changed.

Rule: in a GripSpread measured condition where the researcher re-measured the calibration mid-condition
(session.json "recalibrations", step = measure), the measured trials run before the condition's final
calibration are dropped. They are detected per trial from the calibration columns (gs_r0, gs_range_min,
gs_range_max): a non-warm-up trial whose values differ from the last trial of that condition was run with an
earlier calibration.

The dropped trials are removed from trials.csv, frames.csv and imu.csv, so the analysis page (or any script)
reads the filtered copies as usual.

    python3 analysis/exclude_trials.py <folder with P*_final.zip> <output folder>
"""
import glob
import io
import os
import sys
import zipfile

import pandas as pd

CAL = ['gs_r0', 'gs_range_min', 'gs_range_max']


def excluded_uids(trials):
    m = trials[(trials.step == 'measure') & (trials.technique == 'gs')]
    out = []
    for _, g in m.groupby('cup'):
        last = tuple(g[CAL].iloc[-1])
        stale = g[(g.warmup == 0) & (g[CAL].apply(tuple, axis=1) != last)]
        out += stale.trial_uid.tolist()
    return out


def main(src, dst):
    os.makedirs(dst, exist_ok=True)
    for path in sorted(glob.glob(os.path.join(src, 'P*_final.zip'))):
        z = zipfile.ZipFile(path)
        names = z.namelist()
        trials = pd.read_csv(z.open(next(n for n in names if n.endswith('trials.csv'))))
        drop = excluded_uids(trials)
        if drop:
            print(os.path.basename(path), 'drops', drop)
        with zipfile.ZipFile(os.path.join(dst, os.path.basename(path)), 'w', zipfile.ZIP_DEFLATED) as out:
            for n in names:
                b = z.read(n)
                if drop and n.endswith(('trials.csv', 'frames.csv', 'imu.csv')):
                    d = pd.read_csv(io.BytesIO(b), low_memory=False)
                    if 'trial_uid' in d.columns:
                        hit = d.trial_uid.isin(drop) & (d.technique == 'gs')
                        if 'step' in d.columns:
                            hit &= d.step == 'measure'
                        d = d[~hit]
                    b = d.to_csv(index=False).encode()
                out.writestr(n, b)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
