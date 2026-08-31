import fs from 'node:fs';
import path from 'node:path';
import {
  parseLuckyCsv,
  nextScheduledAfter,
  calculateForecast,
  evaluateForecast,
  auditActualAgainstForecast,
  MODEL_VERSION
} from '../engine.js';

const ROOT = path.resolve(process.argv[2] || process.cwd());
const DATA = path.join(ROOT, 'data');
const ARCHIVE = path.join(DATA, 'fortune-archive.csv');
const RULES = path.join(DATA, 'rules.json');
const LEDGER = path.join(DATA, 'forecast-ledger.json');
const HISTORY = path.join(DATA, 'forecast-history.json');
const CURRENT = path.join(DATA, 'current-forecast.json');
const LUCKY_PAGE = process.env.LUCKY_PAGE_FILE || '/tmp/fortune-page1.json';

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return structuredClone(fallback); }
};

const writeJson = (file, value) => {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
};

const nowDate = () => process.env.NOW_ISO ? new Date(process.env.NOW_ISO) : new Date();

function moscowParts(iso) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d);
  const get = t => parts.find(p => p.type === t)?.value;
  return {date:`${get('day')}.${get('month')}.${get('year')}`,time:`${get('hour')}:${get('minute')}`};
}

function ballsOf(doc) {
  const byPos = new Map((doc.played || []).map(x => [Number(x.lototronId), Number(x.balls?.[0])]));
  return [0,1,2,3,4,5].map(i => byPos.get(i));
}

function mergeLuckyPage() {
  if (!fs.existsSync(LUCKY_PAGE)) {
    console.log('Lucky page file not present: archive merge skipped');
    return;
  }
  const existing = fs.readFileSync(ARCHIVE, 'utf8').replace(/^\uFEFF/, '');
  const lines = existing.split(/\r?\n/).filter(Boolean);
  const header = lines.shift() || 'Номер тиража,Дата,Шары';
  const byNumber = new Map();

  for (const line of lines) {
    if (line === 'lucky-numbers.ru') continue;
    const rawNumber = line.split(',')[0]?.trim();
    if (/^\d+$/.test(rawNumber)) byNumber.set(String(Number(rawNumber)), line);
  }

  const data = readJson(LUCKY_PAGE, {});
  if (!Array.isArray(data.docs)) throw new Error('Lucky page 1: docs[] missing');
  let added = 0;

  for (const doc of data.docs) {
    const numberKey = String(Number(doc.number));
    if (!numberKey || numberKey === 'NaN') continue;
    const balls = ballsOf(doc);
    if (balls.some(x => !Number.isInteger(x) || x < 1 || x > 6)) {
      throw new Error(`Draw ${doc.number}: invalid six-position result`);
    }
    const {date, time} = moscowParts(doc.date);
    const draw = String(doc.number).padStart(6, '0');
    const row =
      `${draw},${date}, ${time},` +
      `${balls[0]},+,${balls[1]},+,${balls[2]},+,` +
      `${balls[3]},+,${balls[4]},+,${balls[5]}`;
    if (!byNumber.has(numberKey)) added++;
    byNumber.set(numberKey, row);
  }

  const sorted = [...byNumber.entries()]
    .sort((a,b) => Number(b[0]) - Number(a[0]))
    .map(([,line]) => line);

  fs.writeFileSync(ARCHIVE, '\uFEFF' + [header, ...sorted, 'lucky-numbers.ru', ''].join('\n'), 'utf8');
  console.log(`Lucky docs checked: ${data.docs.length}`);
  console.log(`New draws added: ${added}`);
  console.log(`Archive rows now: ${sorted.length}`);
  console.log(`Latest archive row: ${sorted[0] ?? 'none'}`);
}

