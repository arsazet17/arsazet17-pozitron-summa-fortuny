import {parseLuckyCsv,evaluateForecast,combinationCategories} from './engine.js';

const $=s=>document.querySelector(s);

const fmtAt=at=>{
  if(!at) return '—';
  const [d,t]=at.split('T');
  const [y,m,dd]=d.split('-');
  return `${dd}.${m}.${y} ${t}`;
};
const fmtDate=at=>fmtAt(at).slice(0,10);
const fmtTime=at=>at?.slice(11,16)||'—';
const picks=a=>Array.isArray(a)&&a.length?a.join(' / '):'—';
const rub=n=>Number(n)>0?new Intl.NumberFormat('ru-RU').format(Number(n))+' ₽':'—';

let cache=null;
let lastRenderKey='';

async function loadData(){
  const bust='?v='+Date.now();
  const [hist,csv,rules,current]=await Promise.all([
    fetch('./data/forecast-history.json'+bust,{cache:'no-store'}).then(r=>r.ok?r.json():[]).catch(()=>[]),
    fetch('./data/fortune-archive.csv'+bust,{cache:'no-store'}).then(r=>r.text()),
    fetch('./data/rules.json'+bust,{cache:'no-store'}).then(r=>r.json()),
    fetch('./data/current-forecast.json'+bust,{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)
  ]);
  return {history:Array.isArray(hist)?hist:[],facts:parseLuckyCsv(csv),rules,current};
}

function combinationDirectionPayout(f,actual,rules){
  if(!f?.combo?.complete || !Array.isArray(f.combo.combo)) return 0;
  const predicted=combinationCategories(f.combo.combo,rules);
  const actualCats=combinationCategories(actual.combo,rules);
  const actualKeys=new Set(actualCats.map(c=>c.key));
  return predicted.filter(c=>actualKeys.has(c.key)).reduce((sum,c)=>sum+(Number(c.payout)||0),0);
}

function drawNumberFor(entry,facts){
  if(entry?.actual?.number) return String(Number(entry.actual.number));
  const before=[...(facts||[])].filter(x=>x.at<entry.targetAt).sort((a,b)=>a.at.localeCompare(b.at)).at(-1);
  if(before?.number && /^\d+$/.test(String(before.number))) return String(Number(before.number)+1);
  return '—';
}

function resultText(mainHit,total){
  if(mainHit) return {label:'ПОПАЛИ В СУММУ!',cls:'rh-win'};
  if(total>0) return {label:'ЕСТЬ ВЫИГРЫШ!',cls:'rh-win'};
  return {label:'МИМО',cls:'rh-loss'};
}

function ballsHtml(combo){
  return (combo||[]).map(x=>`<span class="rh-ball">${x}</span>`).join('');
}

function makeItem(entry,rules,facts,idx){
  const f=entry.forecast||{};
  const checked=Boolean(entry.checked && entry.actual);
  let ev=null;
  if(checked){ try{ ev=evaluateForecast(f,entry.actual,rules); }catch{} }

  const mainHit=Boolean(ev&&(ev.v1Hit||ev.v2Hit||ev.v3Hit));
  const comboText=f.combo?.complete?`${f.combo.combo.join('-')} = Σ${f.combo.sum}`:'НЕТ ПОЛНОГО ПРОГНОЗА';
  const fixedTime=entry.fixedAt?new Date(entry.fixedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}):'—';
  const drawNo=drawNumberFor(entry,facts);

  let stateBlock='';
  if(!checked){
    stateBlock=`
      <div class="rh-state-wait">
        <span class="rh-section-label">СОСТОЯНИЕ</span>
        <b>⏳ Ожидается тираж</b>
        <div class="rh-fixed">🔒 Прогноз зафиксирован: ${fixedTime}</div>
      </div>`;
  }else if(ev){
    const sumPay=mainHit?Number(ev.sumPayout||0):0;
    const comboPay=combinationDirectionPayout(f,entry.actual,rules);
    const posPay=Number(ev.positionPayout)||0;
    const total=sumPay+comboPay+posPay;
    const result=resultText(mainHit,total);
    stateBlock=`
      <div class="rh-fact-block">
        <span class="rh-section-label">ФАКТ</span>
        <div class="rh-balls">${ballsHtml(entry.actual.combo)}</div>
        <div class="rh-fact-sum">Сумма: <b>Σ${entry.actual.sum}</b></div>
      </div>
      <div class="rh-result-card ${result.cls}">
        <div class="rh-result-title">🏆 РЕЗУЛЬТАТ</div>
        <div class="rh-result-label">${result.label}</div>
        <div class="rh-result-money"><span>Выигрыш</span><b>${rub(total)}</b></div>
      </div>`;
  }

  const status=checked
    ? `<span class="rh-status ${mainHit?'rh-hit':'rh-miss'}">${mainHit?'✅ Попали':'❌ Основной мимо'}</span>`
    : '<span class="rh-status rh-wait">⏳ Ожидается</span>';

  return `
    <details class="rh-item" ${idx===0?'open':''}>
      <summary>
        <div class="rh-summary-left"><b>${fmtAt(entry.targetAt)}</b><span>${checked?`Σ${entry.actual.sum}`:'ожидается'}</span></div>
        <div class="rh-summary-right">${status}<span class="rh-arrow">⌄</span></div>
      </summary>
      <div class="rh-body">
        <div class="rh-card-head"><b>${fmtAt(entry.targetAt)}</b>${status}</div>
        <div class="rh-section-label">ПРОГНОЗ НА ТИРАЖ</div>
        <div class="rh-predict">
          <div><span>🥇 В1</span><b>${picks(f.v1)}</b></div>
          <div><span>🥈 В2</span><b>${picks(f.v2)}</b></div>
          <div><span>🥉 В3</span><b>${picks(f.v3)}</b></div>
        </div>
        <div class="rh-line"><span>🎲 Комбинации→Σ</span><b>${comboText}</b></div>
        <div class="rh-line"><span>📊 Доп. статистика</span><b>${picks(f.stats?.signal)}</b></div>
        ${stateBlock}
        <div class="rh-meta">
          <div><span>🎲 Комбинация в игре</span><b>${f.combo?.complete?f.combo.combo.join('-'):'—'}</b></div>
          <div><span>📅 Тираж</span><b>#${drawNo}</b></div>
          <div><span>🕒 Выход тиража</span><b>${fmtTime(entry.targetAt)}</b></div>
        </div>
      </div>
    </details>`;
}

