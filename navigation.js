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

function waveSvg(w){
  const W=340,Hh=150,L=26,R=6,T=10,B=22,lim=9;
  const y=v=>T+(Hh-T-B)*(1-(v+lim)/(2*lim));
  const bw=(W-L-R)/w.length;
  let g=`<rect x="${L}" y="${y(2)}" width="${W-L-R}" height="${y(-2)-y(2)}" fill="var(--nav-band)"/>`;
  for(const v of [7,-7])g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--nav-lim)" stroke-dasharray="3 4"/>`;
  g+=`<line x1="${L}" x2="${W-R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--nav-lim)"/>`;
  for(const [v,t] of [[7,'+7'],[2,'+2'],[0,'21'],[-2,'−2'],[-7,'−7']])g+=`<text x="${L-4}" y="${y(v)+3}" text-anchor="end">${t}</text>`;
  w.forEach((x,i)=>{const dv=Math.max(-lim,Math.min(lim,x.sum-21));const cx=L+i*bw+bw*0.15,ww=bw*0.7;const top=Math.min(y(dv),y(0)),h=Math.max(2,Math.abs(y(dv)-y(0)));
    const cls=CENTER(x.sum)?'var(--green)':x.sum<19?'var(--nav-left)':'var(--nav-right)';
    g+=`<rect x="${cx}" y="${dv===0?y(0)-1:top}" width="${ww}" height="${h}" rx="2" fill="${cls}"><title>${x.at.slice(11,16)} — Σ ${x.sum}</title></rect>`;
    if(i%3===0||i===w.length-1)g+=`<text x="${cx+ww/2}" y="${Hh-6}" text-anchor="middle">${x.sum}</text>`;});
  return `<svg class="nav-wave" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Качка сумм за последние тиражи">${g}</svg>`;
}

export function renderNavigation(el,facts){
  if(!el) return;
  const n=navigation(facts);
  if(!n){el.innerHTML='';return}
  const st=n.now;
  const lamp=(on,txt)=>`<span class="nav-lamp ${on?'on':''}">${on?'горит':'не горит'}</span>${txt?`<span class="small">${txt}</span>`:''}`;
  const lastRet=n.ret.last.slice(-5).reverse().map(x=>`<span class="nav-hist ${x.hit?'ok':'no'}" title="${x.at.replace('T',' ')} · серия ${x.run} → выход ${x.exit} → ${x.sum}">${x.hit?'✓':'✗'} ${x.sum}</span>`).join('');
  el.innerHTML=`
    <div class="sec-title">🧭 Навигация</div>
    <div class="small">Как качает сумму вокруг 21: зелёное — центр 19–23 (±2), синее — левый борт, жёлтое — правый. Пунктир — ±7, в этих пределах 90% сумм.</div>
    ${waveSvg(n.wave)}
    <div class="nav-grid">
      <div><div class="k">Качка</div><b>${st.ampLabel}</b><div class="small">размах ${st.a5.toFixed(1).replace('.',',')}</div></div>
      <div><div class="k">Крен</div><b>${st.heelLabel}</b><div class="small">${st.h5>0?'+':''}${st.h5.toFixed(1).replace('.',',')}</div></div>
      <div><div class="k">Перекладки</div><b>${st.fl} из 5</b><div class="small">борт ↔ борт</div></div>
      <div><div class="k">Волна</div><b>${st.dampLabel}</b><div class="small">${st.run?`в центре ${st.run} подряд`:'не в центре'}</div></div>
    </div>
    <div class="nav-sig ${st.ret?'lit':''}">
      <div class="nav-sig-head"><b>🧭 Возврат после серии</b>${lamp(st.ret,st.ret?`серия ${st.retRun} → выход ${esc(n.wave.at(-1).sum)}`:'')}</div>
      <div class="small">Когда серия из 7+ тиражей в центре заканчивается выходом, следующая сумма возвращалась в центр <b>${n.ret.h} из ${n.ret.n}</b> (${pct(n.ret.n?n.ret.h/n.ret.n:0)}, обычно ${pct(n.base)}).</div>
      ${lastRet?`<div class="nav-hist-row"><span class="small">последние:</span>${lastRet}</div>`:''}
    </div>
    <div class="nav-sig ${st.ctr?'lit':''}">
      <div class="nav-sig-head"><b>🌊 Удар-контрудар</b>${lamp(st.ctr)}</div>
      <div class="small">Сильный удар с одного борта и сразу с другого (оба дальше ±3). После него 3 тиража подряд в центре шли в <b>${pct(n.ctr.calmN?n.ctr.calm/n.ctr.calmN:0)}</b> случаев (обычно ${pct(n.baseCalm)}), центр сразу — ${pct(n.ctr.n?n.ctr.h/n.ctr.n:0)}. Было ${n.ctr.n} раз.</div>
    </div>
    <div class="nav-out">
      <div class="k">Куда уходит из центра чаще всего</div>
      <div class="pick-sums">${n.exitTop.map(x=>`<span class="sum-chip out">${x.sum}<small>${Math.round(x.share*100)}%</small></span>`).join('')}</div>
      <div class="small">Влево (меньше 19) — ${pct(n.leftShare)}, вправо (больше 23) — ${pct(1-n.leftShare)} всех выходов с 01.08.</div>
    </div>`;
}
