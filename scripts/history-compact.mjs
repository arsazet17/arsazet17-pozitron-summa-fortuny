import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Сколько последних проверенных прогнозов хранить полностью.
// Движку для global30 / globalMissStreak нужны последние 30 записей.
export const KEEP_FULL = 30;

const pick = (obj, keys) => {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
};

// Короткая запись: сам прогноз и результат, без подробных совпадений по методам.
export function compactEntry(entry) {
  if (!entry || entry.compact) return entry;
  const f = entry.forecast || {};
  const forecast = pick(f, ['targetAt', 'fixedAt', 'modelVersion', 'final', 'v1', 'v2', 'v3']);
  if (f.combo) forecast.combo = pick(f.combo, ['complete', 'combo', 'sum']);
  if (f.stats?.signal) forecast.stats = {signal: f.stats.signal};
  const global = f.families?.GLOBAL?.candidates;
  if (Array.isArray(global)) forecast.families = {GLOBAL: {candidates: global}};
  const out = {
    ...pick(entry, ['targetAt', 'fixedAt', 'checked', 'checkedAt', 'actual']),
    forecast,
    compact: true
  };
  if (entry.result) {
    out.result = pick(entry.result, [
      'mainStatus', 'actualSum', 'finalHit', 'position',
      'v1Hit', 'v2Hit', 'v3Hit', 'comboHit', 'statsHit',
      'positionMatches', 'classification'
    ]);
  }
  return out;
}

// Непроверенные и последние KEEP_FULL проверенных остаются полными, остальные ужимаются.
export function compactHistory(history, keepFull = KEEP_FULL) {
  if (!Array.isArray(history)) return history;
  const checked = history
    .map((e, i) => ({e, i}))
    .filter(x => x.e?.checked)
    .sort((a, b) => String(a.e.targetAt).localeCompare(String(b.e.targetAt)));
  const keep = new Set(checked.slice(-keepFull).map(x => x.i));
  return history.map((e, i) => (!e?.checked || keep.has(i)) ? e : compactEntry(e));
}

export function writeHistory(file, history) {
  fs.writeFileSync(file, JSON.stringify(compactHistory(history)) + '\n', 'utf8');
}

// Запуск напрямую: node scripts/history-compact.mjs [папка_репозитория]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || process.cwd();
  const file = path.join(root, 'data', 'forecast-history.json');
  const before = fs.statSync(file).size;
  const history = JSON.parse(fs.readFileSync(file, 'utf8'));
  writeHistory(file, history);
  const after = fs.statSync(file).size;
  console.log(`HISTORY_COMPACT rows=${history.length} ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
}
