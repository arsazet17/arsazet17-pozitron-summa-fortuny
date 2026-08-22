
export const LAW = Object.freeze({
  chainLevels:[6,5,4,3,2],
  drawMinutes:[7,22,37,52],
  comboPositions:6
});

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

const eq=(a,b)=>a.length===b.length&&a.every((x,i)=>Number(x)===Number(b[i]));

function scan(chain,items){
  const found=[];
  const vals=items.map(x=>Number(x.value));
  for(let i=0;i+chain.length<vals.length;i++){
    if(eq(vals.slice(i,i+chain.length),chain)){
      const cont=items[i+chain.length];
      found.push({value:Number(cont.value),at:cont.at,matchStart:items[i].at});
    }
  }
  return found;
}

function firstLevel(chain,sequences){
  for(const n of LAW.chainLevels){
    if(chain.length<n) continue;
    const target=chain.slice(chain.length-n);
    const matches=[];
    for(const seq of sequences){
      for(const m of scan(target,seq.items)) matches.push({...m,source:seq.source});
    }
    if(matches.length) return {level:n,chain:target,matches};
  }
  return {level:null,chain:[],matches:[]};
}

function verticalSequences(facts,selector=d=>d.sum){
  const map=new Map();
  for(const f of facts){
    const key=f.at.slice(11,16);
    if(!map.has(key)) map.set(key,[]);
    map.get(key).push({value:selector(f),at:f.at});
  }
  return [...map].map(([k,items])=>({
    source:`V:${k}`,
    items:items.sort((a,b)=>a.at.localeCompare(b.at))
  }));
}

function horizontalSequences(facts,selector=d=>d.sum){
  const map=new Map();
  for(const f of facts){
    const key=f.at.slice(0,10);
    if(!map.has(key)) map.set(key,[]);
    map.get(key).push({value:selector(f),at:f.at});
  }
  return [...map].map(([k,items])=>({
    source:`H:${k}`,
    items:items.sort((a,b)=>a.at.localeCompare(b.at))
  }));
}

export function calculateFourMethods(facts,targetAt){
  const hist=facts.filter(x=>x.at<targetAt).sort((a,b)=>a.at.localeCompare(b.at));
  const targetTime=targetAt.slice(11,16);
  const verticalChain=hist.filter(x=>x.at.slice(11,16)===targetTime).slice(-6).map(x=>x.sum);
  const horizontalChain=hist.slice(-6).map(x=>x.sum);
  const V=verticalSequences(hist), H=horizontalSequences(hist);
  return {
    verticalChain,
    horizontalChain,
    methods:{
      'В→В':firstLevel(verticalChain,V),
      'В→Г':firstLevel(verticalChain,H),
      'Г→В':firstLevel(horizontalChain,V),
      'Г→Г':firstLevel(horizontalChain,H)
    }
  };
}

export function selectVariants(methods){
  const meta=new Map();
  for(const [method,res] of Object.entries(methods)){
    for(const m of res.matches){
      if(!meta.has(m.value)) meta.set(m.value,{value:m.value,methods:new Set(),frequency:0,oldest:m.at});
      const x=meta.get(m.value);
      x.methods.add(method);
      x.frequency++;
      if(m.at<x.oldest) x.oldest=m.at;
    }
  }

  const rows=[...meta.values()].map(x=>({
    value:x.value,
    coverage:x.methods.size,
    frequency:x.frequency,
    oldest:x.oldest,
    methods:[...x.methods]
  }));

  if(!rows.length) return {rows,v1:[],v2:[],v3:[]};

  const maxCoverage=Math.max(...rows.map(x=>x.coverage));
  const covLeaders=rows.filter(x=>x.coverage===maxCoverage);
  const maxFrequencyWithinCoverage=Math.max(...covLeaders.map(x=>x.frequency));
  const v1=covLeaders.filter(x=>x.frequency===maxFrequencyWithinCoverage).map(x=>x.value).sort((a,b)=>a-b);

  const maxFrequency=Math.max(...rows.map(x=>x.frequency));
  const v2=rows.filter(x=>x.frequency===maxFrequency).map(x=>x.value).sort((a,b)=>a-b);

  const minCoverage=Math.min(...rows.map(x=>x.coverage));
  const lowCoverage=rows.filter(x=>x.coverage===minCoverage);
  const minFrequency=Math.min(...lowCoverage.map(x=>x.frequency));
  const v3Candidates=lowCoverage.filter(x=>x.frequency===minFrequency).sort((a,b)=>a.oldest.localeCompare(b.oldest));
  const v3=v3Candidates.length?[v3Candidates[0].value]:[];

  rows.sort((a,b)=>b.coverage-a.coverage||b.frequency-a.frequency||a.value-b.value);
  return {rows,v1,v2,v3};
}

