import fs from 'node:fs';
import path from 'node:path';
import {writeHistory} from './history-compact.mjs';
import {
  parseLuckyCsv,
  nextScheduledAfter,
  calculateForecast,
  evaluateForecast,
  MODEL_VERSION
} from '../engine.js';
import {computeExitWarning,exitOutcome} from '../exit-signal.mjs';
import {computePositionsPick,positionMatches,positionPay} from '../positions.mjs';

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

function targetToDate(targetAt) {
  return new Date(`${targetAt}:00+03:00`);
}

// Короткая строка журнала: только итог, без внутренних расчётов.
function slimLedgerRow(r) {
  if (!r || typeof r !== 'object') return r;
  const out = {};
  for (const k of ['at','status','actualSum','forecastFixedAt','final','valueSums','valueHit','comboHit','note']) {
    if (r[k] !== undefined) out[k] = r[k];
  }
  return out;
}

mergeLuckyPage();

const rules = readJson(RULES, {});
const rawLedger = readJson(LEDGER, {recent:[]});
const ledger = {
  modelVersion: MODEL_VERSION,
  recent: (Array.isArray(rawLedger.recent) ? rawLedger.recent : []).map(slimLedgerRow),
  notes: Array.isArray(rawLedger.notes) ? rawLedger.notes : []
};
const history = readJson(HISTORY, []);
let current = readJson(CURRENT, null);

const facts = parseLuckyCsv(fs.readFileSync(ARCHIVE, 'utf8'));
if (!facts.length) throw new Error('Архив фактов пуст');

const byAt = new Map(facts.map(x => [x.at, x]));
const ledgerByAt = new Map(ledger.recent.map(x => [x.at, x]));

// 1) Проверяем заранее зафиксированные прогнозы, когда пришёл факт.
for (const entry of history) {
  if (!entry || entry.checked) continue;
  const actual = byAt.get(entry.targetAt);
  if (!actual) continue;
  const ev = evaluateForecast(entry.forecast, actual, rules);
  entry.checked = true;
  entry.checkedAt = nowDate().toISOString();
  entry.actual = actual;
  entry.result = {
    mainStatus: ev.often.hit ? 'H' : 'M',
    actualSum: ev.actualSum,
    finalHit: ev.often.hit,
    oftenHit: ev.often.hit,
    valueHit: ev.value.hit,
    comboHit: ev.combo.hit,
    oftenPayout: ev.often.payout,
    valuePayout: ev.value.payout,
    comboPayout: ev.combo.payout
  };
  const ex = exitOutcome(entry.forecast?.exitWarn, ev.actualSum);
  if (ex) { entry.result.exitWarnOn = true; entry.result.exitHit = ex.hit; entry.result.exitOut = ex.left; }
  if (entry.forecast?.positionsPick?.dice) {
    const pm = positionMatches(entry.forecast.positionsPick.dice, actual.combo);
    entry.result.posMatches = pm; entry.result.posPayout = positionPay(pm, rules);
  }
  ledgerByAt.set(entry.targetAt, {
    at: entry.targetAt,
    status: ev.often.hit ? 'H' : 'M',
    actualSum: ev.actualSum,
    forecastFixedAt: entry.fixedAt,
    final: ev.often.sums,
    valueSums: ev.value.sums,
    valueHit: ev.value.hit,
    comboHit: ev.combo.hit
  });
  console.log(`CHECKED ${entry.targetAt}: Σ${ev.actualSum} · Чаще ${ev.often.hit?'попал':'мимо'} · Выгоднее ${ev.value.hit?'попал':'мимо'} · Комбинация ${ev.combo.hit?'попал':'мимо'}`);
}

// 2) Факты без заранее зафиксированного прогноза получают U. Старое не переписываем.
const knownTimes = [...ledgerByAt.keys()].sort();
const cutoff = knownTimes.length ? knownTimes.at(-1) : null;
for (const fact of facts) {
  if (ledgerByAt.has(fact.at)) continue;
  if (cutoff && fact.at <= cutoff) continue;
  if (history.some(x => x?.targetAt === fact.at && x?.fixedAt)) continue;
  ledgerByAt.set(fact.at, {at: fact.at, status: 'U', actualSum: fact.sum, note: 'Прогноз на этот тираж заранее не фиксировался'});
}
ledger.recent = [...ledgerByAt.values()].sort((a,b) => a.at.localeCompare(b.at));

// 3) Если факт текущего прогноза уже пришёл — закрываем его.
const lastFact = facts.at(-1);
if (current?.targetAt && current.targetAt <= lastFact.at) {
  console.log(`CURRENT_CLOSED ${current.targetAt}`);
  current = null;
}

// 4) Новый прогноз — только на реально будущий тираж, заранее.
const targetAt = nextScheduledAfter(lastFact.at);
const now = nowDate();
if (!current || current.targetAt !== targetAt) {
  if (!(now < targetToDate(targetAt))) {
    console.log(`LATE_FACT_SAVED: ближайший тираж ${targetAt} уже прошёл, прогноз задним числом не создаётся`);
  } else {
    const forecast = calculateForecast(facts, targetAt);
    forecast.fixedAt = now.toISOString();
    forecast.locked = true;
    try {
      forecast.positionsPick = computePositionsPick(facts, targetAt);
      console.log(`POSITIONS ${targetAt} · ${forecast.positionsPick.dice.join('-')}`);
    } catch (err) {
      console.log(`POSITIONS_ERROR ${err.message}`);
    }
    try {
      const warn = computeExitWarning(facts, targetAt);
      // живой счёт: только сигналы, зафиксированные до тиража
      const lit = history.filter(e => e?.checked && e.forecast?.exitWarn?.on && e.actual);
      warn.score = {
        n: lit.length,
        hit: lit.filter(e => (e.forecast.exitWarn.sums || []).includes(e.actual.sum)).length,
        out: lit.filter(e => !(e.actual.sum >= 19 && e.actual.sum <= 23)).length
      };
      forecast.exitWarn = warn;
      if (warn.on) console.log(`EXIT_WARN ${targetAt} · ${warn.side === 'left' ? 'влево' : 'вправо'} ${warn.sums.join('·')} · p=${warn.p} порог ${warn.threshold}`);
    } catch (err) {
      console.log(`EXIT_WARN_ERROR ${err.message}`);
    }
    current = forecast;
    history.push({targetAt, fixedAt: forecast.fixedAt, checked: false, forecast});
    console.log(`FORECAST_FIXED ${targetAt} · Чаще ${forecast.picks.often.sums.join('/')} · Выгоднее ${forecast.picks.value.sums.join('/')} · Комбинация ${forecast.comboPick.label}`);
  }
} else {
  console.log(`Forecast ${targetAt} already fixed at ${current.fixedAt}; not changed`);
}

fs.writeFileSync(LEDGER, JSON.stringify(ledger) + '\n', 'utf8');
writeHistory(HISTORY, history);
writeJson(CURRENT, current);

console.log(`Last fact: ${lastFact.at} ${lastFact.combo.join('-')} Σ${lastFact.sum}`);
console.log(`Next target: ${targetAt}`);
console.log(`Ledger rows: ${ledger.recent.length}`);
console.log(`Forecast history rows: ${history.length}`);
