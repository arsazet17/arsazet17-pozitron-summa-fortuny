
export const LAW = Object.freeze({
  chainLevels:[6,5,4,3,2],
  drawMinutes:[7,22,37,52],
  comboPositions:6,
  sumMin:6,
  sumMax:36,
  centerMin:19,
  centerMax:23,
  weights:Object.freeze({
    GLOBAL:0.2777,
    TRANS:0.2570,
    TIME:0.2362,
    DELTA:0.2136,
    PAIR:0.1966,
    D2:0.1564,
    JUMP:0.1351
  }),
  rankWeights:[1,0.75,0.50]
});

export const MODEL_VERSION='HARD-RANGE-JUMP-TRACK-2026-08-31';

export function sumCombo(combo){ return combo.reduce((a,x)=>a+Number(x||0),0); }
const pad=n=>String(n).padStart(2,'0');
const inRange=x=>Number.isInteger(Number(x))&&Number(x)>=LAW.sumMin&&Number(x)<=LAW.sumMax;

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
  const rows=[...meta.values()].filter(x=>inRange(x.value)).map(x=>({
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
  const v3Candidates=lowCoverage.filter(x=>x.frequency===minFrequency).sort((a,b)=>a.oldest.localeCompare(b.oldest)||a.value-b.value);
  const v3=v3Candidates.length?[v3Candidates[0].value]:[];
  rows.sort((a,b)=>b.coverage-a.coverage||b.frequency-a.frequency||a.value-b.value);
  return {rows,v1,v2,v3};
}

function freqRank(values,limit=3){
  const m=new Map();
  values.filter(inRange).forEach((v,i)=>{
    const n=Number(v);
    if(!m.has(n)) m.set(n,{value:n,count:0,lastIndex:-1,firstIndex:i});
    const x=m.get(n); x.count++; x.lastIndex=i;
  });
  return [...m.values()]
    .sort((a,b)=>b.count-a.count||b.lastIndex-a.lastIndex||a.value-b.value)
    .slice(0,limit)
    .map(x=>x.value);
}

function continuationsByPredicate(hist,predicate){
  const out=[];
  for(let i=0;i<hist.length-1;i++){
    if(predicate(hist,i)) out.push(hist[i+1].sum);
  }
  return out;
}

function deltaSeries(hist){
  const out=[];
  for(let i=1;i<hist.length;i++) out.push(hist[i].sum-hist[i-1].sum);
  return out;
}

function jumpClass(d){
  if(d>=10) return 'UP_GE10';
  if(d<=-10) return 'DOWN_GE10';
  if(d>=6) return 'UP_6_9';
  if(d<=-6) return 'DOWN_6_9';
  if(d>0) return 'UP_1_5';
  if(d<0) return 'DOWN_1_5';
  return 'FLAT';
}

function stateToken(d){
  if(d>=10) return 'U10';
  if(d<=-10) return 'D10';
  if(d>=1) return 'U';
  if(d<=-1) return 'D';
  return '0';
}

function familyPayload(name,candidates,meta={}){
  return {name,candidates:[...new Set((candidates||[]).filter(inRange))].slice(0,3),...meta};
}

export function calculateFamilies(facts,targetAt){
  const hist=facts.filter(x=>x.at<targetAt).sort((a,b)=>a.at.localeCompare(b.at));
  const last=hist.at(-1);
  const prev=hist.at(-2);
  const deltas=deltaSeries(hist);
  const currentDelta=deltas.at(-1);
  const previousDelta=deltas.at(-2);
  const targetTime=targetAt.slice(11,16);

  const globalValues=hist.map(x=>x.sum);
  const timeValues=hist.filter(x=>x.at.slice(11,16)===targetTime).map(x=>x.sum);
  const transValues=last ? continuationsByPredicate(hist,(h,i)=>h[i].sum===last.sum) : [];
  const deltaValues=Number.isFinite(currentDelta)
    ? continuationsByPredicate(hist,(h,i)=>i>=1&&(h[i].sum-h[i-1].sum)===currentDelta)
    : [];
  const pairValues=(prev&&last)
    ? continuationsByPredicate(hist,(h,i)=>i>=1&&h[i-1].sum===prev.sum&&h[i].sum===last.sum)
    : [];

  const d2Values=(Number.isFinite(previousDelta)&&Number.isFinite(currentDelta))
    ? continuationsByPredicate(hist,(h,i)=>{
        if(i<2) return false;
        const d1=h[i-1].sum-h[i-2].sum;
        const d2=h[i].sum-h[i-1].sum;
        return d1===previousDelta&&d2===currentDelta;
      })
    : [];

  const jc=Number.isFinite(currentDelta)?jumpClass(currentDelta):null;
  const jumpValues=jc
    ? continuationsByPredicate(hist,(h,i)=>{
        if(i<1) return false;
        return jumpClass(h[i].sum-h[i-1].sum)===jc;
      })
    : [];

  const tokens=deltas.map(stateToken);
  let stateValues=[];
  let stateLevel=null;
  for(const n of [3,2]){
    if(tokens.length<n) continue;
    const target=tokens.slice(-n);
    const out=[];
    for(let i=n-1;i<tokens.length-1;i++){
      if(eq(tokens.slice(i-n+1,i+1),target)) out.push(hist[i+2].sum);
    }
    if(out.length){ stateValues=out; stateLevel=n; break; }
  }

  return {
    GLOBAL:familyPayload('GLOBAL',freqRank(globalValues),{sample:globalValues.length}),
    TIME:familyPayload('TIME',freqRank(timeValues),{sample:timeValues.length,targetTime}),
    TRANS:familyPayload('TRANS',freqRank(transValues),{sample:transValues.length,from:last?.sum??null}),
    DELTA:familyPayload('DELTA',freqRank(deltaValues),{sample:deltaValues.length,delta:currentDelta??null}),
    JUMP:familyPayload('JUMP',freqRank(jumpValues),{sample:jumpValues.length,jumpClass:jc}),
    PAIR:familyPayload('PAIR',freqRank(pairValues),{sample:pairValues.length,pair:prev&&last?[prev.sum,last.sum]:[]}),
    D2:familyPayload('D2',freqRank(d2Values),{sample:d2Values.length,d2:[previousDelta,currentDelta].filter(Number.isFinite)}),
    STATE:familyPayload('STATE',freqRank(stateValues),{sample:stateValues.length,stateLevel,state:stateLevel?tokens.slice(-stateLevel):[]})
  };
}

export function calculateJumpTrack(facts,targetAt){
  const hist=facts.filter(x=>x.at<targetAt).sort((a,b)=>a.at.localeCompare(b.at));
  const deltas=deltaSeries(hist);
  const d=deltas.at(-1);
  const prev=deltas.at(-2);
  if(!Number.isFinite(d)) return {delta:null,absDelta:null,jumpState:'NONE',direction:'NONE',d2:[],chain:[]};

  const exactNext=continuationsByPredicate(hist,(h,i)=>i>=1&&(h[i].sum-h[i-1].sum)===d);
  const absNext=continuationsByPredicate(hist,(h,i)=>i>=1&&Math.abs(h[i].sum-h[i-1].sum)===Math.abs(d));
  const classNext=continuationsByPredicate(hist,(h,i)=>i>=1&&jumpClass(h[i].sum-h[i-1].sum)===jumpClass(d));

  let reversals=0, continuations=0, bigReversals=0, bigContinuations=0, n=0;
  for(let i=1;i<hist.length-1;i++){
    const hd=hist[i].sum-hist[i-1].sum;
    if(jumpClass(hd)!==jumpClass(d)) continue;
    const nd=hist[i+1].sum-hist[i].sum;
    n++;
    if(hd>0&&nd<0 || hd<0&&nd>0) reversals++;
    if(hd>0&&nd>0 || hd<0&&nd<0) continuations++;
    if(hd>0&&nd<=-6 || hd<0&&nd>=6) bigReversals++;
    if(hd>0&&nd>=6 || hd<0&&nd<=-6) bigContinuations++;
  }

  const sign=d===0?'FLAT':d>0?'UP':'DOWN';
  const prevSign=!Number.isFinite(prev)?'NONE':prev===0?'FLAT':prev>0?'UP':'DOWN';
  const relation=prevSign==='NONE'?'NONE':sign==='FLAT'?'FLAT':prevSign===sign?'CONTINUATION':'REVERSAL';

  return {
    delta:d,
    exactDelta:d,
    absDelta:Math.abs(d),
    jumpState:jumpClass(d),
    relation,
    direction:sign,
    d2:[prev,d].filter(Number.isFinite),
    chain:deltas.slice(-6),
    exact:{n:exactNext.length,leaders:freqRank(exactNext,8)},
    abs:{n:absNext.length,leaders:freqRank(absNext,8)},
    classStats:{
      n,
      reversalPct:n?reversals*100/n:0,
      continuationPct:n?continuations*100/n:0,
      bigReversalPct:n?bigReversals*100/n:0,
      bigContinuationPct:n?bigContinuations*100/n:0,
      leaders:freqRank(classNext,8)
    }
  };
}

function weightedScores(families){
  const rows=new Map();
  for(const [name,w] of Object.entries(LAW.weights)){
    const vals=families[name]?.candidates||[];
    vals.forEach((v,i)=>{
      if(i>=LAW.rankWeights.length) return;
      if(!rows.has(v)) rows.set(v,{value:v,score:0,support:[]});
      const x=rows.get(v);
      x.score+=w*LAW.rankWeights[i];
      x.support.push(`${name}#${i+1}`);
    });
  }
  return [...rows.values()].sort((a,b)=>b.score-a.score||b.support.length-a.support.length||a.value-b.value);
}

function rawSupport(methods,value){
  const routes=[];
  let rawfreq=0;
  for(const [name,res] of Object.entries(methods||{})){
    const hits=(res.matches||[]).filter(m=>Number(m.value)===Number(value));
    if(hits.length){ routes.push(name); rawfreq+=hits.length; }
  }
  return {routes,coverage:routes.length,rawfreq};
}

function outsideSupport(value,families,methods,jumpTrack){
  const blocks=[];
  for(const [name,p] of Object.entries(families||{})){
    const idx=(p.candidates||[]).indexOf(value);
    if(idx>=0) blocks.push(`${name}#${idx+1}`);
  }
  for(const r of rawSupport(methods,value).routes) blocks.push(`RAW ${r}`);
  if(jumpTrack?.exact?.leaders?.includes(value)) blocks.push(`exact Δ${jumpTrack.delta>=0?'+':''}${jumpTrack.delta}`);
  if(jumpTrack?.abs?.leaders?.includes(value)) blocks.push(`|Δ|${jumpTrack.absDelta}`);
  return [...new Set(blocks)];
}

export function selectHardRange(families,methods,jumpTrack){
  const scores=weightedScores(families);
  const weightedBase=scores.slice(0,3).map(x=>x.value);
  let final=[...weightedBase];
  const replacements=[];

  if(final.length===3 && final.every(x=>x>=LAW.centerMin&&x<=LAW.centerMax)){
    const weakest=final.at(-1);
    const outside=scores
      .filter(x=>x.value<LAW.centerMin||x.value>LAW.centerMax)
      .map(x=>({...x,blocks:outsideSupport(x.value,families,methods,jumpTrack)}));
    const strong2=outside.filter(x=>x.blocks.length>=2)
      .sort((a,b)=>b.score-a.score||b.blocks.length-a.blocks.length||a.value-b.value);
    const strong1=outside.filter(x=>x.blocks.length>=1)
      .sort((a,b)=>b.score-a.score||b.blocks.length-a.blocks.length||a.value-b.value);
    const chosen=strong2[0]||strong1[0];
    if(chosen){
      final[2]=chosen.value;
      replacements.push({type:'HARD_RANGE_CENTER_EXIT',from:weakest,to:chosen.value,blocks:chosen.blocks});
    }
  }

  const spread=final.length===3?Math.max(...final)-Math.min(...final):null;
  if(final.length===3 && Math.abs(Number(jumpTrack?.delta))>=10 && spread<=4){
    const delta1=families.DELTA?.candidates?.[0];
    if(inRange(delta1) && !final.includes(delta1)){
      const blocks=outsideSupport(delta1,families,methods,jumpTrack);
      if(blocks.length>=2){
        const weakestRow=final
          .map((v,i)=>({v,i,score:scores.find(x=>x.value===v)?.score??0}))
          .sort((a,b)=>a.score-b.score||b.i-a.i)[0];
        final[weakestRow.i]=delta1;
        replacements.push({type:'JUMP_CLUSTER',from:weakestRow.v,to:delta1,blocks});
      }
    }
  }

  const selector=replacements.some(x=>x.type==='JUMP_CLUSTER')
    ?'HARD RANGE · JUMP-CLUSTER · FULL 6–36'
    :'HARD RANGE · FULL 6–36 · NO CENTER-LOCK';
  return {
    selector,
    weightedScores:scores,
    weightedBase,
    final,
    spread:final.length===3?Math.max(...final)-Math.min(...final):null,
    replacements
  };
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
        matches.sort((a,b)=>b.at.localeCompare(a.at));
        chosen={position:pos+1,level:n,chain:target,value:matches[0].value,at:matches[0].at};
        break;
      }
    }
    if(!chosen) return {complete:false,positions,failedPosition:pos+1,reason:`Нет совпадения даже 2/2 по позиции ${pos+1}`};
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
  if(tail[0]?.status==='U') return {signal:[],label:'НЕТ СТАТИСТИЧЕСКОГО СИГНАЛА',reason:'Последние факты незаскоренные: прогноз заранее не фиксировался'};
  return {signal:[],label:'НЕТ СТАТИСТИЧЕСКОГО СИГНАЛА',reason:'Нет завершённого точного аналога по доступному журналу заранее зафиксированных прогнозов'};
}

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
  const methods=forecast.methods||{};
  const rawHits=Object.entries(methods)
    .filter(([,r])=>(r.matches||[]).some(x=>Number(x.value)===actualSum))
    .map(([name])=>name);
  const final=forecast.final||[...(forecast.v1||[]),...(forecast.v2||[]),...(forecast.v3||[])].slice(0,3);
  const posMatches=forecast.combo?.complete?checkPositions(forecast.combo.combo,actual.combo):0;
  return {
    actualSum,
    rawHits,
    finalHit:final.includes(actualSum),
    v1Hit:(forecast.v1||[]).includes(actualSum),
    v2Hit:(forecast.v2||[]).includes(actualSum),
    v3Hit:(forecast.v3||[]).includes(actualSum),
    comboHit:Boolean(forecast.combo?.complete&&forecast.combo.sum===actualSum),
    statsHit:Boolean((forecast.stats?.signal||[]).includes(actualSum)),
    posMatches,
    sumPayout:sumPayout(actualSum,rules),
    combinationCategories:combinationCategories(actual.combo,rules),
    positionPayout:positionPayout(posMatches,rules)
  };
}