export function calculateCombo(facts,targetAt){
  const hist=facts.filter(x=>x.at<targetAt).sort((a,b)=>a.at.localeCompare(b.at));
  const last6=hist.slice(-6);
  if(last6.length<6) return {complete:false,positions:[],reason:'Недостаточно 6 фактов'};

  const positions=[];
  for(let pos=0;pos<6;pos++){
    const chain=last6.map(x=>Number(x.combo[pos]));
    const items=hist.map(x=>({value:Number(x.combo[pos]),at:x.at}));
    let chosen=null;

    for(const n of LAW.chainLevels){
      const target=chain.slice(6-n);
      const matches=scan(target,items);
      if(matches.length){
        matches.sort((a,b)=>b.at.localeCompare(a.at)); // самое свежее историческое продолжение
        chosen={position:pos+1,level:n,chain:target,value:matches[0].value,at:matches[0].at};
        break;
      }
    }

    if(!chosen) return {
      complete:false,
      positions,
      failedPosition:pos+1,
      reason:`Нет совпадения даже 2/2 по позиции ${pos+1}`
    };

    positions.push(chosen);
  }

  const combo=positions.map(x=>x.value);
  return {complete:true,positions,combo,sum:sumCombo(combo)};
}

function wallShift(at,days=0,minutes=0){
  const [d,t]=at.split('T');
  const [Y,M,D]=d.split('-').map(Number),[h,m]=t.split(':').map(Number);
  const x=new Date(Y,M-1,D+days,h,m+minutes);
  return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export function calculateRepeats(facts,targetAt){
  const hist=facts.filter(x=>x.at<targetAt).sort((a,b)=>a.at.localeCompare(b.at));
  const byAt=new Map(facts.map(x=>[x.at,x]));
  return {
    NEXT:hist.at(-1)?.sum??null,
    SKIP1:hist.at(-2)?.sum??null,
    SAME1:byAt.get(wallShift(targetAt,-1,0))?.sum??null,
    SAME2:byAt.get(wallShift(targetAt,-2,0))?.sum??null,
    DIAG_R:byAt.get(wallShift(targetAt,-1,-15))?.sum??null,
    DIAG_L:byAt.get(wallShift(targetAt,-1,15))?.sum??null
  };
}

export function calculateStatsSignal(ledger){
  const recent=ledger?.recent||[];
  if(!recent.length) return {signal:[],label:'НЕТ СТАТИСТИЧЕСКОГО СИГНАЛА',reason:'Нет зафиксированной истории прогнозов'};

  const tail=recent.slice(-1);
  if(tail[0]?.status==='U'){
    return {
      signal:[],
      label:'НЕТ СТАТИСТИЧЕСКОГО СИГНАЛА',
      reason:'Последние факты незаскоренные: прогноз заранее не фиксировался'
    };
  }

  return {
    signal:[],
    label:'НЕТ СТАТИСТИЧЕСКОГО СИГНАЛА',
    reason:'Нет завершённого точного аналога по доступному журналу заранее зафиксированных прогнозов'
  };
}

export function sumPayout(sum,rules){
  return Number(rules?.sumPayouts?.[String(sum)]||0);
}

export function positionPayout(matches,rules){
  return Number(rules?.positionPayouts?.[String(matches)]||0);
}

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
  if(vals.length===3&&vals.every(x=>x===2)) add('THREE_NUMBERS_X2','3 числа × 2 раза');
  if(vals.length===2&&vals.every(x=>x===3)) add('TWO_NUMBERS_X3','2 числа × 3 раза');
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
  const rawHits=Object.entries(forecast.methods||{})
    .filter(([,r])=>r.matches.some(x=>Number(x.value)===actualSum))
    .map(([name])=>name);

  const posMatches=forecast.combo.complete?checkPositions(forecast.combo.combo,actual.combo):0;
  return {
    actualSum,
    rawHits,
    v1Hit:(forecast.v1||[]).includes(actualSum),
    v2Hit:(forecast.v2||[]).includes(actualSum),
    v3Hit:(forecast.v3||[]).includes(actualSum),
    comboHit:forecast.combo.complete&&forecast.combo.sum===actualSum,
    statsHit:(forecast.stats.signal||[]).includes(actualSum),
    posMatches,
    sumPayout:sumPayout(actualSum,rules),
    combinationCategories:combinationCategories(actual.combo,rules),
    positionPayout:positionPayout(posMatches,rules)
  };
}

export function calculateForecast(facts,targetAt,ledger){
  const four=calculateFourMethods(facts,targetAt);
  const variants=selectVariants(four.methods);
  return {
    targetAt,
    verticalChain:four.verticalChain,
    horizontalChain:four.horizontalChain,
    methods:four.methods,
    variantRows:variants.rows,
    v1:variants.v1,
    v2:variants.v2,
    v3:variants.v3,
    combo:calculateCombo(facts,targetAt),
    repeats:calculateRepeats(facts,targetAt),
    stats:calculateStatsSignal(ledger),
    locked:true
  };
}
