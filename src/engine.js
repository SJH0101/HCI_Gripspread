// GripSpread engine: webcam hand landmarks -> V spread angle (deg) -> IDLE/HOLD/ACTIVE state -> scroll velocity.
// No DOM besides the <video>. The host page renders status through the callbacks.
const GripEngine = (() => {
  // ---------- tunable parameters (pilot values) ----------
  const P = { dead:0.15, gain:800, gamma:2.2, holdMs:700, smooth:0.35, curlMax:80,
    boostMax:2.5, boostMs:1200, boostOn:0.6, boostDecayMs:200, accMs:250, brakeMs:60, minSide:10 };
  const FOLD_PERSIST = 6; // frames (~0.1 s) a 'folded' reading must last before input freezes
  const EXT_MIN = 0.55;    // in-plane knuckle->tip length / palm length below this = fingers folded
  const JUMP_MAX = 20;     // deg per frame; bigger jumps are dropped unless they persist 3 frames
  const FACING_MIN = 0.35; // |palm normal . camera axis| below this = palm seen edge-on
  const HOLD_SD = 2.5;     // deg; neutral capture restarts when the spread moves more than this
  const CALIB_MS = 1500, COUNT_MS = 3000;
  const RANGE_KEY = 'gripspread_range_deg_v1';

  const E = {
    P, dirSign:-1, state:'IDLE', r0:null, range:null, theta:null, reliable:false, reason:null,
    feat:null, lm:null, world:null, velocity:0, holdProgress:0, calibStep:null, fps:0,
    onStatus:()=>{}, onBeep:()=>{}, onState:()=>{},
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
  // Visible V angle: from the midpoint of knuckles 5 and 9, the angle between fingertips 8 and 12,
  // measured inside the palm plane (0,5,17) so finger flexion is projected out. Tips touching -> 0 deg.
  function spreadAngle(world){
    const n0 = cross(sub(world[5], world[0]), sub(world[17], world[0])), nl = norm(n0);
    if(nl < 1e-9) return null;
    const n = {x:n0.x/nl, y:n0.y/nl, z:n0.z/nl};
    const proj = v => { const k = dot(v, n); return {x:v.x-k*n.x, y:v.y-k*n.y, z:v.z-k*n.z}; };
    const m = {x:(world[5].x+world[9].x)/2, y:(world[5].y+world[9].y)/2, z:(world[5].z+world[9].z)/2};
    const a = proj(sub(world[8], m)), b = proj(sub(world[12], m)), la = norm(a), lb = norm(b);
    const palmLen = norm(sub(world[9], world[0]));
    const deg = Math.acos(Math.max(-1, Math.min(1, dot(a,b)/(la*lb+1e-12)))) * 180 / Math.PI;
    return { deg, facing:Math.abs(n.z), extI:la/palmLen, extM:lb/palmLen };
  }

  // ---------- state machine ----------
  const STATE_TEXT = { IDLE:'컵을 쥔 손을 카메라 앞에 올려줘', HOLD:'편한 V로 잠깐 멈춰', ACTIVE:'켜짐' };
  const WARN_TEXT = { facing:'손등을 카메라 쪽으로 돌려줘 (입력 멈춤)', folded:'손가락 접힘 (입력 멈춤)', lost:'손 인식이 불안정해 (입력 멈춤)' };
  let holdStart = 0, holdBuf = [], lastSeen = 0, needHandDown = false, jumpCount = 0, foldFrames = 0;
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
    E.onState(s);
  }
  E.resetNeutral = () => setState('IDLE');

  // ---------- hand range calibration (max open -> max close) ----------
  const STEP_TEXT = { max:'① 최대로 벌려', min:'② 최대로 오므려' };
  let calib = null;
  const pct = (arr, q) => { const a = [...arr].sort((x,y)=>x-y); return a[Math.min(a.length-1, Math.max(0, Math.round(q*(a.length-1))))]; };
  function startStep(step, got){ calib = { step, phase:'wait', start:0, lastTick:0, buf:[], got }; E.calibStep = step;
    E.onStatus(STEP_TEXT[step] + '. 손을 올리면 카운트다운 시작', 'hold', 0); }
  E.startRange = () => { setState('IDLE'); startStep('max', {}); };
  function calibTick(now, v){
    if(v == null){ if(calib.phase !== 'wait'){ calib.phase = 'wait'; calib.buf = []; E.onStatus(STEP_TEXT[calib.step] + '. 손이 안 보여, 다시 올려줘', 'hold', 0); } return; }
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
    E.onStatus(STEP_TEXT[calib.step] + '. 측정 중, 그대로 유지', 'hold', prog);
    if(prog < 1) return;
    if(calib.step === 'max'){ E.onBeep(660, 0.1); startStep('min', { max: pct(calib.buf, 0.9) }); return; }
    const got = { ...calib.got, min: pct(calib.buf, 0.1) };
    if(got.max - got.min > 8){
      E.range = { min:got.min, max:got.max };
      try{ localStorage.setItem(RANGE_KEY, JSON.stringify(E.range)); }catch(e){}
      E.onBeep(990, 0.15); calib = null; E.calibStep = null; needHandDown = true; setState('IDLE');
      E.onStatus('손 범위 저장됨. 손을 내렸다가 편한 V로 다시 올려줘', 'idle', 0);
    } else { E.onBeep(220, 0.25); startStep('max', {}); E.onStatus('손 범위가 너무 좁게 나왔어. 다시 ' + STEP_TEXT.max, 'hold', 0); }
  }

  // ---------- mapping ----------
  // Normalized deviation e in [-1, 1]: opening side divided by (max - r0), closing side by (r0 - min).
  function normDev(v){
    const e = v - E.r0;
    if(!E.range) return Math.max(-1, Math.min(1, e / 15));
    const den = e >= 0 ? Math.max(P.minSide, E.range.max - E.r0) : Math.max(P.minSide, E.r0 - E.range.min);
    return Math.max(-1, Math.min(1, e / den));
  }
  E.deadBand = () => {
    if(E.r0 == null) return null;
    if(!E.range) return [E.r0 - P.dead*15, E.r0 + P.dead*15];
    return [E.r0 - P.dead*Math.max(P.minSide, E.r0 - E.range.min), E.r0 + P.dead*Math.max(P.minSide, E.range.max - E.r0)];
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
      const mag = Math.max(0, Math.abs(e) - P.dead) / Math.max(0.01, 1 - P.dead);
      const dir = mag > 0 ? Math.sign(e) * E.dirSign : 0;
      if(dir !== holdDir){ holdDir = dir; B = 1; }
      if(dir && mag >= P.boostOn) B = Math.min(P.boostMax, B + (P.boostMax - 1) * dtMs / P.boostMs);
      else B = 1 + (B - 1) * Math.exp(-dtMs / P.boostDecayMs);
      cmd = dir * P.gain * Math.pow(mag, P.gamma) * B;
      // keep the calibrated range honest: angles beyond it widen it
      if(E.range){ if(E.theta > E.range.max) E.range.max = E.theta; if(E.theta < E.range.min) E.range.min = E.theta; }
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
    const fileset = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
    const opts = d => ({ baseOptions:{ modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", delegate:d },
      runningMode:"VIDEO", numHands:1, minHandDetectionConfidence:0.5, minHandPresenceConfidence:0.5, minTrackingConfidence:0.5 });
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
      const folded = m && (Math.min(m.extI, m.extM) < EXT_MIN || Math.max(E.feat.curlI, E.feat.curlM) > P.curlMax);
      foldFrames = folded ? foldFrames + 1 : 0;
      E.reason = !m ? 'lost' : m.facing < FACING_MIN ? 'facing' : foldFrames >= FOLD_PERSIST ? 'folded' : null;
      E.reliable = !E.reason;
      if(E.reliable && !folded){   // brief folded readings keep the last angle instead of feeding noise
        if(E.theta != null && Math.abs(m.deg - E.theta) > JUMP_MAX && ++jumpCount < 3){ /* drop spike */ }
        else { jumpCount = 0; E.theta = E.theta == null ? m.deg : E.theta + P.smooth * (m.deg - E.theta); }
      }
    } else { E.reliable = false; E.reason = null; E.feat = null; }

    if(E.calibStep){
      if(!lm) calibTick(now, null); else if(E.reliable) calibTick(now, E.theta);
    } else if(!lm){
      if(now - lastSeen > 500){ setState('IDLE'); E.theta = null; needHandDown = false; }
    } else if(E.state === 'IDLE' && !needHandDown){
      setState('HOLD');
    } else if(E.state === 'HOLD' && E.theta != null && E.reliable){
      holdBuf.push(E.theta);
      const mean = holdBuf.reduce((a,b)=>a+b,0)/holdBuf.length;
      const sd = Math.sqrt(holdBuf.reduce((a,b)=>a+(b-mean)**2,0)/holdBuf.length);
      if(sd > HOLD_SD){ holdBuf = []; holdStart = now; }
      E.holdProgress = Math.min(1, (now - holdStart) / P.holdMs);
      if(E.holdProgress >= 1 && holdBuf.length >= 5){ E.r0 = mean; setState('ACTIVE'); }
    }
    E.velocity = computeVelocity(now);
    status();
    return true;
  };
  return E;
})();
