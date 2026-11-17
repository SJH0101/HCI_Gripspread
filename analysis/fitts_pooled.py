"""Fitts' law fit per technique x cup on participant x condition means (Soukoreff & MacKenzie, 2004).

Each point is one participant's mean movement time in one D x W cell (successful, measured, non-warm-up trials),
against the nominal ID = log2(D/W + 1). Nominal ID is used because a trial succeeds only when the target stops
inside the target zone, so endpoints never spread beyond W.

    python3 analysis/fitts_pooled.py <folder with P*_final.zip>
"""
import glob
import os
import sys
import zipfile

import numpy as np
import pandas as pd


def main(src):
    frames = []
    for path in sorted(glob.glob(os.path.join(src, 'P*_final.zip'))):
        z = zipfile.ZipFile(path)
        frames.append(pd.read_csv(z.open(next(n for n in z.namelist() if n.endswith('trials.csv')))))
    t = pd.concat(frames)
    ok = t[(t.step == 'measure') & (t.warmup == 0) & (t.success == 1)]
    cells = ok.groupby(['technique', 'cup', 'pid', 'D', 'W']).mt_ms.mean().reset_index()
    cells['ID'] = np.log2(cells.D / cells.W + 1)
    for (tech, cup), g in cells.groupby(['technique', 'cup']):
        b, a = np.polyfit(g.ID, g.mt_ms, 1)
        pred = a + b * g.ID
        r2 = 1 - ((g.mt_ms - pred) ** 2).sum() / ((g.mt_ms - g.mt_ms.mean()) ** 2).sum()
        print(f'{tech:9s} {str(cup):5s} points={len(g):3d}  a={a:7.0f} ms  b={b:6.0f} ms/bit  R2={r2:.2f}')


if __name__ == '__main__':
    main(sys.argv[1])
