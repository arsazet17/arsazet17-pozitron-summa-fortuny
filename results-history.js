
import {parseLuckyCsv,evaluateForecast,combinationCategories} from './engine.js';

const $=s=>document.querySelector(s);

const fmtAt=at=>{
  if(!at) return '—';
  const [d,t]=at.split('T');
  const [y,m,dd]=d.split('-');
  return `${dd}.${m}.${y} ${t}`;
};

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

  return {
    history:Array.isArray(hist)?hist:[],
    facts:parseLuckyCsv(csv),
    rules,
    current
  };
}

function badge(hit){
  return hit
    ? '<span class="rh-badge rh-hit">✅ ПОПАЛИ</span>'
    : '<span class="rh-badge rh-miss">❌ МИМО</span>';
}

function statusBadge(checked,mainHit){
  if(!checked) return '<span class="rh-status rh-wait">⏳ Ожидается</span>';
  return mainHit
    ? '<span class="rh-status rh-hit">✅ Основной попал</span>'
    : '<span class="rh-status rh-miss">❌ Основной мимо</span>';
}

function sumDirectionPayout(f,ev){
  const hit=Boolean(ev?.v1Hit||ev?.v2Hit||ev?.v3Hit||ev?.comboHit);
  return hit ? Number(ev?.sumPayout||0) : 0;
}

function combinationDirectionPayout(f,actual,rules){
  if(!f?.combo?.complete || !Array.isArray(f.combo.combo)) return 0;
  const predicted=combinationCategories(f.combo.combo,rules);
  const actualCats=combinationCategories(actual.combo,rules);
  const actualKeys=new Set(actualCats.map(c=>c.key));
  return predicted
    .filter(c=>actualKeys.has(c.key))
    .reduce((sum,c)=>sum+(Number(c.payout)||0),0);
}

function makeItem(entry,rules,idx){
  const f=entry.forecast||{};
  const checked=Boolean(entry.checked && entry.actual);
  let ev=null;

  if(checked){
    try{
      ev=evaluateForecast(f,entry.actual,rules);
    }catch{}
  }

  const mainHit=Boolean(ev && (ev.v1Hit||ev.v2Hit||ev.v3Hit));
  const head=statusBadge(checked,mainHit);
  const comboText=f.combo?.complete
    ? `${f.combo.combo.join('-')} = Σ${f.combo.sum}`
    : 'НЕТ ПОЛНОГО ПРОГНОЗА';

  let factBlock='';
  if(checked && ev){
    const sumPay=sumDirectionPayout(f,ev);
    const comboPay=combinationDirectionPayout(f,entry.actual,rules);
    const posPay=Number(ev.positionPayout)||0;
    const total=sumPay+comboPay+posPay;

    factBlock=`
      <div class="rh-fact-row">
        <div>
          <span class="rh-label">ФАКТ</span>
          <b>${entry.actual.combo.join('-')} = Σ${entry.actual.sum}</b>
        </div>
        ${head}
      </div>

      <div class="rh-audit">
        <div><span>🥇 В1: <b>${picks(f.v1)}</b></span>${badge(Boolean(ev.v1Hit))}</div>
        <div><span>🥈 В2: <b>${picks(f.v2)}</b></span>${badge(Boolean(ev.v2Hit))}</div>
        <div><span>🥉 В3: <b>${picks(f.v3)}</b></span>${badge(Boolean(ev.v3Hit))}</div>
        <div><span>🎲 Combo→Σ: <b>${f.combo?.complete?f.combo.sum:'—'}</b></span>${badge(Boolean(ev.comboHit))}</div>
        <div><span>📊 Статистика: <b>${picks(f.stats?.signal)}</b></span>${badge(Boolean(ev.statsHit))}</div>
      </div>

      <div class="rh-money">
        <div><span>🎲 Сумма</span><b>${rub(sumPay)}</b></div>
        <div><span>🎲🎲 Комбинация</span><b>${rub(comboPay)}</b></div>
        <div><span>📍 Позиции</span><b>${rub(posPay)}</b></div>
        <div class="rh-total"><span>💰 ИТОГО</span><b>${rub(total)}</b></div>
      </div>

      <div class="rh-muted">Сырые методы: ${ev.rawHits?.join(', ')||'нет'}</div>
    `;
  }else{
    factBlock=`
      <div class="rh-fact-row">
        <div>
          <span class="rh-label">СОСТОЯНИЕ</span>
          <b>Факт ещё не получен</b>
        </div>
        ${head}
      </div>`;
  }

  const fixedTime=entry.fixedAt
    ? new Date(entry.fixedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})
    : '—';

  return `
    <details class="rh-item" ${idx===0?'open':''}>
      <summary>
        <div class="rh-summary-left">
          <b>${fmtAt(entry.targetAt)}</b>
          <span>${checked?`Σ${entry.actual.sum}`:'ожидается'}</span>
        </div>
        <div class="rh-summary-right">
          ${head}
          <span class="rh-arrow">⌄</span>
        </div>
      </summary>

      <div class="rh-body">
        <div class="rh-predict">
          <div><span>🥇 В1</span><b>${picks(f.v1)}</b></div>
          <div><span>🥈 В2</span><b>${picks(f.v2)}</b></div>
          <div><span>🥉 В3</span><b>${picks(f.v3)}</b></div>
        </div>

        <div class="rh-line"><span>🎲 Combo</span><b>${comboText}</b></div>
        <div class="rh-line"><span>📊 Доп. статистика</span><b>${picks(f.stats?.signal)}</b></div>

        ${factBlock}

        <div class="rh-fixed">🔒 Прогноз зафиксирован: ${fixedTime}</div>
      </div>
    </details>`;
}

async function renderResults(force=false){
  const root=$('#resultContent');
  if(!root) return;

  try{
    cache=await loadData();
  }catch(err){
    root.innerHTML=`<div class="card"><div class="sec-title">Ошибка загрузки истории</div><div class="small">${String(err)}</div></div>`;
    return;
  }

  const rows=[...cache.history]
    .filter(x=>x&&x.targetAt)
    .sort((a,b)=>b.targetAt.localeCompare(a.targetAt));

  const key=(cache.current?.targetAt||'')+'|'+rows.length+'|'+(rows[0]?.checked?'1':'0');
  if(!force && key===lastRenderKey) return;
  lastRenderKey=key;

  const wait=cache.current
    ? `<div class="card rh-current">
         <div>
           <div class="rh-label">⏳ ТЕКУЩИЙ ТИРАЖ</div>
           <div class="sec-title">${fmtAt(cache.current.targetAt)}</div>
           <div class="small">Прогноз уже зафиксирован. После прихода факта он только проверяется.</div>
         </div>
         <div class="rh-lock">🔒</div>
       </div>`
    : '';

  const list=rows.length
    ? rows.map((x,i)=>makeItem(x,cache.rules,i)).join('')
    : `<div class="card"><div class="small">История пока пуста.</div></div>`;

  root.innerHTML=`
    ${wait}
    <div class="rh-head">
      <div>
        <div class="sec-title">📚 Все тиражи</div>
        <div class="small">Нажми на тираж — развернётся. Нажми ещё раз — свернётся.</div>
      </div>
      <div class="rh-count">${rows.length}</div>
    </div>
    <div class="rh-list">${list}</div>`;
}

window.addEventListener('load',()=>setTimeout(()=>renderResults(true),900));

document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-page="result"],[data-go="result"]');
  if(btn) setTimeout(()=>renderResults(true),80);
});

setInterval(()=>{
  const page=$('#result');
  if(page?.classList.contains('active')) renderResults(false);
},30000);
