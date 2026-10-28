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
