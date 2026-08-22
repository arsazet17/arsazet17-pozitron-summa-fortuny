
import {parseLuckyCsv,nextScheduledAfter,calculateForecast,evaluateForecast,combinationCategories,sumPayout} from './engine.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const stateKey='pozitron-summa-fortuny-v1';

let facts=[],rules={},ledger={},forecast=null;

const rub=n=>n?new Intl.NumberFormat('ru-RU').format(n)+' ₽':'—';
const fmtAt=at=>{const [d,t]=at.split('T');const [y,m,dd]=d.split('-');return `${dd}.${m}.${y} ${t}`};
const picks=a=>a?.length?a.join(' / '):'—';

async function boot(){
  const bust='?v='+Date.now();

  const [csv,rr,ll,fixed]=await Promise.all([
    fetch('./data/fortune-archive.csv'+bust,{cache:'no-store'}).then(r=>r.text()),
    fetch('./data/rules.json'+bust,{cache:'no-store'}).then(r=>r.json()),
    fetch('./data/forecast-ledger.json'+bust,{cache:'no-store'}).then(r=>r.json()),
    fetch('./data/current-forecast.json'+bust,{cache:'no-store'}).then(async r=>r.ok?r.json():null).catch(()=>null)
  ]);

  facts=parseLuckyCsv(csv);
  rules=rr;
  ledger=ll;

  const expectedTarget=nextScheduledAfter(facts.at(-1).at);

  if(!fixed || fixed.targetAt!==expectedTarget || !fixed.locked){
    document.body.innerHTML=
      `<div style="padding:28px;color:white;background:#220709;min-height:100vh">
        <h1>Прогноз ещё не зафиксирован</h1>
        <p>Последний факт: ${fmtAt(facts.at(-1).at)}.</p>
        <p>Ожидается автоматическая фиксация прогноза на ${fmtAt(expectedTarget)}.</p>
        <p>Браузер не рассчитывает прогноз сам — это запрещено законом фиксации ДО тиража.</p>
      </div>`;
    return;
  }

  forecast=fixed;
  render();
}
function render(){
  const last=facts.at(-1);

  $('#lastDraw').textContent=fmtAt(last.at);
  $('#lastDrawNo').textContent='№ '+last.number;
  $('#nextDraw').textContent=fmtAt(forecast.targetAt);
  $('#archiveStatus').textContent=facts.length+' тиражей';

  $('#fTarget').textContent=forecast.targetAt.slice(11,16);
  $('#fLast').textContent=last.at.slice(11,16);
  $('#v1').textContent=picks(forecast.v1);
  $('#v2').textContent=picks(forecast.v2);
  $('#v3').textContent=picks(forecast.v3);

  $('#comboCells').innerHTML=forecast.combo.complete
    ? forecast.combo.combo.map(x=>`<span class="die-cell">${x}</span>`).join('<b>-</b>')
    : 'НЕТ ПОЛНОГО ПРОГНОЗА';

  $('#comboSum').textContent=forecast.combo.complete?forecast.combo.sum:'—';
  $('#statSignal').textContent=forecast.stats.signal.length?picks(forecast.stats.signal):'—';
  $('#statLabel').textContent=forecast.stats.label;
  $('#statReason').textContent=forecast.stats.reason||'';

  $('#strongText').textContent=strongSignal();
  $('#homeStrong').textContent=strongSignal();

  const sums=[...new Set([
    ...forecast.v1,...forecast.v2,...forecast.v3,
    ...(forecast.combo.complete?[forecast.combo.sum]:[])
  ])];

  $('#sumChips').innerHTML=sums.map(s=>`<span class="chip">${s}<small> · ${rub(sumPayout(s,rules))}</small></span>`).join('');

  if(forecast.combo.complete){
    const cats=combinationCategories(forecast.combo.combo,rules);
    $('#comboPrediction').innerHTML=
      `<div class="combo-row">${forecast.combo.combo.map(x=>`<span class="die-cell">${x}</span>`).join('')}</div>
       <div class="small" style="margin-top:9px">${cats.length?cats.map(c=>`${c.label} (${rub(c.payout)})`).join(' · '):'Отдельная категория комбинации не срабатывает'}</div>`;

    $('#positionPrediction').innerHTML=forecast.combo.combo.map((x,i)=>`<div><b>${i+1}</b><br>↓<br><span class="hot"><b>${x}</b></span></div>`).join('');
  }

  renderEngine();
  renderRules();
  renderArchive();
  $('#resultContent').innerHTML=`<div class="card"><div class="sec-title">Ожидается факт ${fmtAt(forecast.targetAt)}</div><div class="small">Прогноз уже зафиксирован. После прихода факта он будет только проверен и не изменится задним числом.</div></div>`;
}