function normalizedLedger(ledger) {
  ledger.recent = Array.isArray(ledger.recent) ? ledger.recent : [];
  ledger.knownHistoricalAnalogs = Array.isArray(ledger.knownHistoricalAnalogs) ? ledger.knownHistoricalAnalogs : [];
  ledger.notes = Array.isArray(ledger.notes) ? ledger.notes : [];
  ledger.algorithmTracking = Array.isArray(ledger.algorithmTracking) ? ledger.algorithmTracking : [];
  return ledger;
}

function statsSignal(ledger) {
  const recent = [...(ledger.recent || [])].sort((a,b) => a.at.localeCompare(b.at));
  if (!recent.length) return {
    signal:[],label:'НЕТ СТАТИСТИЧЕСКОГО СИГНАЛА',
    reason:'Нет журнала заранее зафиксированных прогнозов',pattern:[],completedAnalogs:0
  };

  let lastU = -1;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].status === 'U') { lastU = i; break; }
  }
  if (lastU < 0) return {
    signal:[],label:'НЕТ СТАТИСТИЧЕСКОГО СИГНАЛА',
    reason:'Нет текущего шаблона, начинающегося с незаскоренного тиража',pattern:[],completedAnalogs:0
  };

  const pattern = recent.slice(lastU).map(x => x.status);
  if (pattern.length < 2) return {
    signal:[],label:'НЕТ СТАТИСТИЧЕСКОГО СИГНАЛА',
    reason:'Текущий шаблон ещё не завершил ни одного шага после незаскоренного тиража',pattern,completedAnalogs:0
  };

  const candidates = [];
  for (let start = 0; start + pattern.length < lastU; start++) {
    const probe = recent.slice(start, start + pattern.length).map(x => x.status);
    if (probe.length !== pattern.length) continue;
    if (!probe.every((x,i) => x === pattern[i])) continue;
    const next = recent[start + pattern.length];
    if (next && Number.isFinite(Number(next.actualSum))) {
      candidates.push({sum:Number(next.actualSum),source:`ledger:${recent[start].at}→${next.at}`});
    }
  }
  for (const a of ledger.knownHistoricalAnalogs || []) {
    if (!Array.isArray(a.pattern) || a.pattern.length !== pattern.length) continue;
    if (!a.pattern.every((x,i) => x === pattern[i])) continue;
    if (Number.isFinite(Number(a.nextActualSum))) {
      candidates.push({sum:Number(a.nextActualSum),source:`known:${a.sourceStart ?? 'history'}→${a.nextAt ?? ''}`});
    }
  }

  if (!candidates.length) return {
    signal:[],label:'НЕТ СТАТИСТИЧЕСКОГО СИГНАЛА',
    reason:'Завершённых точных исторических аналогов = 0',pattern,completedAnalogs:0
  };

  const signal = [...new Set(candidates.map(x => x.sum))].sort((a,b) => a-b);
  return {
    signal,label:signal.length?'СТАТИСТИЧЕСКИЙ СИГНАЛ':'НЕТ СТАТИСТИЧЕСКОГО СИГНАЛА',
    reason:`Завершённых точных исторических аналогов: ${candidates.length}`,
    pattern,completedAnalogs:candidates.length,analogs:candidates
  };
}

function targetToDate(targetAt) {
  return new Date(`${targetAt}:00+03:00`);
}

function finalOf(forecast) {
  if (Array.isArray(forecast?.final) && forecast.final.length) return forecast.final;
  return [...(forecast?.v1 || []),...(forecast?.v2 || []),...(forecast?.v3 || [])].slice(0,3);
}

