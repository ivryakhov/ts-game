# Тикеты

## Спека 0001

Разбивка [спеки 0001](../specs/0001-rules-driven-match.md) на вертикальные срезы.
Каждый тикет проходит через все слои и заканчивается сборкой, которую можно
открыть и посмотреть — кроме 01, у которого демо-остановки нет по договорённости.

```
01 ─→ 02 ─→ 03 ─┬─→ 04
                └─→ 05 ─→ 06 ─→ 07 ─→ 08 ─→ 09 ─→ 10 ─┬─→ 11
                                                       └─→ 12 ─→ 13
```

| # | Тикет | Блокируется | Демо |
|---|---|---|---|
| [01](01-karkas-i-yadro.md) | Каркас и детерминированное ядро | — | нет |
| [02](02-karta-na-ekrane.md) | Карта на экране | 01 | да |
| [03](03-yunit-edet-po-doroge.md) | Юнит едет по Дороге | 02 | да |
| [04](04-pauza-i-skorosti.md) | Пауза и скорости | 03 | да |
| [05](05-stychka-i-smert.md) | Стычка и смерть | 03 | да |
| [06](06-tsitadel-i-pobeda.md) | Цитадель, урон по ней и победа | 05 | да |
| [07](07-efir-i-pokupka.md) | Эфир и покупка Юнитов | 06 | да |
| [08](08-tri-tipa-yunitov.md) | Три типа Юнитов | 07 | да |
| [09](09-interpretator-pravil.md) | Интерпретатор Правил | 08 | да |
| [10](10-polnyy-slovar-pravil.md) | Полный словарь Правил | 09 | да |
| [11](11-podsvetka-aktivnogo-pravila.md) | Подсветка активного Правила | 10 | да |
| [12](12-protivnik-kak-nabor-pravil.md) | Противник как набор Правил | 10 | да |
| [13](13-yunity-skhodyat-s-dorogi.md) | Юниты сходят с Дороги | 12 | да |

## Спека 0002

