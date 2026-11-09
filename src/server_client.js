// ---------- server (this site's /api; the Supabase key stays on the server) ----------
// One researcher password per browser, shared by every page of the site (same origin, same localStorage key).
// Opened as a local file there is no /api: every call fails and the page keeps working with local files only.
const PW_KEY = 'gripspread_researcher_pw_v1';
const SRV = {
  pw(){ try{ return localStorage.getItem(PW_KEY) || ''; }catch(e){ return ''; } },
  setPw(v){ try{ v ? localStorage.setItem(PW_KEY, v) : localStorage.removeItem(PW_KEY); }catch(e){} },
  online(){ return location.protocol !== 'file:'; },
  ready(){ return SRV.online() && !!SRV.pw(); },
  async call(route, body){
    if(!SRV.online()) throw new Error('파일로 연 페이지에서는 서버를 쓸 수 없습니다. 사이트 주소로 열어 주세요');
    if(!SRV.pw()) throw new Error('서버 비밀번호를 넣어 주세요');
    const r = await fetch('/api/' + route, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ ...body, password:SRV.pw() }) });
    const j = await r.json().catch(() => ({}));
    if(r.status === 401){ SRV.setPw(''); document.querySelectorAll('.srvPw').forEach(i => i.value = ''); throw new Error('서버 비밀번호가 틀렸습니다'); }
    if(!r.ok) throw new Error(`서버 ${r.status} ${j.error || ''}`.trim());
    return j;
  },
  async put(path, blob, type){
    const { url } = await SRV.call('upload-url', { path });
    const r = await fetch(url, { method:'PUT', headers:{ 'Content-Type':type, 'x-upsert':'false' }, body:blob });
    if(!r.ok){ let m = ''; try{ m = (await r.json()).message || ''; }catch(e){} throw new Error(`업로드 ${r.status} ${m}`.trim()); }
  },
  putJSON(path, obj){ return SRV.put(path, new Blob([JSON.stringify(obj, null, 2)], { type:'application/json' }), 'application/json'); },
  latest(kind){ return SRV.call('latest', { kind }); },
  stamp(){ return new Date().toISOString().replace(/[:.]/g, '-'); },
};
// every <input class="srvPw"> on the page shows and sets the shared password
document.querySelectorAll('.srvPw').forEach(i => { i.value = SRV.pw(); i.addEventListener('change', () => { SRV.setPw(i.value.trim()); document.querySelectorAll('.srvPw').forEach(o => { if(o !== i) o.value = i.value.trim(); }); }); });