function auditForecast(forecast) {
  const errors = [];
  const allowedLevels = new Set([6,5,4,3,2,null]);
  for (const [name, method] of Object.entries(forecast.methods || {})) {
    if (!allowedLevels.has(method.level)) errors.push(`${name}: недопустимый уровень ${method.level}`);
    if (method.level && method.chain.length !== method.level) errors.push(`${name}: длина цепочки не совпадает с уровнем`);
  }

  if (forecast.combo?.complete) {
    if (!Array.isArray(forecast.combo.combo) || forecast.combo.combo.length !== 6) errors.push('Combo: должно быть ровно 6 позиций');
    if ((forecast.combo.positions || []).length !== 6) errors.push('Combo: позиционная проверка не содержит 6 позиций');
  }

  if (!Array.isArray(forecast.v1) || !Array.isArray(forecast.v2) || !Array.isArray(forecast.v3)) {
    errors.push('В1/В2/В3 должны быть массивами');
  }

  if (forecast.modelVersion === MODEL_VERSION) {
    const final = finalOf(forecast);
    if (final.length !== 3) errors.push('HARD RANGE final: должно быть ровно 3 значения');
    if (final.some(x => x < 6 || x > 36)) errors.push('HARD RANGE final: значение вне 6–36');
    if (final.length === 3 && final.every(x => x >= 19 && x <= 23)) errors.push('CENTER-LOCK: final целиком 19–23 запрещён');
    for (const name of ['GLOBAL','TIME','TRANS','DELTA','JUMP','PAIR','D2','STATE']) {
      if (!forecast.families?.[name]) errors.push(`FAMILY ${name}: отсутствует`);
    }
    if (!forecast.strictRaw) errors.push('Strict RAW V1/V2/V3 отсутствует');
    if (!forecast.jumpTrack) errors.push('JUMP-TRACK отсутствует');
    if (!Array.isArray(forecast.weightedBase)) errors.push('weighted base отсутствует');
  }

  return {ok:errors.length===0,errors,message:errors.length?errors.join('; '):'Отклонений от действующих законов не найдено'};
}

function sameTriple(a,b) {
  return Array.isArray(a)&&Array.isArray(b)&&a.length===3&&b.length===3&&a.every((x,i)=>Number(x)===Number(b[i]));
}

function global30(history, upToAt) {
  const checked = history
    .filter(x => x?.checked && x.targetAt <= upToAt)
    .sort((a,b)=>a.targetAt.localeCompare(b.targetAt))
    .slice(-30);
  let hits=0;
  for (const h of checked) {
    const g=h.forecast?.families?.GLOBAL?.candidates||[];
    if (g.includes(Number(h.result?.actualSum))) hits++;
  }
  return {hits,total:checked.length};
}

function globalMissStreak(history, upToAt) {
  const checked = history
    .filter(x => x?.checked && x.targetAt <= upToAt)
    .sort((a,b)=>a.targetAt.localeCompare(b.targetAt));
  let n=0;
  for (let i=checked.length-1;i>=0;i--) {
    const h=checked[i],g=h.forecast?.families?.GLOBAL?.candidates||[];
    if (!g.length) break;
    if (g.includes(Number(h.result?.actualSum))) break;
    n++;
  }
  return n;
}

function appendTracking(ledger, entry, postFactAudit, history) {
  if (!postFactAudit) return;
  const prev = ledger.algorithmTracking.at(-1);
  if (prev?.at === entry.targetAt) return;
  const g30=global30(history,entry.targetAt);
  ledger.algorithmTracking.push({
    at:entry.targetAt,
    frozen:postFactAudit.frozen,
    fact:postFactAudit.fact,
    hit:postFactAudit.hit,
    position:postFactAudit.position,
    families:entry.forecast?.families||null,
    fullRaw:entry.forecast?.methods||{},
    strictRaw:entry.forecast?.strictRaw||null,
    coverage:postFactAudit.coverage,
    rawfreq:postFactAudit.rawfreq,
    classification:postFactAudit.classification,
    currentDelta:postFactAudit.currentDelta,
    jumpState:postFactAudit.jumpState,
    relation:postFactAudit.relation,
    d2:postFactAudit.d2,
    GLOBAL30:g30,
    center19_23_30:postFactAudit.center19_23_30,
    globalMissStreak:globalMissStreak(history,entry.targetAt),
    weightedBase:entry.forecast?.weightedBase||null,
    rangeReplacement:entry.forecast?.rangeReplacement||[],
    final:postFactAudit.frozen,
    workOnErrors:postFactAudit.workOnErrors
  });
  if (ledger.algorithmTracking.length > 1200) ledger.algorithmTracking=ledger.algorithmTracking.slice(-1200);
}

