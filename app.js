import {parseLuckyCsv,nextScheduledAfter,evaluateForecast,combinationCategories,calculateForecast,SUM_CHANCE,chanceOf,PICKS,COMBO_PICK} from './engine.js';
import {renderNavigation} from './navigation.js';
import {computePositionsPick,positionsBacktest,positionMatches,positionPay} from './positions.mjs';

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
  const T=ticket();
  const pp=(current?.positionsPick&&current.targetAt===target)?current.positionsPick:computePositionsPick(facts,target);
  $('#posDice').innerHTML=diceHtml(pp.dice);
  $('#retOften').innerHTML=retLine(f.picks.often.sums.length*T,setReturn(f.picks.often.sums));
  $('#retValue').innerHTML=retLine(f.picks.value.sums.length*T,setReturn(f.picks.value.sums));
  $('#retCombo').innerHTML=retLine(T,cc*(rules?.combinationPayouts?.[COMBO_PICK.key]||0));
  $('#payOften').textContent=rub(rules?.sumPayouts?.[f.picks.often.sums[1]]);
  $('#comboNote').textContent=`4, 5 или 6 одинаковых чисел, например 6-1-6-1-6-6. Выплата ${rub(rules?.combinationPayouts?.[COMBO_PICK.key])}. Лучший возврат среди комбинаций.`;
  renderScore();
  renderLast();
  const warn=(current&&current.targetAt===target)?current.exitWarn:null;
  renderNavigation($('#navCard'),facts,warn);
  const wn=$('#warnNote');if(wn){wn.hidden=!warn?.on;wn.innerHTML=warn?.on?`⚠️ Возможен уход ${warn.side==='left'?'влево':'вправо'} — <b>${warn.sums.join(' · ')}</b>. Подробнее в навигации ниже.`:''}
}

const ticket=()=>Number(rules?.ticketPrice||550);
const setReturn=sums=>sums.reduce((a,x)=>a+(SUM_CHANCE[x]||0)*Number(rules?.sumPayouts?.[x]||0),0);
const retLine=(cost,back)=>`Ставка ${rub(cost)} → в среднем возвращается <b>${rub(back)}</b> (${Math.round(cost?back/cost*100:0)}%)`;
const diceHtml=(dice,actual)=>(dice||[]).map((v,i)=>`<span class="die${actual?(Number(actual[i])===Number(v)?' hit':' miss'):''}"><small>${i+1}</small>${v}</span>`).join('');
let btCache={len:0,rows:[]};
const posBacktest=()=>{if(btCache.len!==facts.length)btCache={len:facts.length,rows:positionsBacktest(facts,rules)};return btCache.rows};
function renderScore(){
  const pool=scoreN?facts.slice(-scoreN):facts;
  const f=calculateForecast(facts,'');
  const acc={often:[0,0],value:[0,0],combo:[0,0]};
  for(const x of pool){
    const ev=evaluateForecast(f,x,rules);
    for(const k of ['often','value','combo']){if(ev[k].hit){acc[k][0]++;acc[k][1]+=ev[k].payout}}
  }
  const n=pool.length,T=ticket();
  const row=(label,sub,a,expect,bets)=>{const cost=n*bets*T,net=a[1]-cost;
    return `<div class="score-row"><div><b>${label}</b><div class="small">${sub}</div></div><div class="score-num"><b>${a[0]}</b> из ${n}<div class="small">${pct(n?a[0]/n:0)} · ожидается ${pct(expect)}</div></div><div class="score-pay">${rub(a[1])}<div class="small">выплаты</div></div><div class="score-net small">Потрачено ${rub(cost)} · итог <b class="${net>=0?'ok':'hot'}">${net>=0?'+':'−'}${rub(Math.abs(net))}</b></div></div>`};
  $('#score').innerHTML=
    row('Чаще попадать',PICKS.often.sums.join(' · '),acc.often,chanceOf(PICKS.often.sums),PICKS.often.sums.length)+
    row('Выгоднее',PICKS.value.sums.join(' · '),acc.value,chanceOf(PICKS.value.sums),PICKS.value.sums.length)+
    row('Комбинация',COMBO_PICK.label,acc.combo,comboChance(rules)[COMBO_PICK.key]||0,1)+posRow();
}

