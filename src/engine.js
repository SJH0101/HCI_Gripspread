// GripSpread engine: webcam hand landmarks -> V spread angle (deg) -> IDLE/HOLD/ACTIVE/PAUSE state -> scroll velocity.
// The neutral (r0) is captured once and kept: losing the hand only pauses input (PAUSE), and input comes back
// when the spread returns inside the dead zone. Only resetNeutral() or a new calibration replaces r0.
// No DOM besides the <video>. The host page renders status through the callbacks.
const GripEngine = (() => {
  // ---------- tunable parameters (pilot values) ----------
  const P = { dead:0.15, gain:800, gamma:2.2, holdMs:700, smooth:0.35, curlMax:80,
    boostMax:2.5, boostMs:1200, boostOn:0.6, boostDecayMs:200, accMs:250, brakeMs:60, minSide:10, minSpeed:15,
    angleMode:'dorsal' };  // 'dorsal' (11/10): back of the hand faces the camera; 'tips': the earlier tip-based V
  const FOLD_PERSIST = 6; // frames (~0.1 s) a 'folded' reading must last before input freezes
  const EXT_MIN = 0.55;    // 'tips': in-plane knuckle->tip length / palm length below this = fingers folded
  const BASE_MIN = 0.4;    // 'dorsal': in-plane share of the first finger bone below this (knuckle bent > ~66°) = folded
  const JUMP_MAX = 20;     // deg per frame; bigger jumps are dropped unless they persist 3 frames
  const FACING_MIN = 0.35; // |palm normal . camera axis| below this = palm seen edge-on
  const HOLD_SD = 2.5;     // deg; neutral capture restarts when the spread moves more than this
  const REARM_MS = 250;    // after a pause, the spread must sit in the dead zone this long before input resumes
  const CALIB_MS = 1500, COUNT_MS = 3000;
  // Dropouts (hand not detected) while ACTIVE. Closing the V hides the gap between index and middle and, in front
  // of a white cup, the detector often loses the hand exactly then. So a dropout is bridged instead of cutting input:
  //   - any direction: the last angle is kept for COAST_MS (one or two lost frames are invisible to the user)
  //   - last reading on the closing side (spread below the neutral): kept up to GAP_MS, so scrolling continues
  //   - otherwise input stops (command 0) but the state stays ACTIVE; the hand back within GAP_MS resumes at once
  //   - after GAP_MS: PAUSE as before (the spread must come back to the dead zone to resume)
  // Frames logged with reason 'coast' are bridged frames.
  const COAST_MS = 250, GAP_MS = 1500;
  // Dead zone floor in degrees, each side. The dorsal angle spans fewer degrees than the old tip angle (a range of
  // about 10° on the opening side is normal), so dead = 0.15 of it was ~1.5°: hand jitter kept leaving the zone, the
  // command never sat at 0, and a trial could not arm (the scroll did not move at all). The zone is now at least
  // DEAD_MIN_DEG wide on each side; with the old tip angle's larger ranges this floor never applies.
  const DEAD_MIN_DEG = 3;
  const RANGE_KEY = 'gripspread_range_deg_v2';   // v2: dorsal θ (11/10); v1 ranges were tip-based

  const E = {
    P, dirSign:-1, state:'IDLE', r0:null, range:null, theta:null, reliable:false, reason:null,
    feat:null, lm:null, world:null, velocity:0, holdProgress:0, calibStep:null, fps:0,
    onStatus:()=>{}, onBeep:()=>{}, onState:()=>{}, onNeutral:()=>{}, onRange:()=>{},
    freezeRange:false,   // true in the study: the normalization stays exactly as calibrated
  };
  try{ const v = JSON.parse(localStorage.getItem(RANGE_KEY)); if(v && v.max > v.min) E.range = v; }catch(e){}

  // ---------- geometry ----------
  const sub = (a,b) => ({x:a.x-b.x, y:a.y-b.y, z:a.z-b.z});
  const dot = (a,b) => a.x*b.x + a.y*b.y + a.z*b.z;
  const cross = (a,b) => ({x:a.y*b.z-a.z*b.y, y:a.z*b.x-a.x*b.z, z:a.x*b.y-a.y*b.x});
  const norm = a => Math.hypot(a.x, a.y, a.z);
  const angBetween = (u,v) => Math.acos(Math.max(-1, Math.min(1, dot(u,v)/(norm(u)*norm(v)+1e-12)))) * 180 / Math.PI;
  const bend = (w,a,b,c) => angBetween(sub(w[b],w[a]), sub(w[c],w[b]));
  const fingerCurl = (w, mcp) => bend(w,mcp,mcp+1,mcp+2) + bend(w,mcp+1,mcp+2,mcp+3);
  // Two ways to read the V angle; P.angleMode picks which one drives θ (both are computed and kept in E.feat).
  //  'tips'   (until 11/10): from the midpoint of knuckles 5 and 9, the angle between fingertips 8 and 12, in the
  //           palm plane (0,5,17). Needs both tips in view.
  //  'dorsal' (from 11/10): the back of the hand faces the camera and the cup sits in the palm, so the knuckles and
  //           the first finger bones are what the camera sees well; the fingertips curl round the cup, behind it.
  //           θ is the difference of the two fingers' sideways (abduction) angles at the knuckles:
  //             k  = knuckle line, index knuckle 5 -> little-finger knuckle 17 (long baseline, seen on the back)
  //             d  = finger direction from its joints, weighted to the knuckle end (MCP->PIP 0.6, PIP->DIP 0.3,
  //                  DIP->tip 0.1), so the hidden tips hardly count
  //             abduction = the finger's angle in the back-of-hand plane (0,5,17), measured from the direction
  //                  across the knuckle line: atan2(d·k, d·f), f = in-plane, perpendicular to k, toward the fingers.
  //                  Bending a finger toward the palm (wrapping the cup) only adds a component along the plane's
  //                  normal, which the projection drops, so grip depth barely moves θ (exact for bending about an
  //                  axis across the finger; per-person calibration absorbs the rest).
  //             θ  = abduction(middle) − abduction(index): grows as the V opens, ~0 when the fingers lie side by
  //                  side, below 0 if they cross. Fingertips are barely used.
  //           Fold check: only the bend at the knuckle counts (first bone nearly perpendicular to the back of the hand,
  //           as in a fist); curled PIP/DIP joints are the normal grip. Facing still applies.
  const unit = v => { const l = norm(v) || 1e-12; return {x:v.x/l, y:v.y/l, z:v.z/l}; };
  const add = (a,b,k=1) => ({x:a.x+k*b.x, y:a.y+k*b.y, z:a.z+k*b.z});
  const W_SEG = [0.6, 0.3, 0.1];
  function spreadAngle(world){
    // palm plane: facing check, and the 'tips' angle
    const n0 = cross(sub(world[5], world[0]), sub(world[17], world[0])), nl = norm(n0);
    if(nl < 1e-9) return null;
    const n = {x:n0.x/nl, y:n0.y/nl, z:n0.z/nl};
    const proj = v => { const k = dot(v, n); return {x:v.x-k*n.x, y:v.y-k*n.y, z:v.z-k*n.z}; };
    const m = {x:(world[5].x+world[9].x)/2, y:(world[5].y+world[9].y)/2, z:(world[5].z+world[9].z)/2};
    const a = proj(sub(world[8], m)), b = proj(sub(world[12], m)), la = norm(a), lb = norm(b);
    const palmLen = norm(sub(world[9], world[0]));
    const degTips = Math.acos(Math.max(-1, Math.min(1, dot(a,b)/(la*lb+1e-12)))) * 180 / Math.PI;
    // dorsal: abduction of each finger along the knuckle line
    const k = unit(proj(sub(world[17], world[5])));
    let f = unit(cross(n, k)); if(dot(f, sub(world[9], world[0])) < 0) f = {x:-f.x, y:-f.y, z:-f.z};
    // Each bone's in-plane direction is taken pointing toward the fingers: a bone curled past 90° (back toward the
    // wrist) is flipped, because flipping undoes the curl and leaves its true sideways lean. Without this, a deep
    // grip turns the summed direction backward and the lean changes sign.
    const abd = mcp => { let x = 0, y = 0;
      for(let s=0; s<3; s++){ const u = unit(sub(world[mcp+s+1], world[mcp+s])), fy = dot(u, f), sg = fy < 0 ? -1 : 1;
        x += W_SEG[s] * sg * dot(u, k); y += W_SEG[s] * sg * fy; }
      return Math.atan2(x, y) * 180 / Math.PI; };
    const abdI = abd(5), abdM = abd(9);
    const degDorsal = abdM - abdI;
    const deg = P.angleMode === 'tips' ? degTips : degDorsal;
    // dorsal fold measure: how much of each finger's first bone (knuckle -> PIP) lies in the back-of-hand plane.
    // 1 = straight out, cos(bend at the knuckle) in general; a fist or fingers wrapped flat on the cup drive it to 0,
    // and then the sideways angle is read from a stub and turns to noise.
    const base = b => { const u = unit(sub(world[b+1], world[b])); return norm(proj(u)); };
    const baseI = base(5), baseM = base(9);
    return { deg, degTips, degDorsal, abdI, abdM, baseI, baseM, facing:Math.abs(n.z), extI:la/palmLen, extM:lb/palmLen };
  }

  // ---------- state machine ----------
  const STATE_TEXT = { IDLE:'컵을 쥔 손을 손등이 카메라를 보게 올려 주세요', HOLD:'편한 V로 잠깐 멈춰 주세요', ACTIVE:'켜짐', PAUSE:'편한 V로 돌아오면 다시 켜집니다' };
  const WARN_TEXT = { facing:'손등을 카메라 쪽으로 돌려 주세요 (입력 멈춤)', folded:'손가락 접힘 (입력 멈춤)', lost:'손 인식이 불안정합니다 (입력 멈춤)' };
  let holdStart = 0, holdBuf = [], lastSeen = 0, needHandDown = false, jumpCount = 0, foldFrames = 0, rearmStart = 0;
  function status(){
    if(E.calibStep) return;
    const warn = E.lm && !E.reliable;
    E.onStatus(warn ? (WARN_TEXT[E.reason] || WARN_TEXT.lost) : STATE_TEXT[E.state], warn ? 'warn' : E.state.toLowerCase(), E.holdProgress);
  }
  function setState(s){
    if(s === E.state) return;
    if(s === 'ACTIVE') E.onBeep(880); if(E.state === 'ACTIVE') E.onBeep(440);
    E.state = s; E.velocity = 0; E.holdProgress = 0;
    if(s === 'IDLE'){ E.r0 = null; holdBuf = []; }
    if(s === 'HOLD'){ holdBuf = []; holdStart = performance.now(); }
    if(s === 'PAUSE') rearmStart = 0;
    E.onState(s);
  }
  E.resetNeutral = () => setState('IDLE');

  // ---------- hand range calibration (max open -> max close) ----------
  const STEP_TEXT = { max:'① 최대로 벌려 주세요', min:'② 최대로 오므려 주세요' };
  let calib = null;
  const pct = (arr, q) => { const a = [...arr].sort((x,y)=>x-y); return a[Math.min(a.length-1, Math.max(0, Math.round(q*(a.length-1))))]; };
  function startStep(step, got){ calib = { step, phase:'wait', start:0, lastTick:0, buf:[], got }; E.calibStep = step;
    E.onStatus(STEP_TEXT[step] + '. 손을 올리면 카운트다운이 시작됩니다', 'hold', 0); }
  E.startRange = () => { setState('IDLE'); startStep('max', {}); };
  function calibTick(now, v){
    if(v == null){ if(calib.phase !== 'wait'){ calib.phase = 'wait'; calib.buf = []; E.onStatus(STEP_TEXT[calib.step] + '. 손이 안 보입니다. 다시 올려 주세요', 'hold', 0); } return; }
    if(calib.phase === 'wait'){ calib.phase = 'count'; calib.start = now; calib.lastTick = 0; }
    if(calib.phase === 'count'){
      const left = Math.ceil((COUNT_MS - (now - calib.start)) / 1000);
      if(left !== calib.lastTick && left > 0){ calib.lastTick = left; E.onBeep(520, 0.06); }
      E.onStatus(`${STEP_TEXT[calib.step]}  ${left > 0 ? left : ''}`, 'hold', 0);
      if(now - calib.start >= COUNT_MS){ calib.phase = 'capture'; calib.start = now; calib.buf = []; E.onBeep(880, 0.12); }
      return;
    }
    calib.buf.push(v);
    const prog = Math.min(1, (now - calib.start) / CALIB_MS);
    E.onStatus(STEP_TEXT[calib.step] + '. 측정 중입니다. 그대로 유지해 주세요', 'hold', prog);
    if(prog < 1) return;
    if(calib.step === 'max'){ E.onBeep(660, 0.1); startStep('min', { max: pct(calib.buf, 0.9) }); return; }
    const got = { ...calib.got, min: pct(calib.buf, 0.1) };
    if(got.max - got.min > 8){
      E.range = { min:got.min, max:got.max };
      try{ localStorage.setItem(RANGE_KEY, JSON.stringify(E.range)); }catch(e){}
      E.onRange(E.range);
      E.onBeep(990, 0.15); calib = null; E.calibStep = null; needHandDown = true; setState('IDLE');
      E.onStatus('손 범위를 저장했습니다. 손을 내렸다가 편한 V로 다시 올려 주세요', 'idle', 0);
    } else { E.onBeep(220, 0.25); startStep('max', {}); E.onStatus('손 범위가 너무 좁게 나왔습니다. 다시 ' + STEP_TEXT.max, 'hold', 0); }
  }

  // ---------- mapping ----------
  // Normalized deviation e in [-1, 1]: opening side divided by (max - r0), closing side by (r0 - min).
  const sideDen = s => !E.range ? 15 : s >= 0 ? Math.max(P.minSide, E.range.max - E.r0) : Math.max(P.minSide, E.r0 - E.range.min);
  const deadFrac = s => Math.min(0.9, Math.max(P.dead, DEAD_MIN_DEG / sideDen(s)));   // dead zone as a share of that side
  const deadDeg = s => deadFrac(s) * sideDen(s);
  function normDev(v){
    const e = v - E.r0;
    if(!E.range) return Math.max(-1, Math.min(1, e / 15));
    const den = e >= 0 ? Math.max(P.minSide, E.range.max - E.r0) : Math.max(P.minSide, E.r0 - E.range.min);
    return Math.max(-1, Math.min(1, e / den));
  }
  E.deadBand = () => {
    if(E.r0 == null) return null;
    return [E.r0 - deadDeg(-1), E.r0 + deadDeg(1)];
  };
  // Velocity with acceleration, not a direct angle->speed map:
  //  1. command speed = gain * mag^gamma, multiplied by a hold-time boost (1 -> boostMax, linear over boostMs,
  //     ) that grows while the same direction is held and resets on reversal or in the dead zone.
  //  2. the actual velocity follows the command with a slow time constant when speeding up (accMs)
  //     and a fast one when slowing down or reversing (brakeMs), so stopping is crisp.
  // Boost B only builds while the finger is pushed hard (mag >= boostOn): +((boostMax-1)/boostMs) per ms.
  // Easing off (mag < boostOn) decays B back to 1 with boostDecayMs, so the approach to a target slows down.
  // A direction change or the dead zone resets B to 1 immediately.
  let holdDir = 0, lastVelT = 0, B = 1;
  E.boost = 1; E.command = 0;
  function computeVelocity(now){
    const dtMs = lastVelT ? Math.min(50, now - lastVelT) : 0, dt = dtMs / 1000; lastVelT = now;
    let cmd = 0;
    if(E.state === 'ACTIVE' && E.theta != null && E.r0 != null && E.reliable){
      const e = normDev(E.theta);
      const dz = deadFrac(e), mag = Math.max(0, Math.abs(e) - dz) / Math.max(0.01, 1 - dz);
      const dir = mag > 0 ? Math.sign(e) * E.dirSign : 0;
      if(dir !== holdDir){ holdDir = dir; B = 1; }
      if(dir && mag >= P.boostOn) B = Math.min(P.boostMax, B + (P.boostMax - 1) * dtMs / P.boostMs);
      else B = 1 + (B - 1) * Math.exp(-dtMs / P.boostDecayMs);
      cmd = dir * P.gain * Math.pow(mag, P.gamma) * B;
      // Any input outside the dead zone moves at least minSpeed px/s (1 px per 66 ms), so it is always visible.
      // Without it, a hand a hair outside the band gives a sub-pixel creep: the content looks stopped but is not.
      if(cmd !== 0 && Math.abs(cmd) < P.minSpeed) cmd = Math.sign(cmd) * P.minSpeed;
      // keep the calibrated range honest: angles beyond it widen it
      if(E.range && !E.freezeRange){ if(E.theta > E.range.max) E.range.max = E.theta; if(E.theta < E.range.min) E.range.min = E.theta; }
    } else { holdDir = 0; B = 1; }
    E.boost = B; E.command = cmd;
    const v = E.velocity || 0;
    const speedingUp = (Math.sign(cmd) === Math.sign(v) && Math.abs(cmd) > Math.abs(v)) || (v === 0 && cmd !== 0);
    const tau = (speedingUp ? P.accMs : P.brakeMs) / 1000;
    let next = v + (cmd - v) * (1 - Math.exp(-dt / Math.max(0.001, tau)));
    if(cmd === 0 && Math.abs(next) < 5) next = 0;
    return next;
  }

  E._tick = (now) => { E.velocity = computeVelocity(now); }; // for offline simulation/tests

  // ---------- per-frame update ----------
  let landmarker = null, video = null, lastVideoTime = -1, fpsCount = 0, fpsT = 0;
  E.ready = () => !!landmarker;
  E.init = async (HandLandmarker, FilesetResolver, videoEl) => {
    video = videoEl;
    const stream = await navigator.mediaDevices.getUserMedia({video:{width:640, height:480, frameRate:{ideal:60}}, audio:false});
    video.srcObject = stream; await video.play();
    try{ const tr = stream.getVideoTracks()[0], st = tr.getSettings(); E.camera = { label:tr.label, width:st.width, height:st.height, frameRate:st.frameRate }; }catch(e){ E.camera = null; }
    const fileset = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
    const opts = d => ({ baseOptions:{ modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", delegate:d },
      runningMode:"VIDEO", numHands:1, minHandDetectionConfidence:0.4, minHandPresenceConfidence:0.3, minTrackingConfidence:0.3 });
    try{ landmarker = await HandLandmarker.createFromOptions(fileset, opts("GPU")); }
    catch(e){ landmarker = await HandLandmarker.createFromOptions(fileset, opts("CPU")); }
    status();
  };
  // Returns true when a new camera frame was processed.
  E.update = (now) => {
    if(now - fpsT > 1000){ E.fps = fpsCount; fpsCount = 0; fpsT = now; }
    if(!landmarker || video.readyState < 2 || video.currentTime === lastVideoTime){ E.velocity = computeVelocity(now); return false; }
    lastVideoTime = video.currentTime; fpsCount++;
    const res = landmarker.detectForVideo(video, now);
    const lm = res.landmarks && res.landmarks[0], world = res.worldLandmarks && res.worldLandmarks[0];
    E.lm = lm || null; E.world = world || null;
    if(lm && world){
      lastSeen = now;
      const m = spreadAngle(world);
      E.feat = m ? { ...m, curlI:fingerCurl(world,5), curlM:fingerCurl(world,9),
        score: res.handedness && res.handedness[0] && res.handedness[0][0] ? res.handedness[0][0].score : null } : null;
      const folded = m && (P.angleMode === 'tips'
        ? (Math.min(m.extI, m.extM) < EXT_MIN || Math.max(E.feat.curlI, E.feat.curlM) > P.curlMax)
        : Math.min(m.baseI, m.baseM) < BASE_MIN);   // dorsal: only the knuckle bend counts, PIP/DIP curl is the grip
      foldFrames = folded ? foldFrames + 1 : 0;
      E.reason = !m ? 'lost' : m.facing < FACING_MIN ? 'facing' : foldFrames >= FOLD_PERSIST ? 'folded' : null;
      E.reliable = !E.reason;
      if(E.reliable && m && !folded){   // brief folded readings keep the last angle instead of feeding noise
        if(E.theta != null && Math.abs(m.deg - E.theta) > JUMP_MAX && ++jumpCount < 3){ /* drop spike */ }
        else { jumpCount = 0; E.theta = E.theta == null ? m.deg : E.theta + P.smooth * (m.deg - E.theta); }
      }
    } else {
      E.feat = null;
      const gap = now - lastSeen, closing = E.r0 != null && E.theta != null && E.theta < E.r0;
      const coast = !E.calibStep && E.state === 'ACTIVE' && E.theta != null && (gap <= COAST_MS || (closing && gap <= GAP_MS));
      E.reliable = coast; E.reason = coast ? 'coast' : null;
    }

    if(E.calibStep){
      if(!lm) calibTick(now, null); else if(E.reliable) calibTick(now, E.theta);
    } else if(!lm){
      if(now - lastSeen > (E.state === 'ACTIVE' ? GAP_MS : 500)){
        if(E.r0 != null && (E.state === 'ACTIVE' || E.state === 'PAUSE')) setState('PAUSE');   // keep the neutral
        else { setState('IDLE'); needHandDown = false; }
        E.theta = null;
      }
    } else if(E.state === 'PAUSE'){
      const band = E.deadBand();
      const inBand = E.reliable && E.theta != null && band && E.theta >= band[0] && E.theta <= band[1];
      if(!inBand) rearmStart = 0; else if(!rearmStart) rearmStart = now;
      E.holdProgress = rearmStart ? Math.min(1, (now - rearmStart) / REARM_MS) : 0;
      if(rearmStart && now - rearmStart >= REARM_MS) setState('ACTIVE');
    } else if(E.state === 'IDLE' && !needHandDown){
      setState('HOLD');
    } else if(E.state === 'HOLD' && E.theta != null && E.reliable){
      holdBuf.push(E.theta);
      const mean = holdBuf.reduce((a,b)=>a+b,0)/holdBuf.length;
      const sd = Math.sqrt(holdBuf.reduce((a,b)=>a+(b-mean)**2,0)/holdBuf.length);
      if(sd > HOLD_SD){ holdBuf = []; holdStart = now; }
      E.holdProgress = Math.min(1, (now - holdStart) / P.holdMs);
      if(E.holdProgress >= 1 && holdBuf.length >= 5){ E.r0 = mean; setState('ACTIVE'); E.onNeutral(E.r0); }
    }
    E.velocity = computeVelocity(now);
    status();
    return true;
  };
  return E;
})();