function strongSignal(){
  const map=new Map();
  const add=(label,vals)=>{for(const v of vals||[]){if(!map.has(v))map.set(v,[]);map.get(v).push(label)}};
  add('В1',forecast.v1); add('В2',forecast.v2); add('В3',forecast.v3); add('Доп. статистика',forecast.stats.signal);
  for(const [name,v] of Object.entries(forecast.repeats)) if(v!=null) add(name,[v]);
  const rows=[...map.entries()].sort((a,b)=>b[1].length-a[1].length||a[0]-b[0]);
  return rows.length&&rows[0][1].length>=2 ? `${rows[0][0]} = ${rows[0][1].join(' + ')}` : 'Нет объединённого сигнала';
}

function renderEngine(){
  $('#chains').innerHTML=
    `<div class="card"><div class="k">📍 Вертикальная цепочка</div><div class="chain">${forecast.verticalChain.join('→')}</div></div>
     <div class="card"><div class="k">➡️ Горизонтальная цепочка</div><div class="chain">${forecast.horizontalChain.join('→')}</div></div>`;

  $('#methods').innerHTML=Object.entries(forecast.methods).map(([name,r])=>
    `<div class="method"><b>${name}</b> · первое совпадение: <b>${r.level?`${r.level}/${r.level}`:'БЕЗ ПРОДОЛЖЕНИЯ'}</b>
       <div class="chain">${r.chain.join('→')}</div>
       <div class="small">Все продолжения: ${r.matches.map(x=>x.value).join(' / ')||'нет'}</div>
     </div>`).join('');

  $('#variantTable').innerHTML=forecast.variantRows.map(r=>
    `<tr><td>${r.value}</td><td>${r.coverage}</td><td>${r.frequency}</td><td>${fmtAt(r.oldest)}</td></tr>`).join('');

  $('#repeatGrid').innerHTML=Object.entries(forecast.repeats).map(([k,v])=>`<span class="chip">${k}: ${v??'—'}</span>`).join('');

  $('#comboPositionsDetail').innerHTML=forecast.combo.complete
    ? forecast.combo.positions.map(p=>`<div class="method"><b>${p.position}-я позиция</b> · ${p.level}/${p.level} → <b class="hot">${p.value}</b><div class="small">Самое свежее историческое продолжение: ${fmtAt(p.at)}</div></div>`).join('')
    : `<div class="miss">${forecast.combo.reason}</div>`;
}

function renderRules(){
  const sums=[[6,36],[7,35],[8,34],[9,33],[10,32],[11,31],[12,30],[13,29],[14,28],[15,27],[16,26],[17,25],[18,24],[19,23],[20,21,22]];
  $('#sumRules').innerHTML=sums.map(a=>`<tr><td>${a.join(' или ')}</td><td>${rub(rules.sumPayouts[String(a[0])])}</td></tr>`).join('');

  const combos=[
    ['Все единицы / двойки / … / шестёрки',1400000],['Шесть одинаковых',700000],['Пять одинаковых',49000],
    ['3 числа × 2',17500],['Все шесть чисел',10500],['Только чётные / нечётные',10500],
    ['Числа 1,2,3 / 4,5,6',10500],['2 числа × 3',4900],['Четыре одинаковых',4200]
  ];
  $('#comboRules').innerHTML=combos.map(([n,p])=>`<tr><td>${n}</td><td>${rub(p)}</td></tr>`).join('');

  $('#positionRules').innerHTML=[6,5,4,3,2].map(n=>`<tr><td>${n} совпадений</td><td>${rub(rules.positionPayouts[String(n)])}</td></tr>`).join('');
}

