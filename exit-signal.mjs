// ⚠️ Сигнал ухода из центра 19–23. Считается в цикле до тиража и фиксируется вместе с прогнозом.
// Учится заново каждый цикл только на новом режиме (с 01.08.2026), поэтому подстраивается под свежие тиражи.
// Статус: на проверке — живой счёт копится в истории прогнозов.

export const EXIT_MODEL='EXIT-LOGIT-2026-10-28';
export const EXIT_FROM='2026-08-01';
export const LEFT_SUMS=[17,18];
export const RIGHT_SUMS=[24,25];
const CENTER=x=>x>=19&&x<=23;
const EDGE=x=>(x>=17&&x<=18)||(x>=24&&x<=25);
const WARN_SHARE=0.10; // горит примерно в 10% тиражей — самые «тревожные»

function weekday(at){const [y,m,d]=at.slice(0,10).split('-').map(Number);return new Date(Date.UTC(y,m-1,d)).getUTCDay()}

// Признаки тиража t по тиражам до него (s — суммы, f — факты, at — время тиража t).
function buildHelpers(f){
  const s=f.map(x=>x.sum),H=s.map(x=>CENTER(x)?1:0),N=f.length;
  const run=[],roll=[];
  {let L=0,A=0;for(let t=0;t<=N;t++){run.push([L,A]);if(t<N){if(H[t]){L++;A+=s[t]}else{L=0;A=0}}}}
  {let q=[],c=0;for(let t=0;t<=N;t++){roll.push(q.length?c/q.length:0.44);if(t<N){q.push(H[t]);c+=H[t];if(q.length>1344)c-=q.shift()}}}
  return {s,H,run,roll};
}
function features(f,h,t,at){
  const {s,run,roll}=h;const v=[];
  for(let j=1;j<=6;j++){const x=s[t-j];const z=(x-21)/4.2;v.push(z,z*z,CENTER(x)?1:0,EDGE(x)?1:0,x%2)}
  let a3=0;for(let j=1;j<=3;j++)a3+=s[t-j];v.push((a3-63)/7.2);
  let a6=0;for(let j=1;j<=6;j++)a6+=s[t-j];v.push((a6-126)/10.2);
  const [L,A]=run[t];v.push(Math.min(L,8)/4,A%2,(A%3)/2,L?1:0);
  const hr=+at.slice(11,13);for(let k=0;k<24;k++)v.push(hr===k?1:0);
  const d=weekday(at);for(let k=0;k<7;k++)v.push(d===k?1:0);
  const m={};for(const x of f[t-1].combo)m[x]=(m[x]||0)+1;const sig=Object.values(m).sort((a,b)=>b-a);
  v.push(sig[0]/6,sig.length/6);for(let b=1;b<=6;b++)v.push((m[b]||0)/2);
  v.push((roll[t]-0.44)*10);
  return v;
}
function logit(X,Y,it=300,lr=0.3,lam=1e-3){
  const d=X[0].length,n=X.length;const w=new Float64Array(d+1);
  for(let e=0;e<it;e++){const g=new Float64Array(d+1);
    for(let i=0;i<n;i++){const x=X[i];let z=w[d];for(let j=0;j<d;j++)z+=w[j]*x[j];const r=1/(1+Math.exp(-z))-Y[i];for(let j=0;j<d;j++)g[j]+=r*x[j];g[d]+=r}
    for(let j=0;j<d;j++)w[j]-=lr*(g[j]/n+lam*w[j]);w[d]-=lr*g[d]/n}
  return x=>{let z=w[d];for(let j=0;j<d;j++)z+=w[j]*x[j];return 1/(1+Math.exp(-z))};
}

// Сигнал на тираж targetAt по всем фактам до него.
export function computeExitWarning(allFacts,targetAt){
  const f=allFacts.filter(x=>x.at>=EXIT_FROM&&x.at<targetAt);
  if(f.length<500) return {model:EXIT_MODEL,on:false,reason:'мало данных'};
  const h=buildHelpers(f);const N=f.length;
  const X=[],Y=[],XS=[],YS=[];
  for(let t=8;t<N;t++){const x=features(f,h,t,f[t].at);X.push(x);Y.push(h.H[t]?0:1);if(!h.H[t]){XS.push(x);YS.push(f[t].sum<19?1:0)}}
  const pExit=logit(X,Y),pLeft=logit(XS,YS);
  const ref=X.map(pExit).sort((a,b)=>a-b);const threshold=ref[Math.floor(ref.length*(1-WARN_SHARE))];
  const x=features(f,h,N,targetAt);const p=pExit(x),pl=pLeft(x);
  const side=pl>=0.5?'left':'right';
  return {model:EXIT_MODEL,on:p>=threshold,p:+p.toFixed(4),threshold:+threshold.toFixed(4),side,sums:side==='left'?LEFT_SUMS:RIGHT_SUMS,pLeft:+pl.toFixed(3),trainedOn:X.length};
}

// Итог сигнала по факту.
export function exitOutcome(warn,actualSum){
  if(!warn?.on) return null;
  return {left:!CENTER(actualSum),hit:(warn.sums||[]).includes(actualSum)};
}
