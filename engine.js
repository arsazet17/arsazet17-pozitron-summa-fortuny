
export const LAW = Object.freeze({
  drawMinutes:[7,22,37,52],
  sumMin:6,
  sumMax:36
});

export const MODEL_VERSION='REAL-RULES-2026-10-28';

export function sumCombo(combo){ return combo.reduce((a,x)=>a+Number(x||0),0); }
const pad=n=>String(n).padStart(2,'0');

export function parseLuckyCsv(text){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
  const out=[];
  for(let i=1;i<lines.length;i++){
    const c=lines[i].split(',').map(x=>x.trim());
    if(!/^\d+$/.test(c[0]||'')) continue;
    const [dd,mm,yy]=(c[1]||'').split('.').map(Number);
    const [hh,mi]=(c[2]||'').split(':').map(Number);
    const combo=[3,5,7,9,11,13].map(k=>Number(c[k]));
    if(combo.some(x=>!Number.isInteger(x)||x<1||x>6)) continue;
    out.push({
      number:c[0],
      at:`${2000+yy}-${pad(mm)}-${pad(dd)}T${pad(hh)}:${pad(mi)}`,
      combo,
      sum:sumCombo(combo)
    });
  }
  return out.sort((a,b)=>a.at.localeCompare(b.at));
}

