import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {calculateForecast,evaluateForecast,combinationCategories,SUM_CHANCE,chanceOf,PICKS} from '../engine.js';

// Вероятности сумм шести шаров: сумма = 1, симметрия, пик на 21.
const total=Object.values(SUM_CHANCE).reduce((a,b)=>a+b,0);
assert.ok(Math.abs(total-1)<1e-12);
assert.equal(SUM_CHANCE[6],1/46656);
assert.ok(SUM_CHANCE[21]>SUM_CHANCE[20]&&SUM_CHANCE[20]===SUM_CHANCE[22]);
assert.ok(Math.abs(chanceOf(PICKS.often.sums)-0.2738)<0.001);

// Прогноз: два набора, без HARD RANGE (центр 20/21/22 разрешён).
const f=calculateForecast([], '2026-09-26T11:52');
assert.deepEqual(f.picks.often.sums,[20,21,22]);
assert.deepEqual(f.picks.value.sums,[19,21,23]);
assert.deepEqual(f.final,[20,21,22]);
const rules={ticketPrice:550,sumPayouts:{"21":3850,"19":4400},combinationPayouts:{FOUR_SAME:6600,THREE_NUMBERS_X2:27500,TWO_NUMBERS_X3:7700}};
const ev=evaluateForecast(f,{combo:[3,3,4,4,6,1]},rules);
assert.equal(ev.actualSum,21);
assert.equal(ev.often.hit,true);assert.equal(ev.value.hit,true);
assert.equal(ev.often.payout,3850);assert.equal(ev.combo.hit,false);
const ev2=evaluateForecast(f,{combo:[6,1,6,1,6,6]},rules);
assert.equal(ev2.combo.hit,true);assert.equal(ev2.combo.payout,6600);
// Категории по настоящим правилам лотереи.
const keys=c=>combinationCategories(c,rules).map(x=>x.key);
assert.deepEqual(keys([5,1,1,5,5,1]),['THREE_NUMBERS_X2'],'3 числа × 2 = два числа по три');
assert.deepEqual(keys([4,4,6,2,6,2]),['TWO_NUMBERS_X3'],'2 числа × 3 = три числа по два');
assert.equal(evaluateForecast(f,{combo:[1,1,2,2,6,6]},rules).combo.hit,false);

// Полный цикл на временной папке: факт проверяет зафиксированный прогноз и фиксирует следующий.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fortune-audit-'));
try{
  fs.mkdirSync(path.join(dir,'scripts'));fs.mkdirSync(path.join(dir,'data'));
  fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');
  fs.copyFileSync('engine.js',path.join(dir,'engine.js'));
  fs.copyFileSync('scripts/fortune-cycle.mjs',path.join(dir,'scripts/fortune-cycle.mjs'));
  fs.copyFileSync('scripts/history-compact.mjs',path.join(dir,'scripts/history-compact.mjs'));
  fs.copyFileSync('exit-signal.mjs',path.join(dir,'exit-signal.mjs'));
  const write=(name,value)=>fs.writeFileSync(path.join(dir,'data',name),JSON.stringify(value));
  fs.writeFileSync(path.join(dir,'data/fortune-archive.csv'),'Номер тиража,Дата,Шары\n012512,26.09.26, 11:37,1,+,2,+,3,+,4,+,5,+,6\n');
  const fixed=calculateForecast([], '2026-09-26T11:52');fixed.fixedAt='2026-09-26T08:40:00Z';
  write('current-forecast.json',fixed);
  write('forecast-history.json',[{targetAt:'2026-09-26T11:52',fixedAt:fixed.fixedAt,checked:false,forecast:fixed}]);
  write('forecast-ledger.json',{recent:[],algorithmTracking:[{big:true}]});
  write('rules.json',rules);
  const lucky=path.join(dir,'lucky.json');
  fs.writeFileSync(lucky,JSON.stringify({docs:[{number:12513,date:'2026-09-26T08:52:00Z',played:[3,6,6,2,2,2].map((ball,i)=>({lototronId:i,balls:[ball]}))}]}));
  const result=spawnSync(process.execPath,[path.join(dir,'scripts/fortune-cycle.mjs'),dir],{encoding:'utf8',env:{...process.env,LUCKY_PAGE_FILE:lucky,NOW_ISO:'2026-09-26T09:00:00Z'}});
  assert.equal(result.status,0,result.stdout+result.stderr);
  const read=name=>JSON.parse(fs.readFileSync(path.join(dir,'data',name),'utf8'));
  const hist=read('forecast-history.json');
  assert.equal(hist[0].checked,true);
  assert.equal(hist[0].result.actualSum,21);
  assert.equal(hist[0].result.oftenHit,true);
  assert.equal(hist[0].result.valueHit,true);
  assert.equal(hist.length,2,'следующий прогноз зафиксирован');
  assert.equal(read('current-forecast.json').targetAt,'2026-09-26T12:07');
  const cur=read('current-forecast.json');
  assert.equal(cur.exitWarn?.on,false,'сигнал ухода посчитан (мало данных — не горит)');
  assert.equal(cur.exitWarn?.score?.n,0);
  const led=read('forecast-ledger.json');
  assert.equal(led.algorithmTracking,undefined,'тяжёлое слежение удалено');
  assert.ok(led.recent.some(x=>x.at==='2026-09-26T11:52'&&x.status==='H'&&x.valueHit===true));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log('Fortune two-picks engine and cycle: PASS');