mergeLuckyPage();

const rules = readJson(RULES, {});
const ledger = normalizedLedger(readJson(LEDGER, {recent:[],knownHistoricalAnalogs:[],notes:[],algorithmTracking:[]}));
const history = readJson(HISTORY, []);
let current = readJson(CURRENT, null);

const facts = parseLuckyCsv(fs.readFileSync(ARCHIVE, 'utf8'));
if (!facts.length) throw new Error('Архив фактов пуст');

const byAt = new Map(facts.map(x => [x.at, x]));
const ledgerByAt = new Map(ledger.recent.map(x => [x.at, x]));

// 1) Проверяем только заранее зафиксированные прогнозы после прихода факта.
for (const entry of history) {
  if (!entry || entry.checked) continue;
  const actual = byAt.get(entry.targetAt);
  if (!actual) continue;

  const ev = evaluateForecast(entry.forecast, actual, rules);
  const final = finalOf(entry.forecast);
  const mainHit = final.includes(ev.actualSum);

  entry.checked = true;
  entry.checkedAt = nowDate().toISOString();
  entry.actual = actual;

  const postFactAudit = auditActualAgainstForecast(entry.forecast, actual, facts);
  entry.postFactAudit = postFactAudit;
  entry.result = {
    mainStatus: mainHit ? 'H' : 'M',
    actualSum: ev.actualSum,
    finalHit: mainHit,
    position:postFactAudit.position,
    v1Hit: ev.v1Hit, v2Hit: ev.v2Hit, v3Hit: ev.v3Hit,
    rawHits: ev.rawHits,
    familyHits:postFactAudit.familyHits,
    coverage:postFactAudit.coverage,
    rawfreq:postFactAudit.rawfreq,
    classification:postFactAudit.classification,
    comboHit: ev.comboHit,
    statsHit: ev.statsHit,
    positionMatches: ev.posMatches,
    workOnErrors:postFactAudit.workOnErrors
  };

  ledgerByAt.set(entry.targetAt, {
    at:entry.targetAt,status:mainHit?'H':'M',actualSum:ev.actualSum,
    forecastFixedAt:entry.fixedAt,
    final,
    v1:entry.forecast.v1,v2:entry.forecast.v2,v3:entry.forecast.v3,
    comboSum:entry.forecast.combo?.complete?entry.forecast.combo.sum:null,
    stats:entry.forecast.stats?.signal||[],
    classification:postFactAudit.classification,
    coverage:postFactAudit.coverage,
    rawfreq:postFactAudit.rawfreq
  });

  appendTracking(ledger,entry,postFactAudit,history);
}

// 2) Новые факты без заранее зафиксированного прогноза получают U.
// Старый архив не переписываем задним числом.
const knownLedgerTimes = [...ledgerByAt.keys()].sort();
const ledgerCutoff = knownLedgerTimes.length ? knownLedgerTimes.at(-1) : null;

for (const fact of facts) {
  if (ledgerByAt.has(fact.at)) continue;
  if (ledgerCutoff && fact.at <= ledgerCutoff) continue;
  const fixed = history.find(x => x?.targetAt === fact.at && x?.fixedAt);
  if (fixed) continue;
  ledgerByAt.set(fact.at,{
    at:fact.at,
    status:'U',
    actualSum:fact.sum,
    note:'Факт получен, но прогноз на этот тираж заранее не фиксировался'
  });
}

ledger.recent = [...ledgerByAt.values()].sort((a,b) => a.at.localeCompare(b.at));

// 3) Если факт текущего frozen уже пришёл, current закрывается.
// Сам frozen остаётся в history и проходит audit выше.
const lastFact = facts.at(-1);
if (current?.targetAt && current.targetAt <= lastFact.at) {
  console.log(`CURRENT_CLOSED ${current.targetAt}: факт уже получен; stale current очищен`);
  current = null;
}