function renderArchive(){
  $('#archiveInfo').textContent=`Встроено ${facts.length} фактических тиражей. Первый: ${fmtAt(facts[0].at)}. Последний: ${fmtAt(facts.at(-1).at)}.`;
  $('#archiveRows').innerHTML=facts.slice(-30).reverse().map(f=>`<tr><td>${f.number}</td><td>${fmtAt(f.at)}</td><td>${f.combo.join('-')}</td><td>${f.sum}</td></tr>`).join('');
}

function showResult(f){
  const ev=evaluateForecast(forecast,f,rules);
  const audit=[
    ['В1',picks(forecast.v1),ev.v1Hit],
    ['В2',picks(forecast.v2),ev.v2Hit],
    ['В3',picks(forecast.v3),ev.v3Hit],
    ['Combo→Σ',forecast.combo.complete?forecast.combo.sum:'—',ev.comboHit],
    ['Доп. статистика',picks(forecast.stats.signal),ev.statsHit]
  ];

  const bestCombo=ev.combinationCategories.length?Math.max(...ev.combinationCategories.map(c=>c.payout)):0;

  $('#resultContent').innerHTML=
    `<div class="card result-head"><div class="dice">🎲</div><div><div class="k">Факт</div><div class="fact">${f.combo.join('-')} = <span class="hot">${ev.actualSum}</span></div><div class="hot">${fmtAt(f.at)}</div></div></div>
     <div class="card"><div class="sec-title">Сводка проверки</div>
       ${audit.map(([n,p,h])=>`<div class="audit-row"><b>${n}</b><span>${p} — <b class="${h?'hit':'miss'}">${h?'ПОПАДАНИЕ':'мимо'}</b></span></div>`).join('')}
       <div class="small" style="margin-top:10px">Сырые методы: ${ev.rawHits.join(', ')||'нет'}</div>
     </div>
     <div class="sec-title">Проверка игровых направлений</div>
     <div class="card direction-result"><div class="dice">🎲</div><div><h2>Сумма</h2><div>Совпала сумма ${ev.actualSum}</div></div><div class="money">${rub(ev.sumPayout)}</div></div>
     <div class="card direction-result"><div class="dice">🎲🎲</div><div><h2>Комбинация</h2><div>${ev.combinationCategories.length?ev.combinationCategories.map(c=>c.label).join(', '):'Нет категории из таблицы'}</div></div><div class="money">${rub(bestCombo)}</div></div>
     <div class="card direction-result"><div class="dice">🎲</div><div><h2>Позиции</h2><div>Совпало ${ev.posMatches}</div></div><div class="money">${rub(ev.positionPayout)}</div></div>
     <div class="card notice"><div class="ico">⚠️</div><div>Суперприз по номеру билета <b class="hot">не учитывается</b>.</div></div>`;

  switchPage('result');
}

function switchPage(id){
  $$('.page').forEach(p=>p.classList.toggle('active',p.id===id));
  $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===id));
  window.scrollTo({top:0,behavior:'smooth'});
}

$$('.nav button').forEach(b=>b.addEventListener('click',()=>switchPage(b.dataset.page)));
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>switchPage(b.dataset.go)));

$('#demoFact').addEventListener('click',()=>{
  const raw=prompt('Введите 6 чисел факта, например 4-4-6-2-6-2');
  if(!raw) return;
  const combo=raw.split(/[-,\s]+/).filter(Boolean).map(Number);
  if(combo.length!==6||combo.some(x=>!Number.isInteger(x)||x<1||x>6)){
    alert('Нужно ровно 6 чисел от 1 до 6');
    return;
  }
  showResult({at:forecast.targetAt,combo,sum:combo.reduce((a,b)=>a+b,0)});
});

boot().catch(err=>{
  document.body.innerHTML=`<div style="padding:30px;color:white;background:#220709;min-height:100vh"><h1>Ошибка загрузки</h1><pre>${String(err.stack||err)}</pre></div>`;
});

if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
