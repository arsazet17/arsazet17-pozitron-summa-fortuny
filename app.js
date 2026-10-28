import {parseLuckyCsv,nextScheduledAfter,evaluateForecast,combinationCategories,calculateForecast,SUM_CHANCE,chanceOf,PICKS,COMBO_PICK} from './engine.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const nf=new Intl.NumberFormat('ru-RU');
const rub=n=>nf.format(Math.round(n||0))+' ₽';
const pct=x=>(x>0&&x<0.001)?'1 из '+nf.format(Math.round(1/x)):(x*100).toFixed(1).replace('.',',')+'%';
const fmtAt=at=>{if(!at) return '—';const [d,t]=at.split('T');const [y,m,dd]=d.split('-');return `${dd}.${m}.${y.slice(2)} ${t}`};
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

let facts=[],rules={},current=null,scoreN=96,historyCache=null,lastKey='';

// Шанс категорий комбинации и позиций — точный перебор 6^6 исходов.
const comboChance=(()=>{let out=null;return r=>{
  if(out) return out;out={};let t=0;const c=[0,0,0,0,0,0];
  const rec=i=>{if(i===6){t++;for(const k of combinationCategories(c,r)) out[k.key]=(out[k.key]||0)+1;return}for(let v=1;v<=6;v++){c[i]=v;rec(i+1)}};
  rec(0);for(const k in out) out[k]/=t;return out;
}})();
const posChance=k=>{const C=(n,r)=>{let x=1;for(let i=0;i<r;i++)x=x*(n-i)/(i+1);return x};return C(6,k)*Math.pow(1/6,k)*Math.pow(5/6,6-k)};

