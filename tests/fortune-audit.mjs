import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {selectHardRange} from '../engine.js';

const families={
  GLOBAL:{candidates:[20,21,22]}, TRANS:{candidates:[20,21,22]},
  TIME:{candidates:[20,21,22]}, PAIR:{candidates:[20,21,22]},
  DELTA:{candidates:[19,20,21]}, D2:{candidates:[18]},
  JUMP:{candidates:[18]}, STATE:{candidates:[19]}
};
const centered=values=>values.length===3&&values.every(x=>x>=19&&x<=23);
const base=selectHardRange(families,{}, {delta:0});
assert.deepEqual(base.final,[20,21,18]);
const jump=selectHardRange(families,{}, {delta:10});
assert.deepEqual(jump.final,base.final,'jump correction must preserve center exit');
assert.equal(centered(jump.final),false);
const permitted=selectHardRange({...families,DELTA:{candidates:[17,20,21]},STATE:{candidates:[17]}},{},{delta:10});
assert.ok(permitted.replacements.some(x=>x.type==='JUMP_CLUSTER'&&x.to===17),'valid jump correction must still run');

for(const rejected of [true,false]){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fortune-audit-'));
  try{
    fs.mkdirSync(path.join(dir,'scripts'));
    fs.mkdirSync(path.join(dir,'data'));
    fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');
    fs.copyFileSync('engine.js',path.join(dir,'real-engine.js'));
    fs.copyFileSync('scripts/fortune-cycle.mjs',path.join(dir,'scripts/fortune-cycle.mjs'));
    const final=rejected?[19,20,21]:[18,20,21];
    fs.writeFileSync(path.join(dir,'engine.js'),`export * from './real-engine.js';
import {MODEL_VERSION} from './real-engine.js';
export function calculateForecast(facts,targetAt){
 const final=${JSON.stringify(final)};
 return {modelVersion:MODEL_VERSION,targetAt,methods:{},combo:{complete:false},
  v1:[final[0]],v2:[final[1]],v3:[final[2]],final,weightedBase:[...final],
  families:Object.fromEntries(['GLOBAL','TIME','TRANS','DELTA','JUMP','PAIR','D2','STATE'].map(k=>[k,{}])),
  strictRaw:{},jumpTrack:{},selector:'test'};
}`);
    const write=(name,value)=>fs.writeFileSync(path.join(dir,'data',name),JSON.stringify(value));
    fs.writeFileSync(path.join(dir,'data/fortune-archive.csv'),'Номер тиража,Дата,Шары\n012512,26.09.26, 11:37,1,+,2,+,3,+,4,+,5,+,6\n');
    write('current-forecast.json',{targetAt:'2026-09-26T11:52'});
    write('forecast-history.json',[]);
    write('forecast-ledger.json',{recent:[]});
    write('rules.json',{});
    const lucky=path.join(dir,'lucky.json');
    fs.writeFileSync(lucky,JSON.stringify({docs:[{number:12513,date:'2026-09-26T08:52:00Z',played:[3,6,6,6,2,2].map((ball,i)=>({lototronId:i,balls:[ball]}))}]}));
    const result=spawnSync(process.execPath,[path.join(dir,'scripts/fortune-cycle.mjs'),dir],{
      encoding:'utf8',env:{...process.env,LUCKY_PAGE_FILE:lucky,NOW_ISO:'2026-09-26T09:00:00Z'}
    });
    assert.equal(result.status,0,result.stdout+result.stderr);
    const read=name=>JSON.parse(fs.readFileSync(path.join(dir,'data',name),'utf8'));
    assert.match(fs.readFileSync(path.join(dir,'data/fortune-archive.csv'),'utf8'),/012513/);
    assert.ok(read('forecast-ledger.json').recent.some(x=>x.at==='2026-09-26T11:52'&&x.status==='U'));
    if(rejected){
      assert.equal(read('current-forecast.json'),null);
      assert.deepEqual(read('forecast-history.json'),[]);
      assert.match(result.stderr,/FORECAST_REJECTED.*CENTER-LOCK/);
    }else{
      assert.deepEqual(read('current-forecast.json').final,final);
      assert.equal(read('current-forecast.json').locked,true);
      assert.equal(read('forecast-history.json').length,1);
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
console.log('Fortune center-exit and rejected/accepted forecast persistence: PASS');