export function auditActualAgainstForecast(forecast,actual,facts){
  const actualSum=Number(actual.sum??sumCombo(actual.combo));
  const final=forecast.final||[...(forecast.v1||[]),...(forecast.v2||[]),...(forecast.v3||[])].slice(0,3);
  const familyHits=[];
  for(const [name,p] of Object.entries(forecast.families||{})){
    if((p.candidates||[]).includes(actualSum)) familyHits.push(name);
  }
  const raw=rawSupport(forecast.methods||{},actualSum);
  const hasFullFamilies=Boolean(forecast?.families && forecast?.modelVersion===MODEL_VERSION);
  const classification=final.includes(actualSum)
    ? 'HIT'
    : raw.rawfreq>0
      ? 'SELECTOR-MISS / DEEP-RAW'
      : familyHits.length
        ? 'SELECTOR-MISS / FAMILY'
        : hasFullFamilies
          ? 'STRUCTURAL BLIND'
          : 'LEGACY / FAMILY-NOT-RECORDED';
  const hist=[...(facts||[])].filter(x=>x.at<=actual.at).sort((a,b)=>a.at.localeCompare(b.at));
  const jt=calculateJumpTrack(hist,nextScheduledAfter(actual.at));
  const center30=hist.slice(-30).filter(x=>x.sum>=LAW.centerMin&&x.sum<=LAW.centerMax).length;
  return {
    frozen:final,
    fact:actualSum,
    hit:final.includes(actualSum),
    position:final.indexOf(actualSum)+1||0,
    familyHits,
    rawRoutes:raw.routes,
    coverage:raw.coverage,
    rawfreq:raw.rawfreq,
    classification,
    currentDelta:jt.delta,
    jumpState:jt.jumpState,
    relation:jt.relation,
    d2:jt.d2,
    center19_23_30:center30,
    workOnErrors:classification==='HIT'
      ? 'Попадание подтверждено; не продлевать state-break автоматически.'
      : classification==='SELECTOR-MISS / DEEP-RAW'
        ? 'Факт был в полном RAW: ошибка selector, не structural. Усилить контроль сжатия и family-support только вперёд.'
        : classification==='SELECTOR-MISS / FAMILY'
          ? 'Факт был в FAMILY, но отсутствовал в полном RAW/final: проверить ранжирование family и weighted gate только вперёд.'
          : classification==='STRUCTURAL BLIND'
            ? 'Факт отсутствовал и в FAMILY, и в полном RAW: structural blind; проверить TIME/TRANS/DELTA/JUMP/PAIR/D2/STATE без post-fact подгонки.'
            : 'Legacy frozen создан до внедрения FAMILY: structural blind не присваивать без недостающих pre-fact данных.'
  };
}

export function calculateForecast(facts,targetAt,ledger){
  const four=calculateFourMethods(facts,targetAt);
  const strict=selectVariants(four.methods);
  const families=calculateFamilies(facts,targetAt);
  const jumpTrack=calculateJumpTrack(facts,targetAt);
  const hard=selectHardRange(families,four.methods,jumpTrack);
  const final=hard.final;
  return {
    modelVersion:MODEL_VERSION,
    targetAt,
    verticalChain:four.verticalChain,
    horizontalChain:four.horizontalChain,
    methods:four.methods,
    strictRaw:{v1:strict.v1,v2:strict.v2,v3:strict.v3,rows:strict.rows},
    variantRows:strict.rows,
    families,
    jumpTrack,
    weightedBase:hard.weightedBase,
    weightedScores:hard.weightedScores,
    rangeReplacement:hard.replacements,
    selector:hard.selector,
    final,
    v1:final[0]!=null?[final[0]]:[],
    v2:final[1]!=null?[final[1]]:[],
    v3:final[2]!=null?[final[2]]:[],
    combo:calculateCombo(facts,targetAt),
    repeats:calculateRepeats(facts,targetAt),
    stats:calculateStatsSignal(ledger),
    locked:true
  };
}