async function load(){
  const bust='?v='+Date.now();
  const [csv,rr,cur]=await Promise.all([
    fetch('./data/fortune-archive.csv'+bust,{cache:'no-store'}).then(r=>{if(!r.ok) throw new Error('archive HTTP '+r.status);return r.text()}),
    fetch('./data/rules.json'+bust,{cache:'no-store'}).then(r=>r.json()),
    fetch('./data/current-forecast.json'+bust,{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)
  ]);
  return {facts:parseLuckyCsv(csv),rules:rr,current:cur};
}

const ballsHtml=combo=>(combo||[]).map(x=>`<span class="ball">${x}</span>`).join('');
const sumChips=(sums,actual)=>sums.map(s=>`<span class="sum-chip${s===actual?' on':''}">${s}</span>`).join('');
const mark=hit=>hit?'<span class="ok">✓</span>':'<span class="no">·</span>';

function renderHome(){
  const last=facts.at(-1);
  const target=nextScheduledAfter(last.at);
  const nextNo=/^\d+$/.test(last.number)?String(Number(last.number)+1):'';
  $('#lastDraw').textContent=`№${Number(last.number)} · ${fmtAt(last.at)}`;
  $('#lastBalls').innerHTML=ballsHtml(last.combo)+`<span class="ball-sum">Σ ${last.sum}</span>`;
  $('#nextDraw').textContent=`№${nextNo} · ${fmtAt(target)}`;
  const fixed=current&&current.targetAt===target&&current.fixedAt&&current.picks;
  $('#fixedNote').textContent=fixed?`🔒 Ставка зафиксирована ${new Date(current.fixedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'})}`:'⏳ Ставка зафиксируется перед тиражом';
  $('#betTarget').textContent=`№${nextNo} · ${target.slice(11,16)}`;
  const f=(current?.picks&&current.targetAt===target)?current:calculateForecast(facts,target);
  $('#sumsOften').innerHTML=sumChips(f.picks.often.sums);
  $('#sumsValue').innerHTML=sumChips(f.picks.value.sums);
  $('#chOften').textContent='шанс '+pct(chanceOf(f.picks.often.sums));
  $('#chValue').textContent='шанс '+pct(chanceOf(f.picks.value.sums));
  const cc=comboChance(rules)[COMBO_PICK.key]||0;
  $('#comboPick').textContent=COMBO_PICK.label;
  $('#chCombo').textContent='шанс '+pct(cc);
  $('#comboNote').textContent=`Например 2-2-5-5-6-6. Выплата ${rub(rules?.combinationPayouts?.[COMBO_PICK.key])} — самая выгодная категория, в 3 раза выгоднее любой другой.`;
  renderScore();
  renderLast();
}

function renderScore(){
  const pool=scoreN?facts.slice(-scoreN):facts;
  const f=calculateForecast(facts,'');
  const acc={often:[0,0],value:[0,0],combo:[0,0]};
  for(const x of pool){
    const ev=evaluateForecast(f,x,rules);
    for(const k of ['often','value','combo']){if(ev[k].hit){acc[k][0]++;acc[k][1]+=ev[k].payout}}
  }
  const n=pool.length;
  const row=(label,sub,a,expect)=>`<div class="score-row"><div><b>${label}</b><div class="small">${sub}</div></div><div class="score-num"><b>${a[0]}</b> из ${n}<div class="small">${pct(n?a[0]/n:0)} · ожидается ${pct(expect)}</div></div><div class="score-pay">${rub(a[1])}<div class="small">выплаты</div></div></div>`;
  $('#score').innerHTML=
    row('Чаще попадать',PICKS.often.sums.join(' · '),acc.often,chanceOf(PICKS.often.sums))+
    row('Выгоднее',PICKS.value.sums.join(' · '),acc.value,chanceOf(PICKS.value.sums))+
    row('Комбинация',COMBO_PICK.label,acc.combo,comboChance(rules)[COMBO_PICK.key]||0);
}

function renderLast(){
  const f=calculateForecast(facts,'');
  $('#lastRows').innerHTML=facts.slice(-12).reverse().map(x=>{
    const ev=evaluateForecast(f,x,rules);
    return `<div class="last-row"><span>${Number(x.number)}<small>${x.at.slice(11,16)}</small></span><span class="mini-balls">${x.combo.join(' ')}</span><span class="last-sum">${x.sum}</span><span>${mark(ev.often.hit)}</span><span>${mark(ev.value.hit)}</span><span>${mark(ev.combo.hit)}</span></div>`;
  }).join('');
}

async function renderResults(){
  const host=$('#resultsList');
  try{
    if(!historyCache) historyCache=await fetch('./data/forecast-history.json?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():[]);
  }catch{historyCache=[]}
  const items=[...historyCache].sort((a,b)=>String(b.targetAt).localeCompare(String(a.targetAt))).slice(0,60);
  if(!items.length){host.innerHTML='<div class="card small">Пока нет зафиксированных прогнозов.</div>';return}
  host.innerHTML=items.map(e=>{
    const fc=e.forecast||{};
    const actual=e.actual;
    const ev=actual?evaluateForecast(fc,actual,rules):null;
    const isNew=Boolean(fc.picks);
    const head=`<div class="res-head"><b>${fmtAt(e.targetAt)}</b>${actual?`<span class="res-fact">Σ ${actual.sum}</span>`:'<span class="wait">⏳ ждём тираж</span>'}</div>`;
    const lines=isNew
      ?`<div class="res-line"><span>Чаще</span><span>${sumChips(fc.picks.often.sums,actual?.sum)}</span><span>${ev?(ev.often.hit?'<b class="ok">попал · '+rub(ev.often.payout)+'</b>':'<span class="no">мимо</span>'):''}</span></div>
         <div class="res-line"><span>Выгоднее</span><span>${sumChips(fc.picks.value.sums,actual?.sum)}</span><span>${ev?(ev.value.hit?'<b class="ok">попал · '+rub(ev.value.payout)+'</b>':'<span class="no">мимо</span>'):''}</span></div>
         <div class="res-line"><span>Комб.</span><span class="small">${esc(fc.comboPick?.label||'')}</span><span>${ev?(ev.combo.hit?'<b class="ok">попал · '+rub(ev.combo.payout)+'</b>':'<span class="no">мимо</span>'):''}</span></div>`
      :`<div class="res-line"><span>Старый движок</span><span>${sumChips(ev?.often.sums||fc.final||[],actual?.sum)}</span><span>${ev?(ev.often.hit?'<b class="ok">попал</b>':'<span class="no">мимо</span>'):''}</span></div>`;
    return `<div class="card res">${head}${actual?`<div class="balls">${ballsHtml(actual.combo)}</div>`:''}${lines}</div>`;
  }).join('');
}

function renderRules(){
  const sums=Object.keys(rules.sumPayouts||{}).map(Number).sort((a,b)=>a-b);
  const best=new Set([...PICKS.often.sums,...PICKS.value.sums]);
  $('#sumRules').innerHTML=sums.map(s=>`<tr class="${best.has(s)?'pick-row':''}"><td>${s}</td><td>${pct(SUM_CHANCE[s]||0)}</td><td>${rub(rules.sumPayouts[s])}</td></tr>`).join('');
  const labels={ALL_1:'Все единицы',ALL_2:'Все двойки',ALL_3:'Все тройки',ALL_4:'Все четвёрки',ALL_5:'Все пятёрки',ALL_6:'Все шестёрки',SIX_SAME:'Шесть одинаковых',FIVE_SAME:'Пять одинаковых',THREE_NUMBERS_X2:'3 числа × 2 раза',ALL_SIX_NUMBERS:'Все шесть чисел',ONLY_EVEN:'Только чётные',ONLY_ODD:'Только нечётные',ONLY_1_2_3:'Только 1, 2, 3',ONLY_4_5_6:'Только 4, 5, 6',TWO_NUMBERS_X3:'2 числа × 3 раза',FOUR_SAME:'Четыре одинаковых'};
  const ch=comboChance(rules);
  $('#comboRules').innerHTML=Object.entries(rules.combinationPayouts||{}).sort((a,b)=>b[1]*(ch[b[0]]||0)-a[1]*(ch[a[0]]||0)).map(([k,p])=>`<tr class="${k===COMBO_PICK.key?'pick-row':''}"><td>${labels[k]||k}</td><td>${pct(ch[k]||0)}</td><td>${rub(p)}</td></tr>`).join('');
  $('#positionRules').innerHTML=Object.entries(rules.positionPayouts||{}).sort((a,b)=>Number(b[0])-Number(a[0])).map(([k,p])=>`<tr><td>${k}</td><td>${pct(posChance(Number(k)))}</td><td>${rub(p)}</td></tr>`).join('');
}

function renderArchive(){
  $('#archiveInfo').textContent=`Всего ${nf.format(facts.length)} тиражей`;
  $('#archiveRows').innerHTML=facts.slice(-50).reverse().map(x=>`<tr><td>${Number(x.number)}</td><td>${fmtAt(x.at)}</td><td>${x.combo.join('-')}</td><td>${x.sum}</td></tr>`).join('');
}

function switchPage(id){
  $$('.page').forEach(p=>p.classList.toggle('active',p.id===id));
  $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===id));
  if(id==='results') renderResults();
  window.scrollTo({top:0});
}
$$('.nav button').forEach(b=>b.addEventListener('click',()=>switchPage(b.dataset.page)));
$('#scoreSeg').addEventListener('click',e=>{
  const b=e.target.closest('button[data-n]');if(!b) return;
  scoreN=Number(b.dataset.n);
  $$('#scoreSeg button').forEach(x=>x.classList.toggle('on',x===b));
  renderScore();
});

async function sync(first=false){
  try{
    const d=await load();
    const key=(d.facts.at(-1)?.at||'')+'|'+(d.current?.fixedAt||'');
    facts=d.facts;rules=d.rules;current=d.current;
    if(key===lastKey&&!first) return;
    lastKey=key;historyCache=null;
    renderHome();renderRules();renderArchive();
    if($('#results').classList.contains('active')) renderResults();
  }catch(err){
    console.error(err);
    if(first) document.querySelector('main').innerHTML=`<div class="card"><b>Не удалось загрузить данные</b><div class="small">${esc(err.message)}</div></div>`;
  }
}
sync(true);
setInterval(()=>sync(),60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden) sync()});
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