function posRow(){
  const all=posBacktest();const rows=scoreN?all.slice(-scoreN):all;const n=rows.length,T=ticket();
  const h2=rows.filter(r=>r.matches>=2).length,h3=rows.filter(r=>r.matches>=3).length,pay=rows.reduce((a,r)=>a+r.payout,0),cost=n*T,net=pay-cost;
  return `<div class="score-row"><div><b>🎲 Позиции</b><div class="small">кубики по ходам</div></div><div class="score-num"><b>${h2}</b> из ${n}<div class="small">2+ совпадения ${pct(n?h2/n:0)} · ожидается 26,3% · 3+: ${h3}</div></div><div class="score-pay">${rub(pay)}<div class="small">выплаты</div></div><div class="score-net small">Потрачено ${rub(cost)} · итог <b class="${net>=0?'ok':'hot'}">${net>=0?'+':'−'}${rub(Math.abs(net))}</b>${scoreN?'':' · с 01.08'}</div></div>`;
}
function renderLast(){
  const f=calculateForecast(facts,'');
  $('#lastRows').innerHTML=facts.slice(-12).reverse().map(x=>{
    const ev=evaluateForecast(f,x,rules);
    return `<div class="last-row"><span>${Number(x.number)}<small>${x.at.slice(11,16)}</small></span><span class="mini-balls">${x.combo.join('\u2009')}</span><span class="last-sum">${x.sum}</span><span>${mark(ev.often.hit)}</span><span>${mark(ev.value.hit)}</span><span>${mark(ev.combo.hit)}</span></div>`;
  }).join('');
}