export function nextScheduledAfter(at){
  const [date,time]=at.split('T');
  const [Y,M,D]=date.split('-').map(Number);
  const [h,m]=time.split(':').map(Number);
  const next=LAW.drawMinutes.find(x=>x>m);
  if(next!=null) return `${date}T${pad(h)}:${pad(next)}`;
  const d=new Date(Y,M-1,D,h+1,7);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:07`;
}


// Точная вероятность каждой суммы шести шаров 1–6 (шары независимы, как кубики).
export const SUM_CHANCE=(()=>{
  let d=new Map([[0,1]]);
  for(let k=0;k<6;k++){
    const n=new Map();
    for(const [s,c] of d) for(let v=1;v<=6;v++) n.set(s+v,(n.get(s+v)||0)+c);
    d=n;
  }
  const out={};for(const [s,c] of d) out[s]=c/46656;return out;
})();

// Два набора сумм и лучшая категория комбинации — выбраны по вероятности и таблице выплат.
export const PICKS=Object.freeze({
  often:Object.freeze({key:'often',label:'Чаще попадать',sums:Object.freeze([20,21,22]),hint:'самые частые суммы'}),
  value:Object.freeze({key:'value',label:'Выгоднее',sums:Object.freeze([19,21,23]),hint:'самый большой возврат среди сумм'})
});
// Лучшая по возврату категория по настоящим правилам: «Четыре одинаковых» (4, 5 или 6 одинаковых), ×12, шанс 5,2%.
export const COMBO_PICK=Object.freeze({key:'FOUR_SAME',label:'Четыре одинаковых',hint:'самый большой возврат среди комбинаций'});

export const chanceOf=sums=>(sums||[]).reduce((a,s)=>a+(SUM_CHANCE[s]||0),0);

export function sumPayout(sum,rules){ return Number(rules?.sumPayouts?.[String(sum)]||0); }
export function positionPayout(matches,rules){ return Number(rules?.positionPayouts?.[String(matches)]||0); }

export function combinationCategories(combo,rules){
  const counts=new Map();
  for(const x of combo) counts.set(x,(counts.get(x)||0)+1);
  const vals=[...counts.values()].sort((a,b)=>b-a);
  const uniq=[...counts.keys()].sort((a,b)=>a-b);
  const cats=[];
  const add=(key,label)=>{
    const payout=Number(rules?.combinationPayouts?.[key]||0);
    if(payout&&!cats.some(c=>c.key===key)) cats.push({key,label,payout});
  };
  if(combo.every(x=>x===1)) add('ALL_1','Все единицы');
  if(combo.every(x=>x===2)) add('ALL_2','Все двойки');
  if(combo.every(x=>x===3)) add('ALL_3','Все тройки');
  if(combo.every(x=>x===4)) add('ALL_4','Все четвёрки');
  if(combo.every(x=>x===5)) add('ALL_5','Все пятёрки');
  if(combo.every(x=>x===6)) add('ALL_6','Все шестёрки');
  if(vals[0]===6) add('SIX_SAME','Шесть одинаковых');
  if(vals[0]>=5) add('FIVE_SAME','Пять одинаковых');
  if(vals[0]>=4) add('FOUR_SAME','Четыре одинаковых');
  // По правилам лотереи: «3 числа × 2» — два числа по три раза (5 1 1 5 5 1),
  // «2 числа × 3» — три числа по два раза (4 4 6 2 6 2).
  if(vals.length===2&&vals.every(x=>x===3)) add('THREE_NUMBERS_X2','3 числа × 2');
  if(vals.length===3&&vals.every(x=>x===2)) add('TWO_NUMBERS_X3','2 числа × 3');
  if(uniq.length===6&&uniq.every((x,i)=>x===i+1)) add('ALL_SIX_NUMBERS','Все шесть чисел');
  if(combo.every(x=>x%2===0)) add('ONLY_EVEN','Только чётные');
  if(combo.every(x=>x%2===1)) add('ONLY_ODD','Только нечётные');
  if(combo.every(x=>[1,2,3].includes(x))) add('ONLY_1_2_3','Числа 1, 2, 3');
  if(combo.every(x=>[4,5,6].includes(x))) add('ONLY_4_5_6','Числа 4, 5, 6');
  return cats;
}

export function checkPositions(predicted,actual){
  let n=0;
  for(let i=0;i<6;i++) if(Number(predicted?.[i])===Number(actual?.[i])) n++;
  return n;
}


export function evaluateForecast(forecast,actual,rules){
  const actualSum=Number(actual.sum??sumCombo(actual.combo));
  const cats=combinationCategories(actual.combo||[],rules);
  const oftenSums=forecast?.picks?.often?.sums||forecast?.final||[...(forecast?.v1||[]),...(forecast?.v2||[]),...(forecast?.v3||[])].slice(0,3);
  const valueSums=forecast?.picks?.value?.sums||[];
  const pay=s=>sumPayout(actualSum,rules);
  const comboKey=forecast?.comboPick?.key||null;
  const comboHit=Boolean(comboKey&&cats.some(c=>c.key===comboKey));
  return {
    actualSum,
    often:{sums:oftenSums,hit:oftenSums.includes(actualSum),payout:oftenSums.includes(actualSum)?pay():0},
    value:{sums:valueSums,hit:valueSums.includes(actualSum),payout:valueSums.includes(actualSum)?pay():0},
    combo:{key:comboKey,hit:comboHit,payout:comboHit?Number(rules?.combinationPayouts?.[comboKey]||0):0},
    finalHit:oftenSums.includes(actualSum),
    v1Hit:(forecast?.v1||[]).includes(actualSum),
    v2Hit:(forecast?.v2||[]).includes(actualSum),
    v3Hit:(forecast?.v3||[]).includes(actualSum),
    sumPayout:sumPayout(actualSum,rules),
    combinationCategories:cats
  };
}

export function calculateForecast(facts,targetAt){
  const often=[...PICKS.often.sums],value=[...PICKS.value.sums];
  return {
    modelVersion:MODEL_VERSION,
    targetAt,
    picks:{
      often:{label:PICKS.often.label,sums:often,chance:chanceOf(often),hint:PICKS.often.hint},
      value:{label:PICKS.value.label,sums:value,chance:chanceOf(value),hint:PICKS.value.hint}
    },
    comboPick:{key:COMBO_PICK.key,label:COMBO_PICK.label,hint:COMBO_PICK.hint},
    final:often,
    v1:[often[0]],v2:[often[1]],v3:[often[2]],
    locked:true
  };
}
