// 🎲 Позиции: 6 кубиков на ходы 1–6. Здесь все правила выбора — менять способ только в этом файле.
// Работает и в цикле (node), и в браузере.

export const POS_METHOD='MARKOV-POS+ODD3';
export const POS_LABEL='переход по месту + нечётные после 3 пропусков';
export const POS_FROM='2026-08-01';   // учимся только на новом режиме (96 тиражей в сутки)
export const POS_RULES=Object.freeze({
  oddPriority:true,          // 1, 3, 5, которых не было 3 тиража подряд, ставим на ход
  oddValues:[1,3,5],
  oddGap:3
});

const PAY_DEFAULT={2:600,3:1700,4:6000,5:55000,6:1200000};

// Модель «что чаще шло на этом ходу после прошлого числа на этом же ходу».
export function makePositionsModel(rules=POS_RULES){
  const counts=Array.from({length:6},()=>Array.from({length:7},()=>new Array(6).fill(0)));
  const recent=[];
  return {
    update(combo){
      const last=recent.at(-1);
      if(last) for(let i=0;i<6;i++) counts[i][last[i]][combo[i]-1]++;
      recent.push(combo); if(recent.length>10) recent.shift();
    },
    predict(){
      const last=recent.at(-1);
      if(!last) return {method:POS_METHOD,dice:[1,2,3,4,5,6],due:[]};
      const score=(i,v)=>counts[i][last[i]][v-1];
      const dice=[0,1,2,3,4,5].map(i=>{let best=1;for(let v=2;v<=6;v++)if(score(i,v)>score(i,best))best=v;return best});
      const due=[];
      if(rules.oddPriority&&recent.length>=rules.oddGap){
        const tail=recent.slice(-rules.oddGap);
        for(const v of rules.oddValues) if(tail.every(c=>!c.includes(v))) due.push(v);
        const used=new Set();
        for(const v of due){
          if(dice.includes(v)) continue;
          let bi=-1;for(let i=0;i<6;i++){if(used.has(i))continue;if(bi<0||score(i,v)>score(bi,v))bi=i}
          if(bi>=0){dice[bi]=v;used.add(bi)}
        }
      }
      return {method:POS_METHOD,dice,due};
    }
  };
}

// Набор на тираж targetAt по фактам до него.
export function computePositionsPick(facts,targetAt){
  const m=makePositionsModel();
  for(const x of facts) if(x.at>=POS_FROM&&x.at<targetAt) m.update(x.combo);
  return m.predict();
}

export function positionMatches(dice,combo){let n=0;for(let i=0;i<6;i++)if(Number(dice?.[i])===Number(combo?.[i]))n++;return n}
export function positionPay(matches,rules){return Number(rules?.positionPayouts?.[String(matches)]??PAY_DEFAULT[matches]??0)}

// ───── Системный билет: на 4 самых уверенных хода — 1 число, на 2 самых слабых — 3 числа (9 комбинаций).
export const SYS_METHOD='SYS-4x1+2x3';
export const SYS_RULES=Object.freeze({singles:4,width:3});

function makeSystemModel(r=SYS_RULES){
  const counts=Array.from({length:6},()=>Array.from({length:7},()=>new Array(6).fill(0)));
  let last=null;
  return {
    update(combo){if(last)for(let i=0;i<6;i++)counts[i][last[i]][combo[i]-1]++;last=combo},
    predict(){
      if(!last) return null;
      // вероятность числа на ходу после прошлого числа на этом же ходу (+1 к каждому, чтобы не было нулей)
      const moves=[0,1,2,3,4,5].map(i=>{const c=counts[i][last[i]];const tot=c.reduce((a,b)=>a+b,0)+6;const p=c.map(x=>(x+1)/tot);
        const order=[1,2,3,4,5,6].sort((a,b)=>p[b-1]-p[a-1]);return {i,order,conf:p[order[0]-1]-p[order[1]-1]}});
      const strong=new Set([...moves].sort((a,b)=>b.conf-a.conf).slice(0,r.singles).map(m=>m.i));
      return moves.map(m=>strong.has(m.i)?[m.order[0]]:m.order.slice(0,r.width).sort((a,b)=>a-b));
    }
  };
}

const sysInfo=moves=>{
  const combos=moves.reduce((a,s)=>a*s.length,1);
  const min=moves.reduce((a,s)=>a+Math.min(...s),0),max=moves.reduce((a,s)=>a+Math.max(...s),0);
  return {method:SYS_METHOD,moves,combos,sumMin:min,sumMax:max};
};

// Системный билет на тираж targetAt по фактам до него.
export function computePositionsSystem(facts,targetAt){
  const m=makeSystemModel();
  for(const x of facts) if(x.at>=POS_FROM&&x.at<targetAt) m.update(x.combo);
  const moves=m.predict();
  return moves?sysInfo(moves):null;
}

// Проверка системного билета: каждая комбинация — отдельная ставка, выигрыши складываются.
export function systemResult(moves,combo,rules){
  let dist=[1];
  for(let i=0;i<6;i++){const hit=moves[i].includes(Number(combo[i]))?1:0,miss=moves[i].length-hit;
    const nd=new Array(dist.length+1).fill(0);dist.forEach((w,k)=>{nd[k]+=w*miss;nd[k+1]+=w*hit});dist=nd}
  const best=dist.reduce((b,w,k)=>w>0?k:b,0);
  const payout=dist.reduce((a,w,k)=>a+w*positionPay(k,rules),0);
  const cost=moves.reduce((a,s)=>a*s.length,1)*Number(rules?.ticketPrice||550);
  return {best,payout,cost};
}

// Шанс, что хотя бы одна комбинация билета совпадёт на k+ ходах (точно, без перебора).
export function systemChanceAtLeast(moves,k){
  let dist=[1];
  for(const s of moves){const p=s.length/6;const nd=new Array(dist.length+1).fill(0);dist.forEach((w,j)=>{nd[j]+=w*(1-p);nd[j+1]+=w*p});dist=nd}
  return dist.slice(k).reduce((a,b)=>a+b,0);
}

// Как сыграл бы системный билет на каждом тираже нового режима.
export function systemBacktest(facts,rules){
  const m=makeSystemModel();const out=[];
  for(const x of facts){
    if(x.at<POS_FROM) continue;
    const moves=m.predict();
    if(moves) out.push({at:x.at,moves,...systemResult(moves,x.combo,rules)});
    m.update(x.combo);
  }
  return out;
}

// Как сыграл бы этот способ на каждом тираже нового режима (прогноз строится только по прошлому).
export function positionsBacktest(facts,rules){
  const m=makePositionsModel();const out=[];
  for(const x of facts){
    if(x.at<POS_FROM) continue;
    const p=m.predict();
    if(out.length||p.dice){const k=positionMatches(p.dice,x.combo);out.push({at:x.at,dice:p.dice,matches:k,payout:positionPay(k,rules)})}
    m.update(x.combo);
  }
  return out.slice(1);
}