Разбивка [спеки 0002](../specs/0002-podgotovka-i-redaktor-pravil.md):
Подготовка, редактор Правил и «И» в Правилах. Задачи в GitHub — подзадачи
[ivryakhov/ts-game#5](https://github.com/ivryakhov/ts-game/issues/5). Новые слова (14–15) не
зависят от экрана, а экран (16) идёт без редактора — так первая проверка
наступает раньше самой дорогой части.

```
14 ─┬─→ 15 ─────┐
    └─→ 17 ─┬─→ 18
16 ────↗    └─→ 19
```

| # | Тикет | Блокируется | Демо | Задача |
|---|---|---|---|---|
| [14](14-i-v-pravilakh.md) | «И» в Правилах и «у своей Цитадели» | — | да | [ivryakhov/ts-game#6](https://github.com/ivryakhov/ts-game/issues/6) |
| [15](15-vrag-u-svoey-tsitadeli.md) | «Враг у своей Цитадели» | 14 | да | [ivryakhov/ts-game#8](https://github.com/ivryakhov/ts-game/issues/8) |
| [16](16-ekran-podgotovki.md) | Экран Подготовки | — | да | [ivryakhov/ts-game#7](https://github.com/ivryakhov/ts-game/issues/7) |
| [17](17-redaktor-pravil.md) | Редактор Правил | 14, 16 | да | [ivryakhov/ts-game#9](https://github.com/ivryakhov/ts-game/issues/9) |
| [18](18-zagotovki.md) | Заготовки | 15, 17 | да | [ivryakhov/ts-game#10](https://github.com/ivryakhov/ts-game/issues/10) |
| [19](19-khranenie-povedeniya.md) | Хранение Поведения | 17 | да | [ivryakhov/ts-game#11](https://github.com/ivryakhov/ts-game/issues/11) |

## Спека 0003

Разбивка [спеки 0003](../specs/0003-obeliski.md): Обелиски на обходных
Дорогах. Задачи в GitHub — подзадачи
[ivryakhov/ts-game#18](https://github.com/ivryakhov/ts-game/issues/18).
Тикет 20 — подготовка кода без демо, как 01: Осада переводится на строение,
чтобы Обелиск встал в неё рядом с Цитаделью. Слова в редакторе (25) ждут
и захвата, и самого редактора из спеки 0002.

```
20 ─→ 21 ─→ 22 ─┬─→ 23
                ├─→ 24
                └─→ 25 ←── 17
```

| # | Тикет | Блокируется | Демо | Задача |
|---|---|---|---|---|
| [20](20-osada-u-stroeniya.md) | Осада у строения, а не только у Цитадели | — | нет | [ivryakhov/ts-game#19](https://github.com/ivryakhov/ts-game/issues/19) |
| [21](21-obelisk-na-pole.md) | Обелиск на поле: ничей, бьёт проходящих | 20 | да | [ivryakhov/ts-game#20](https://github.com/ivryakhov/ts-game/issues/20) |
| [22](22-zakhvat-obeliska.md) | Захват: «чужой Обелиск в радиусе» и «бить Обелиск» | 21 | да | [ivryakhov/ts-game#21](https://github.com/ivryakhov/ts-game/issues/21) |
| [23](23-dokhod-s-obeliskov.md) | Доход с Обелисков | 22 | да | [ivryakhov/ts-game#22](https://github.com/ivryakhov/ts-game/issues/22) |
| [24](24-protivnik-beryot-obeliski.md) | Противник берёт Обелиски | 22 | да | [ivryakhov/ts-game#23](https://github.com/ivryakhov/ts-game/issues/23) |
| [25](25-obelisk-v-redaktore.md) | Обелиск в редакторе Правил | 22, 17 | да | [ivryakhov/ts-game#24](https://github.com/ivryakhov/ts-game/issues/24) |

Готовый тикет отмечается галочками в своём файле. Следующим берётся любой,
у которого все блокирующие тикеты закрыты.

## Спека 0004

Разбивка [спеки 0004](../specs/0004-laboratoriya.md): Лаборатория
и Показательный матч. Задачи в GitHub — подзадачи
[ivryakhov/ts-game#51](https://github.com/ivryakhov/ts-game/issues/51). Показательный матч (26) от Лаборатории
не зависит и даёт «Противник против Противника» в игре сразу.
Лаборатория показывает результат с первого тикета: 27 — как играют
случайные Претенденты, 28 — как они учатся.

```
26 ───────────────────┐
27 ─→ 28 ─┬─→ 29      │
          └─→ 30 ─────┴─→ 31
```

| # | Тикет | Блокируется | Демо | Задача |
|---|---|---|---|---|
| [26](26-pokazatelnyy-match.md) | Показательный матч: Противник против Противника | — | да | [ivryakhov/ts-game#52](https://github.com/ivryakhov/ts-game/issues/52) |
| [27](27-laboratoriya-ekzamen.md) | Лаборатория: случайные Претенденты держат Экзамен | — | да | [ivryakhov/ts-game#53](https://github.com/ivryakhov/ts-game/issues/53) |
| [28](28-pokoleniya.md) | Поколения: отбор, скрещивание, мутации | 27 | да | [ivryakhov/ts-game#54](https://github.com/ivryakhov/ts-game/issues/54) |
| [29](29-vse-yadra.md) | Все ядра | 28 | да | [ivryakhov/ts-game#55](https://github.com/ivryakhov/ts-game/issues/55) |
| [30](30-krivaya-otsenki.md) | Кривая Оценки и память прогона | 28 | да | [ivryakhov/ts-game#56](https://github.com/ivryakhov/ts-game/issues/56) |
| [31](31-vyvedennyy-protivnik.md) | Выведенный Противник | 26, 30 | да | [ivryakhov/ts-game#57](https://github.com/ivryakhov/ts-game/issues/57) |

## Спека 0005

Разбивка [спеки 0005](../specs/0005-rodoslovnaya.md): как идёт отбор
и откуда берётся Претендент. Задачи в GitHub — подзадачи
[ivryakhov/ts-game#66](https://github.com/ivryakhov/ts-game/issues/66). Рождение (32) — основа остальных: без него
нечего показывать ни на паузе, ни в карточке.

```
32 ─┬─→ 33
    └─→ 34 ─→ 35
```

| # | Тикет | Блокируется | Демо | Задача |
|---|---|---|---|---|
| [32](32-rozhdenie.md) | Рождение: от кого Претендент и что в нём мутировало | — | да | [ivryakhov/ts-game#67](https://github.com/ivryakhov/ts-game/issues/67) |
| [33](33-pauza-posle-pokoleniya.md) | Пауза после каждого Поколения | 32 | да | [ivryakhov/ts-game#68](https://github.com/ivryakhov/ts-game/issues/68) |
| [34](34-kartochka-pretendenta.md) | Карточка Претендента и Родословная | 32 | да | [ivryakhov/ts-game#69](https://github.com/ivryakhov/ts-game/issues/69) |
| [35](35-match-ekzamena.md) | Матч Экзамена в игре | 34 | да | [ivryakhov/ts-game#70](https://github.com/ivryakhov/ts-game/issues/70) |