async function renderResults(){
  const host=$('#resultsList');
  try{
    if(!historyCache) historyCache=await fetch('./data/forecast-history.json?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():[]);
  }catch{historyCache=[]}
  const items=[...historyCache].sort((a,b)=>String(b.targetAt).localeCompare(String(a.targetAt))).slice(0,60);
  if(!items.length){host.innerHTML='<div class="card small">Пока нет зафиксированных прогнозов.</div>';return}
  const numByAt=new Map(facts.map(x=>[x.at,Number(x.number)]));
  host.innerHTML=items.map(e=>{
    const fc=e.forecast||{};
    const actual=e.actual;
    const ev=actual?evaluateForecast(fc,actual,rules):null;
    const isNew=Boolean(fc.picks);
    const no=numByAt.get(e.targetAt);
    let status='<span class="wait">⏳ ждём</span>';
    if(ev){
      const hits=isNew?[ev.often.hit,ev.value.hit,ev.combo.hit].filter(Boolean).length:(ev.often.hit?1:0);
      status=hits?`<span class="ok res-badge">✓ ${isNew?'попал '+hits+' из 3':'попал'}</span>`:'<span class="no res-badge">мимо</span>';
    }
    const head=`<div class="res-head"><div><b>${fmtAt(e.targetAt)}</b>${no?`<small> №${no}</small>`:''}</div><div class="res-right">${fc.exitWarn?.on?'<span class="res-warn" title="Был сигнал ухода">⚠️</span>':''}${actual?`<span class="res-fact">Σ ${actual.sum}</span>`:''}${status}<span class="chev">▾</span></div></div>`;
    const cats=ev?.combinationCategories||[];
    const w=fc.exitWarn;let warnLine='';
    if(w?.on){const side=w.side==='left'?'влево':'вправо';const sums=(w.sums||[]).join('·');
      if(!actual) warnLine=`<div class="res-line warn-line"><span>⚠️ Уход</span><span>${side} ${sums}</span><span class="wait">ждём</span></div>`;
      else{const hit=(w.sums||[]).includes(actual.sum),out=!(actual.sum>=19&&actual.sum<=23);
        warnLine=`<div class="res-line warn-line"><span>⚠️ Уход</span><span>${side} ${sums}</span><span>${hit?`<b class="ok">выпало ${actual.sum} ✓</b>`:`<span class="no">выпало ${actual.sum} ✗ · ${out?(actual.sum<19?'ушёл влево':'ушёл вправо'):'остался в центре'}</span>`}</span></div>`}}
    const extra=actual?`<div class="res-extra">
        <div>Выплата за сумму Σ ${actual.sum}: <b>${rub(ev.sumPayout)}</b> · шанс ${pct(SUM_CHANCE[actual.sum]||0)}</div>
        <div>Комбинация тиража: ${cats.length?cats.map(c=>`<b>${esc(c.label)}</b> (${rub(c.payout)})`).join(', '):'<span class="no">ни одна категория не выпала</span>'}</div>
        ${fc.fixedAt?`<div class="small">Прогноз зафиксирован ${new Date(fc.fixedAt).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'})}</div>`:''}
      </div>`:`<div class="res-extra small">Тираж ещё не прошёл — результат появится сразу после него.</div>`;
    const lines=isNew
      ?`<div class="res-line"><span>Чаще</span><span>${sumChips(fc.picks.often.sums,actual?.sum)}</span><span>${ev?(ev.often.hit?'<b class="ok">попал · '+rub(ev.often.payout)+'</b>':'<span class="no">мимо</span>'):''}</span></div>
         <div class="res-line"><span>Выгоднее</span><span>${sumChips(fc.picks.value.sums,actual?.sum)}</span><span>${ev?(ev.value.hit?'<b class="ok">попал · '+rub(ev.value.payout)+'</b>':'<span class="no">мимо</span>'):''}</span></div>
         <div class="res-line"><span>Комб.</span><span class="small">${esc(fc.comboPick?.label||'')}</span><span>${ev?(ev.combo.hit?'<b class="ok">попал · '+rub(ev.combo.payout)+'</b>':'<span class="no">мимо</span>'):''}</span></div>`
      :`<div class="res-line"><span>Старый движок</span><span>${sumChips(ev?.often.sums||fc.final||[],actual?.sum)}</span><span>${ev?(ev.often.hit?'<b class="ok">попал</b>':'<span class="no">мимо</span>'):''}</span></div>`;
    const pk=fc.positionsPick;let posLine='';
    if(pk?.dice){const pm=actual?positionMatches(pk.dice,actual.combo):null,pay=pm!=null?positionPay(pm,rules):0;
      posLine=`<div class="res-line pos-line"><span>🎲 Поз.</span><span class="dice-row sm">${diceHtml(pk.dice,actual?.combo)}</span><span>${pm==null?'':pm>=2?`<b class="ok">${pm} совп · ${rub(pay)}</b>`:`<span class="no">${pm} совп</span>`}</span></div>`}
    const open=openResults.has(e.targetAt);
    return `<div class="card res${open?' open':''}" data-at="${esc(e.targetAt)}">${head}<div class="res-body">${actual?`<div class="balls">${ballsHtml(actual.combo)}</div>`:''}${lines}${posLine}${warnLine}${extra}</div></div>`;
  }).join('');
}
const openResults=new Set();
$('#resultsList').addEventListener('click',e=>{
  const card=e.target.closest('.res');if(!card) return;
  const at=card.dataset.at;
  if(card.classList.toggle('open')) openResults.add(at); else openResults.delete(at);
});

function renderRules(){
  const sh=rules.sharedPrize||{},mk=on=>on?'²':'';
  const sums=Object.keys(rules.sumPayouts||{}).map(Number).sort((a,b)=>a-b);
  const best=new Set([...PICKS.often.sums,...PICKS.value.sums]);
  $('#sumRules').innerHTML=sums.map(s=>`<tr class="${best.has(s)?'pick-row':''}"><td>${s}</td><td>${pct(SUM_CHANCE[s]||0)}</td><td>${rub(rules.sumPayouts[s])}${mk((sh.sums||[]).includes(s))}</td></tr>`).join('');
  const labels={ALL_1:'Все единицы',ALL_2:'Все двойки',ALL_3:'Все тройки',ALL_4:'Все четвёрки',ALL_5:'Все пятёрки',ALL_6:'Все шестёрки',SIX_SAME:'Шесть одинаковых',FIVE_SAME:'Пять одинаковых',THREE_NUMBERS_X2:'3 числа × 2 (5 1 1 5 5 1)',ALL_SIX_NUMBERS:'Все шесть чисел',ONLY_EVEN:'Только чётные',ONLY_ODD:'Только нечётные',ONLY_1_2_3:'Только 1, 2, 3',ONLY_4_5_6:'Только 4, 5, 6',TWO_NUMBERS_X3:'2 числа × 3 (4 4 6 2 6 2)',FOUR_SAME:'Четыре одинаковых (4, 5 или 6)'};
  const ch=comboChance(rules);
  $('#comboRules').innerHTML=Object.entries(rules.combinationPayouts||{}).sort((a,b)=>b[1]*(ch[b[0]]||0)-a[1]*(ch[a[0]]||0)).map(([k,p])=>`<tr class="${k===COMBO_PICK.key?'pick-row':''}"><td>${labels[k]||k}</td><td>${pct(ch[k]||0)}</td><td>${rub(p)}${mk((sh.combinations||[]).includes(k))}</td></tr>`).join('');
  $('#positionRules').innerHTML=Object.entries(rules.positionPayouts||{}).sort((a,b)=>Number(b[0])-Number(a[0])).map(([k,p])=>`<tr><td>${k}</td><td>${pct(posChance(Number(k)))}</td><td>${rub(p)}${mk((sh.positions||[]).includes(Number(k)))}</td></tr>`).join('');
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
