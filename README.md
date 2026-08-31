# Сумма Фортуны — Позитрон v1.2.1

PWA для GitHub Pages. Расчёт выполняется только в GitHub Actions; браузер показывает уже зафиксированный `data/current-forecast.json`.

## Цикл без post-fact leakage

1. Получить новый факт и все 6 шаров.
2. Проверить ранее зафиксированный frozen.
3. Выполнить FAMILY / полный RAW / strict RAW / coverage / rawfreq / classification.
4. Записать работу над ошибками и JUMP-TRACK.
5. Только после этого рассчитать следующий тираж.
6. Зафиксировать новый frozen. Уже существующий frozen не переписывается.

При миграции v1.1 → v1.2 текущий frozen сохраняется как есть. HARD RANGE начинает действовать только со следующего нового frozen.

## HARD RANGE

Диапазон всегда 6–36. Final не может целиком состоять из 19–23.

Если weighted base целиком 19–23, слабейший слот заменяется самым сильным кандидатом вне 19–23:
- сначала кандидат с минимум 2 независимыми блоками;
- если такого нет — strongest outside с минимум 1 блоком;
- расстояние от центра само по себе преимущества не даёт.

## FAMILY

- `GLOBAL`
- `TIME`
- `TRANS`
- `DELTA`
- `JUMP`
- `PAIR`
- `D2`
- `STATE`

Веса full-range selector:
- GLOBAL = 0.2777
- TRANS = 0.2570
- TIME = 0.2362
- DELTA = 0.2136
- PAIR = 0.1966
- D2 = 0.1564
- JUMP = 0.1351

Ранги: `#1=1.00`, `#2=0.75`, `#3=0.50`.

`STATE` ведётся как отдельный контрольный family и не получает выдуманного веса.

## RAW

Маршруты:
- В→В
- В→Г
- Г→В
- Г→Г

Первый найденный suffix-уровень: `6→5→4→3→2`, сокращение только слева. Используется полный continuation-pool.

Strict RAW:
- V1 = max coverage → max frequency → все точные ties
- V2 = max frequency независимо от coverage → все ties
- V3 = min coverage → min frequency → самый старый historical continuation

## JUMP-TRACK

После каждого факта сохраняются:
- текущий Δ;
- exact Δ;
- |Δ|;
- jump-state;
- разворот / продолжение;
- крупный разворот / продолжение;
- D2;
- цепочка последних Δ;
- исторические продолжения exact Δ / |Δ| / аналогичного jump-state.

Скачок используется только вперёд.

## JUMP-CLUSTER

Если `|Δ| >= 10` и spread стандартного final `<= 4`, `DELTA#1` может заменить слабейший слот только при минимум 2 независимых подтверждениях.

Никакого принудительного DELTA/JUMP на каждом крупном скачке.

## Слежение алгоритма

В `forecast-ledger.json -> algorithmTracking` сохраняются:
- frozen / факт / hit-position;
- FAMILY;
- полный RAW;
- strict RAW;
- coverage / rawfreq / classification;
- Δ / jump-state / relation / D2;
- GLOBAL30;
- center19–23/30;
- GLOBAL miss streak;
- weighted base;
- range replacement;
- final;
- работа над ошибками.

Классы:
- HIT
- SELECTOR-MISS / DEEP-RAW
- SELECTOR-MISS / FAMILY
- STRUCTURAL BLIND

Для legacy-frozen, созданных до внедрения FAMILY, `STRUCTURAL BLIND` не выдумывается: используется `LEGACY / FAMILY-NOT-RECORDED`, если pre-fact FAMILY отсутствует.

## Combo→Σ

Позиционный алгоритм использует 6 реальных позиций и уровни `6→5→4→3→2`. Никакой реконструкции отсутствующих шаров.

## PWA

Версия: `v1.2.1`.
Service Worker cache: `summa-fortuny-v1.2.1`.


## Release v1.2.1
- HARD RANGE / JUMP-TRACK
- финальная компактная карточка результата
- versioned assets + network-first service worker
- принудительная очистка старого PWA cache через кнопку обновления
