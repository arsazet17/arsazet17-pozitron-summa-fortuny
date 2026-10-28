// Навигация: качка сумм вокруг 21 и сигналы, которые проверяются на новом режиме (с 01.08.2026, 96 тиражей в сутки).
// Ставки не меняет — только показывает состояние и живой счёт сигналов.

export const NEW_FROM='2026-08-01';
const CENTER=x=>x>=19&&x<=23;
const pct=x=>(x*100).toFixed(1).replace('.',',')+'%';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

const amp=(d,t,k)=>{let a=0;for(let j=1;j<=k;j++)a+=Math.abs(d[t-j]);return a/k};
const heel=(d,t,k)=>{let a=0;for(let j=1;j<=k;j++)a+=d[t-j];return a/k};
const flips=(d,t,k)=>{let c=0,prev=0;for(let j=k;j>=1;j--){const sg=Math.sign(d[t-j]);if(sg&&prev&&sg!==prev)c++;if(sg)prev=sg}return c};
// длина серии центра, закончившейся на тираже t-1 (включительно)
const runEnding=(s,t)=>{let L=0;for(let j=t;j>=0&&CENTER(s[j]);j--)L++;return L};

// 🧭 после серии из 7+ в центре был выход (тираж t-1) → следующий тираж t
const returnSignal=(s,t)=>t>=2&&!CENTER(s[t-1])&&runEnding(s,t-2)>=7;
// 🌊 сильный удар с одного борта и сразу с другого (|откл| ≥ 3, знаки разные)
const counterSignal=(d,t)=>t>=2&&Math.abs(d[t-2])>=3&&Math.abs(d[t-1])>=3&&Math.sign(d[t-2])!==Math.sign(d[t-1]);

export function navigation(facts){
  const f=facts.filter(x=>x.at>=NEW_FROM);
  const s=f.map(x=>x.sum),d=s.map(x=>x-21),N=f.length;
  if(N<20) return null;
  const H=s.map(x=>CENTER(x)?1:0);
  const base=H.reduce((a,b)=>a+b,0)/N;
  let calmN=0,calmH=0;for(let t=0;t+2<N;t++){calmN++;if(H[t]&&H[t+1]&&H[t+2])calmH++}
  const baseCalm=calmH/calmN;
  // счёт сигналов
  const ret={n:0,h:0,last:[]},ctr={n:0,h:0,calm:0,calmN:0};
  for(let t=2;t<N;t++){
    if(returnSignal(s,t)){ret.n++;ret.h+=H[t];ret.last.push({at:f[t].at,sum:s[t],hit:!!H[t],exit:s[t-1],run:runEnding(s,t-2)})}
    if(counterSignal(d,t)){ctr.n++;ctr.h+=H[t];if(t+2<N){ctr.calmN++;if(H[t]&&H[t+1]&&H[t+2])ctr.calm++}}
  }
  // куда уходит: суммы выхода из центра после серии
  const exits={};let exN=0;
  for(let t=1;t<N;t++){if(!CENTER(s[t])&&CENTER(s[t-1])){exits[s[t]]=(exits[s[t]]||0)+1;exN++}}
  const exitTop=Object.entries(exits).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>({sum:+k,share:v/exN}));
  const leftShare=Object.entries(exits).filter(([k])=>+k<19).reduce((a,[,v])=>a+v,0)/exN;
  // состояние сейчас (для следующего тиража)
  const t=N;
  const a5=amp(d,t,5),h5=heel(d,t,5),fl=flips(d,t,6),damp=amp(d,t,3)-amp(d,t,8);
  const run=runEnding(s,t-1);
  return {
    base,baseCalm,ret,ctr,exitTop,leftShare,
    now:{a5,h5,fl,damp,run,
      ret:returnSignal(s,t),retRun:CENTER(s[t-1])?0:runEnding(s,t-2),
      ctr:counterSignal(d,t),
      ampLabel:a5<2?'штиль':a5<3?'лёгкая':a5<4?'средняя':a5<5.5?'сильная':'шторм',
      heelLabel:h5<=-2.5?'сильно влево':h5<=-1?'влево':h5<1?'ровно':h5<2.5?'вправо':'сильно вправо',
      dampLabel:damp<-0.5?'стихает':damp<0.5?'ровно':'раскачивается'},
    wave:f.slice(-16).map(x=>({at:x.at,sum:x.sum}))
  };
}

export function renderNavigation(el,facts,warn){
  if(!el) return;
  const n=navigation(facts);
  if(!n){el.innerHTML='';el.className='nav-off';return}
  const st=n.now,w=n.wave,last=w.at(-1),prev=w.at(-2);
  const sig=[];
  if(warn?.on){const sc=warn.score||{n:0,hit:0,out:0};const side=warn.side==='left'?'влево':'вправо';
    sig.push(`<div class="nav-sig warn">
      <div class="nav-title">⚠️ Возможен уход из центра — ${side}</div>
      <div>Последние тиражи: ${w.slice(-5).map(x=>esc(x.sum)).join(' → ')}</div>
      <div>Скорее выпадет: <b class="warn-sums">${warn.sums.join(' · ')}</b></div>
      <div class="small">Сигнал на проверке: ${sc.n?`выпали эти числа <b>${sc.hit} из ${sc.n}</b>, уход из центра был ${sc.out} из ${sc.n}`:'считаем с 28.10, проверок пока нет'}.</div>
    </div>`)}
  if(st.ret) sig.push(`<div class="nav-sig lit">
      <div class="nav-title">🧭 Возможен возврат в центр</div>
      <div>Серия <b>${st.retRun}</b> тиражей в центре закончилась выходом на <b>${esc(last.sum)}</b>.</div>
      <div>Следующая сумма скорее вернётся в <b style="white-space:nowrap">19–23</b>: так было <b>${n.ret.h} из ${n.ret.n}</b> раз (обычно ${pct(n.base)}).</div>
    </div>`);
  if(st.ctr) sig.push(`<div class="nav-sig lit">
      <div class="nav-title">🌊 Возможна спокойная полоса</div>
      <div>Удар с одного борта и сразу с другого: <b>${esc(prev.sum)} → ${esc(last.sum)}</b>.</div>
      <div>После такого 3 тиража подряд в <b style="white-space:nowrap">19–23</b> шли в <b>${pct(n.ctr.calmN?n.ctr.calm/n.ctr.calmN:0)}</b> случаев (обычно ${pct(n.baseCalm)}).</div>
    </div>`);
  if(!sig.length){el.className='nav-off';el.innerHTML='🧭 Сигнала нет';return}
  el.className='card nav-card'+(warn?.on?' nav-warn':'');
  el.innerHTML=sig.join('');
}