async function renderResults(force=false){
  const root=$('#resultContent');
  if(!root) return;
  try{ cache=await loadData(); }
  catch(err){ root.innerHTML=`<div class="card"><div class="sec-title">Ошибка загрузки истории</div><div class="small">${String(err)}</div></div>`; return; }

  const rows=[...cache.history].filter(x=>x&&x.targetAt).sort((a,b)=>b.targetAt.localeCompare(a.targetAt));
  const key=(cache.current?.targetAt||'')+'|'+rows.length+'|'+(rows[0]?.checked?'1':'0');
  if(!force&&key===lastRenderKey) return;
  lastRenderKey=key;

  const list=rows.length?rows.map((x,i)=>makeItem(x,cache.rules,cache.facts,i)).join(''):`<div class="card"><div class="small">История пока пуста.</div></div>`;
  root.innerHTML=`
    <div class="rh-head">
      <div><div class="sec-title">📚 Все тиражи</div><div class="small">Нажми на тираж — развернётся. Нажми ещё раз — свернётся.</div></div>
      <div class="rh-count">${rows.length}</div>
    </div>
    <div class="rh-list">${list}</div>`;
}

window.addEventListener('load',()=>setTimeout(()=>renderResults(true),900));
document.addEventListener('click',e=>{const btn=e.target.closest('[data-page="result"],[data-go="result"]');if(btn)setTimeout(()=>renderResults(true),80);});
setInterval(()=>{const page=$('#result');if(page?.classList.contains('active'))renderResults(false);},30000);