// 4) Новый frozen создаём только на реально будущий следующий слот.
// Если источник пришёл поздно, факт/audit/U всё равно сохраняются без аварийного throw.
const targetAt = nextScheduledAfter(lastFact.at);
const now = nowDate();
const targetDate = targetToDate(targetAt);

if (!current || current.targetAt !== targetAt) {
  if (!(now < targetDate)) {
    console.log(`LATE_FACT_SAVED: сейчас ${now.toISOString()}, ближайшая цель ${targetAt} уже прошла`);
    console.log('NO_POSTFACT_FORECAST: прогноз задним числом НЕ создаётся; ждём следующий фактический тираж');
  } else {
    const forecast = calculateForecast(facts, targetAt, ledger);
    forecast.stats = statsSignal(ledger);

    const previousForecast = history
      .filter(x=>x?.forecast)
      .sort((a,b)=>a.targetAt.localeCompare(b.targetAt))
      .at(-1)?.forecast;
    const prevFinal=finalOf(previousForecast);
    forecast.stagnationCheck={
      triggered:sameTriple(prevFinal,forecast.final),
      previousFinal:prevFinal,
      reviewedFamilies:['TIME','TRANS','DELTA','JUMP','PAIR','D2','STATE'],
      note:sameTriple(prevFinal,forecast.final)
        ?'STAGNATION-CHECK: все family пересчитаны заново; копирование прошлого frozen запрещено.'
        :'Новый final не повторяет предыдущий frozen.'
    };

    forecast.controlGate={
      base:'GLOBAL',
      rule:'Adaptive/state memory разрешены только при доказанном превосходстве nested walk-forward; post-fact leakage запрещён.'
    };

    forecast.audit = auditForecast(forecast);
    forecast.fixedAt = now.toISOString();
    forecast.locked = true;
    if (!forecast.audit.ok) throw new Error(`Аудит прогноза не пройден: ${forecast.audit.message}`);

    current = forecast;
    history.push({targetAt,fixedAt:forecast.fixedAt,checked:false,forecast});

    console.log(`FORECAST_FIXED ${targetAt}`);
    console.log(`MODEL=${forecast.modelVersion}`);
    console.log(`FINAL=${forecast.final.join('/') || '—'}`);
    console.log(`BASE=${forecast.weightedBase.join('/') || '—'}`);
    console.log(`SELECTOR=${forecast.selector}`);
    console.log(`JUMP=${forecast.jumpTrack?.delta ?? '—'} ${forecast.jumpTrack?.jumpState ?? ''}`);
    console.log(`STRICT_RAW V1=${forecast.strictRaw?.v1?.join('/') || '—'} V2=${forecast.strictRaw?.v2?.join('/') || '—'} V3=${forecast.strictRaw?.v3?.join('/') || '—'}`);
    console.log(`COMBO=${forecast.combo?.complete ? `${forecast.combo.combo.join('-')}=${forecast.combo.sum}` : 'НЕТ ПОЛНОГО ПРОГНОЗА'}`);
    console.log(`STATS=${forecast.stats.signal.join('/') || 'НЕТ СИГНАЛА'}`);
    console.log(`AUDIT=${forecast.audit.message}`);
  }
} else {
  console.log(`Forecast ${targetAt} already fixed at ${current.fixedAt}; not changed`);
}

// 5) Всегда сохраняем полученные факты/audit/U.
// Поэтому поздний факт больше не теряется только из-за прошедшего следующего слота.
writeJson(LEDGER, ledger);
writeJson(HISTORY, history);
writeJson(CURRENT, current);

console.log(`Last fact: ${lastFact.at} ${lastFact.combo.join('-')} Σ${lastFact.sum}`);
console.log(`Next target: ${targetAt}`);
console.log(`Ledger rows: ${ledger.recent.length}`);
console.log(`Tracking rows: ${ledger.algorithmTracking.length}`);
console.log(`Forecast history rows: ${history.length}`);
