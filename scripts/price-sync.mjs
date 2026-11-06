// Цена билета из данных лотереи: при акциях и изменениях выплаты пересчитываются сами.
// Суммы и комбинации = цена × коэффициент из правил. Позиции — по фактическим выплатам тиражей,
// а если их по новой цене ещё не было — пропорционально базовой цене 550 ₽.

export const BASE_PRICE = 550;
const BASE_POSITIONS = {2:600, 3:1700, 4:6000, 5:55000, 6:1200000};

const moscowAt = iso => {
  const d = new Date(new Date(iso).getTime() + 3 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
};

// Коэффициенты считаются один раз из таблицы по той цене, которая в ней записана.
function coefficients(rules) {
  if (rules.sumCoef && rules.combinationCoef) return {sum: rules.sumCoef, combo: rules.combinationCoef};
  const p = Number(rules.ticketPrice || BASE_PRICE);
  const k = o => Object.fromEntries(Object.entries(o || {}).map(([key, v]) => [key, Math.round(Number(v) / p)]));
  return {sum: k(rules.sumPayouts), combo: k(rules.combinationPayouts)};
}

// Фактические выплаты за позиции по данной цене (категории 6→2 совп., 5→3, 4→4, 3→5, 2→6).
function observedPositions(docs, price) {
  const out = {};
  for (const d of docs || []) {
    if (Number(d.ticketPrice) !== price) continue;
    for (const c of d.winCategories || []) {
      const t = Number(c.title);
      // 6 совпадений (категория 2) делится между победителями — её не берём
      if (t >= 3 && t <= 6 && c.participants > 0 && c.amount > 0) out[8 - t] = Number(c.amount);
    }
  }
  return out;
}

export function rulesForPrice(rules, price, docs = []) {
  price = Number(price);
  if (!price || price <= 0) return rules;
  const coef = coefficients(rules);
  const mul = o => Object.fromEntries(Object.entries(o).map(([k, c]) => [k, c * price]));
  const seen = observedPositions(docs, price);
  const pos = {};
  for (const [k, v] of Object.entries(BASE_POSITIONS)) {
    pos[k] = seen[k] ?? (Number(k) === 6 ? v : Math.round(v * price / BASE_PRICE / 50) * 50);
  }
  return {
    ...rules,
    ticketPrice: price,
    sumCoef: coef.sum,
    combinationCoef: coef.combo,
    sumPayouts: mul(coef.sum),
    combinationPayouts: mul(coef.combo),
    positionPayouts: pos
  };
}

// Цена каждого тиража из страницы lucky-numbers: {at → price}.
export function pricesByAt(docs) {
  const m = new Map();
  for (const d of docs || []) if (Number(d.ticketPrice) > 0) m.set(moscowAt(d.date), Number(d.ticketPrice));
  return m;
}

// Новые правила по цене последнего тиража; null, если ничего не поменялось.
export function syncRulesPrice(rules, docs) {
  const latest = [...(docs || [])].sort((a, b) => Number(b.number) - Number(a.number))[0];
  const price = Number(latest?.ticketPrice);
  if (!price) return null;
  const next = rulesForPrice(rules, price, docs);
  const same = JSON.stringify([rules.ticketPrice, rules.sumPayouts, rules.combinationPayouts, rules.positionPayouts]) ===
               JSON.stringify([next.ticketPrice, next.sumPayouts, next.combinationPayouts, next.positionPayouts]);
  if (same && rules.sumCoef) return null;
  if (Number(rules.ticketPrice) !== price) {
    next.priceSince = moscowAt(latest.date);
    next.priceNote = price === BASE_PRICE ? '' : `Цена билета ${price} ₽ (обычная ${BASE_PRICE} ₽) — по данным тиража ${latest.number}`;
  }
  return next;
}
