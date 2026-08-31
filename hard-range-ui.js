
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const list=a=>Array.isArray(a)&&a.length?a.join(' / '):'—';

function familyRows(f){
  const names=['GLOBAL','TIME','TRANS','DELTA','JUMP','PAIR','D2','STATE'];
  return names.map(n=>{
    const p=f?.[n]||{};
    const meta=[];
    if(Number.isFinite(p.sample)) meta.push('N='+p.sample);
    if(n==='DELTA'&&Number.isFinite(p.delta)) meta.push('Δ='+(p.delta>=0?'+':'')+p.delta);
    if(n==='JUMP'&&p.jumpClass) meta.push(p.jumpClass);
    if(n==='TIME'&&p.targetTime) meta.push(p.targetTime);
    return `<div class="method"><b>${n}</b> → <b class="hot">${esc(list(p.candidates))}</b><div class="small">${esc(meta.join(' · '))}</div></div>`;
  }).join('');
}

async function renderHardRange(){
  const host=$('#hardRangeDetails');
  if(!host) return;
  let f=null;
  try{
    const r=await fetch('./data/current-forecast.json?v='+Date.now(),{cache:'no-store'});
    if(r.ok) f=await r.json();
  }catch{}
  if(!f?.modelVersion?.startsWith('HARD-RANGE-JUMP-TRACK')) {
    host.innerHTML=`<div class="card notice"><div class="ico">🔒</div><div>Текущий frozen был создан старым движком и сохранён без переписывания. HARD RANGE включится со следующего нового frozen.</div></div>`;
    return;
  }

  const j=f.jumpTrack||{};
  const repl=(f.rangeReplacement||[]).map(x=>
    `${x.type}: ${x.from}→${x.to} (${(x.blocks||[]).join(' + ')})`
  ).join('<br>')||'замены не требовались';

  host.innerHTML=`
    <div class="card">
      <div class="sec-title">HARD RANGE · FULL 6–36</div>
      <div class="audit-row"><b>Selector</b><span>${esc(f.selector)}</span></div>
      <div class="audit-row"><b>Weighted base</b><span>${esc(list(f.weightedBase))}</span></div>
      <div class="audit-row"><b>Final frozen</b><span class="hot"><b>${esc(list(f.final))}</b></span></div>
      <div class="small" style="margin-top:10px">${repl}</div>
    </div>
    <div class="card">
      <div class="sec-title">FAMILY</div>
      ${familyRows(f.families)}
    </div>
    <div class="card">
      <div class="sec-title">JUMP-TRACK</div>
      <div class="audit-row"><b>Δ</b><span>${esc(Number.isFinite(j.delta)?(j.delta>=0?'+':'')+j.delta:'—')}</span></div>
      <div class="audit-row"><b>|Δ|</b><span>${esc(j.absDelta??'—')}</span></div>
      <div class="audit-row"><b>State</b><span>${esc(j.jumpState??'—')}</span></div>
      <div class="audit-row"><b>Разворот / продолжение</b><span>${esc(j.relation??'—')}</span></div>
      <div class="audit-row"><b>D2</b><span>${esc(list(j.d2))}</span></div>
      <div class="small">exact Δ: N=${esc(j.exact?.n??0)} · лидеры ${esc(list(j.exact?.leaders))}</div>
      <div class="small">|Δ|: N=${esc(j.abs?.n??0)} · лидеры ${esc(list(j.abs?.leaders))}</div>
    </div>
    <div class="card">
      <div class="sec-title">Strict RAW</div>
      <div class="audit-row"><b>V1</b><span>${esc(list(f.strictRaw?.v1))}</span></div>
      <div class="audit-row"><b>V2</b><span>${esc(list(f.strictRaw?.v2))}</span></div>
      <div class="audit-row"><b>V3</b><span>${esc(list(f.strictRaw?.v3))}</span></div>
    </div>`;
}

renderHardRange();
