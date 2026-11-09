"""Make FAKE participant zips in the experiment program's format, to test gripspread_analysis.html.
Numbers are invented (trackpad loses more with bigger cups, GripSpread shakes the cup less). Never mix with real data.

usage: python3 make_fake_data.py OUT_DIR [N]
"""
import json, math, os, random, sys, zipfile

TRIAL_HEAD = ['pid','technique','cup','step','cond_index','trial_index','trial_uid','warmup','D','W','ID','direction','target_line','shown_ms','arm_ms','start_ms','first_move_ms','end_ms','plan_ms','mt_ms','total_ms','success','skipped','switchbacks','overshoot_px','gs_r0','gs_range_min','gs_range_max','gs_dead','gs_gain','gs_gamma','gs_boost_max','gs_boost_ms','gs_acc_ms','gs_brake_ms','gs_dir','tech_order','latin_row']
IMU_HEAD = ['t_ms','technique','cup','step','trial_uid','phase','seq','t_us','ax_raw','ay_raw','az_raw','gx_raw','gy_raw','gz_raw','tilt_deg','ref_ready','connection_id']
SEQ_HEAD = ['pid','technique','cup','seq']
TLX_HEAD = ['pid','technique','mental','physical','temporal','performance','effort','frustration','raw_tlx']
CAL = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'imu', 'calib', 'imu_calib_2026-11-05.json')))


def csv(head, rows):
    return '\n'.join([','.join(head)] + [','.join(str(r.get(h, '')) for h in head) for r in rows])


def person(i, rng):
    pid = f'P{i:02d}'
    skill = rng.gauss(1, .15)
    order = ['trackpad', 'gs'] if i % 2 else ['gs', 'trackpad']
    trials, imu, step, seq, t = [], [], 0, 0, 0
    for tech in order:
        for cup in ['none', '60', '75', '90']:
            step += 1
            cupk = {'none': 0, '60': 1, '75': 2, '90': 3}[cup]
            for k in range(2 + 36):          # 2 warm-up + 6 D x W cells x 6 reps (as in the study)
                D, W = [400, 1200, 3600][k % 3], [40, 120][(k // 3) % 2]
                ID = math.log2(D / W + 1)
                base_tp = (3.2 if tech == 'trackpad' else 2.4) * skill
                loss = (.07 * cupk if tech == 'trackpad' else .025 * cupk)
                mt = ID / (base_tp * (1 - loss)) * 1000 * rng.lognormvariate(0, .18)
                if rng.random() < .03: mt *= 3          # occasional lost-hand / regrip trial
                ok = rng.random() > (.03 + .015 * cupk * (tech == 'trackpad'))
                uid = f'm{step}-{k}'
                trials.append(dict(pid=pid, technique=tech, cup=cup, step='measure', cond_index=step, trial_index=k, trial_uid=uid,
                                   warmup=1 if k < 2 else 0, D=D, W=W, ID=round(ID, 4), direction='down' if k % 2 else 'up', target_line=10 + k,
                                   plan_ms=round(rng.gauss(450, 80)), mt_ms=round(mt) if ok else '', success='true' if ok else 'false', skipped=0,
                                   switchbacks=max(0, round(rng.gauss(1.2 if tech == 'trackpad' else 2.1, .8))), overshoot_px=max(0, round(rng.gauss(15, 10))),
                                   tech_order='>'.join(order), latin_row=i % 4))
                if cup == 'none':
                    continue
                shake = (.6 + .5 * cupk) if tech == 'trackpad' else (.35 + .1 * cupk)   # deg/s scale
                lean = (.8 * cupk if tech == 'trackpad' else .3 * cupk)                  # deg of tilt drift
                n = max(20, int(mt / 10))
                for s in range(n):
                    seq += 1; t += 10
                    ang = math.radians(lean * s / n)
                    ax, ay, az = 0, math.sin(ang), math.cos(ang)
                    g = [rng.gauss(0, shake) for _ in range(3)]
                    imu.append(dict(t_ms=t, technique=tech, cup=cup, step='measure', trial_uid=uid, phase='running', seq=seq, t_us=t * 1000,
                                    ax_raw=round(ax * CAL['accel_counts_per_g'][0] + CAL['accel_offset'][0]),
                                    ay_raw=round(ay * CAL['accel_counts_per_g'][1] + CAL['accel_offset'][1]),
                                    az_raw=round(az * CAL['accel_counts_per_g'][2] + CAL['accel_offset'][2]),
                                    gx_raw=round(g[0] * CAL['gyro_counts_per_dps'] + CAL['gyro_bias'][0]),
                                    gy_raw=round(g[1] * CAL['gyro_counts_per_dps'] + CAL['gyro_bias'][1]),
                                    gz_raw=round(g[2] * CAL['gyro_counts_per_dps'] + CAL['gyro_bias'][2]), tilt_deg='', ref_ready=1, connection_id=1))
    ck = {'none': 0, '60': 1, '75': 2, '90': 3}
    seq = [dict(pid=pid, technique=tech, cup=cup, seq=max(1, min(7, round(rng.gauss((5.5 - .6 * ck[cup]) if tech == 'trackpad' else (5 - .2 * ck[cup]), .9)))))
           for tech in order for cup in ['none', '60', '75', '90']]
    tlx = []
    for tech in order:
        vals = {k: max(0, min(100, round(rng.gauss(45 if tech == 'trackpad' else 35, 15)))) for k in TLX_HEAD[2:8]}
        tlx.append(dict(pid=pid, technique=tech, **vals, raw_tlx=round(sum(vals.values()) / 6, 1)))
    session = dict(pid=pid, hand='right', stature_cm=round(rng.gauss(172, 7)), hand_length_mm=round(rng.gauss(185, 10)), span_mm=round(rng.gauss(205, 12)),
                   tech_order=order, imu=dict(calib=CAL, session_check=dict(gyro_bias=CAL['gyro_bias']), counts_per_dps_used=CAL['gyro_counts_per_dps']),
                   note='FAKE DATA')
    return pid, trials, imu, tlx, seq, session


def main():
    out = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    os.makedirs(out, exist_ok=True)
    rng = random.Random(7)
    for i in range(1, n + 1):
        pid, trials, imu, tlx, seq, session = person(i, rng)
        with zipfile.ZipFile(os.path.join(out, f'FAKE_{pid}.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr(f'{pid}_trials.csv', csv(TRIAL_HEAD, trials))
            z.writestr(f'{pid}_imu.csv', csv(IMU_HEAD, imu))
            z.writestr(f'{pid}_tlx.csv', csv(TLX_HEAD, tlx))
            z.writestr(f'{pid}_seq.csv', csv(SEQ_HEAD, seq))
            z.writestr(f'{pid}_session.json', json.dumps(session))
    print('wrote', n, 'fake participants to', out)


if __name__ == '__main__':
    main()
