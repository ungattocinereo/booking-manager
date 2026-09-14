# Задание: Email-уведомления о новых бронированиях Harmony / Royal / Carina

> **Статус (2026-09-01): реализовано.** Этот файл сохраняет исходную спецификацию. Актуальная эксплуатационная схема описана в `monitor-app/email-notifier/README.md`. Код и workflow живут в `main`, а ветка `monitor/nuove-prenotazioni` хранит только snapshot и dedupe/audit-state. Отправка идёт через уже верифицированный Mailgun EU домен `amalfi.day`. День, в котором были только отмены, тоже формирует отдельное письмо.

Это самодостаточная спецификация для агента-исполнителя. В ней есть всё необходимое: источники данных, структура JSON, правила фильтрации, шаблоны писем на итальянском, способ отправки, расписание и рекомендации по самоорганизации агента (skill). Агент не обязан читать исходники — весь нужный контекст здесь.

---

## 1. Что нужно сделать

Ежедневно (по cron-расписанию) проверять данные мониторинга новых бронирований трёх апартаментов в Атрани — **Harmony, Royal, Carina** — и, если **за последние 48 часов** появились новые бронирования (созданные в этот период), отправлять **красивое HTML-письмо на итальянском языке** двум адресатам:

- **Rosario Dipino** — `dipinorosario@gmail.com`
- **Greg** — `greg@cinereo.it`

Если бронирований за последние 48 часов нет — **письмо не отправлять** (не слать пустых отчётов).

Письмо должно быть:
- Целиком на итальянском языке.
- Эстетичным (бумажно-редакторский стиль, как у основного сайта-монитора, ссылка ниже).
- Каждое бронирование — **кликабельный блок** (вся строка — одна ссылка), ведущий на страницу бронирования в админке Airbnb. Если прямой ссылки на бронь нет, ссылаемся на календарь листинга с подсветкой даты.

В каждом пункте должны быть:
- Название апартамента (Harmony / Royal / Carina).
- Даты пребывания (check-in → check-out).
- **Дата когда оно было забронировано** (creata il …).
- Имя гостя — **только если оно известно**. Если имени нет — про имя не пишем ни слова (не ставим «senza nome», не пишем placeholder).

---

## 2. Источник данных

Агент забирает данные по одному URL, без API-ключей, без аутентификации:

```
https://ungattocinereo.github.io/booking-manager/data/monitor.json
```

Это публичный JSON, который обновляется другим workflow раз в 30 минут (fetch из upstream API `b.amalfi.day` + diff с предыдущим состоянием + коммит в git). Кэшируется CDN GitHub, поэтому при запросе добавляй cache-buster: `?t=<timestamp>`.

### Структура ответа (важные поля)

```json
{
  "since": "2026-04-17",
  "generated_at": "2026-04-21T11:13:42.100Z",
  "available_dates": ["2026-04-21", "2026-04-20"],
  "properties": [
    {
      "id": "harmony",
      "name": "Harmony",
      "accent": "#c9512e",
      "icon": "home",
      "events": [
        {
          "bookingKey": "harmony|airbnb|2026-05-02|2026-05-08",
          "propertyId": "harmony",
          "platform": "airbnb",
          "startDate": "2026-05-02",
          "endDate": "2026-05-08",
          "guestName": "Gaelle Djankale",
          "confirmationCode": "HMABC1234",
          "firstSeenAt": "2026-04-20T09:15:02.123Z",
          "status": "active",
          "cancelledAt": null,
          "link": "https://www.airbnb.com/hosting/reservations/details/HMABC1234",
          "sources": ["upstream_api", "export_airbnb_csv"]
        }
      ]
    },
    { "id": "royal",  "name": "Royal",  "events": [ ... ] },
    { "id": "carina", "name": "Carina", "events": [ ... ] }
  ],
  "events": [ /* полный event-log — нужен только для time-travel UI, агенту не требуется */ ],
  "imports_log": [ ... ]
}
```

### Что использовать

- **`properties[].events[]`** — это уже готовый, отфильтрованный список бронирований в карточке (начиная с 17 апреля 2026, без дубликатов). Агент берёт только его и дополнительно фильтрует по свежести.
- Порядок внутри `events[]`: от нового к старому (`firstSeenAt` убывающий).
- `firstSeenAt` — ISO-timestamp момента, когда бронирование **впервые появилось** в системе. Это и есть «creata il …».
- `status` может быть `"active"` или `"cancelled"`. Для отменённых — `cancelledAt` содержит timestamp отмены.
- `link` — готовая ссылка. Если не `null` — использовать её. Если `null` — собрать fallback (см. секцию «Ссылки на Airbnb»).

---

## 3. Правила фильтрации для письма

Взять объединённый список из `properties[*].events[*]`. В письмо попадают элементы, у которых выполняется **оба** условия:

1. `propertyId ∈ {"harmony", "royal", "carina"}` (все три — они и так в JSON, можно не фильтровать, но явно проверь на случай расширения).
2. **Создано в последние 48 часов** — `firstSeenAt >= now - 48h`.

### Отменённые брони

По умолчанию **не включать** в письмо отменённые (`status === "cancelled"`) — чтобы не создавать ложной тревоги. Если за последние 48 часов случилась **отмена** ранее созданной брони (`cancelledAt >= now - 48h` при `status === "cancelled"`) — добавить отдельный небольшой блок «Prenotazioni annullate (ultime 48 ore)» в конце письма. Если отмен нет — блок просто не рендерим.

### Группировка

Внутри письма группировать по апартаменту (Harmony → Royal → Carina), внутри группы — сортировать по `firstSeenAt` убывающему (сверху — самое свежее). Если у какого-то апартамента 0 броней за период — **секцию не показывать**.

Если всего 0 броней за период во всех трёх апартаментах — **письмо не отправлять вообще**.

---

## 4. Ссылки на Airbnb

Правило формирования ссылки для конкретной брони:

1. Если у события есть непустой `link` (уже сформированный backend-ом) — использовать его как есть.
2. Иначе, если `confirmationCode` непустой — `https://www.airbnb.com/hosting/reservations/details/{confirmationCode}`.
3. Иначе (fallback на календарь листинга):
   ```
   https://www.airbnb.com/hosting/listings/{listingId}/calendar?date={startDate}
   ```
   Маппинг listingId:
   - `harmony` → `37988248`
   - `royal` → `973032288955949308`
   - `carina` → `20551225`

Все ссылки в письме — `target="_blank"` + `rel="noopener"`. Для plain-text версии — развёрнутая ссылка в скобках.

---

## 5. Формат письма

### Subject (тема)

- С новыми бронями, 1 апартамент или 1 бронь:
  `Nuova prenotazione — {Apartament} ({N} notti) · {DD MMM}`
- С несколькими: `Nuove prenotazioni · {N} in Harmony, {M} in Carina, {K} in Royal — {DD MMM}`
- Только отмены: `Prenotazione annullata — {Apartament}`

Даты в subject — итальянским коротким месяцем (`3 mag`, `21 apr`).

### HTML-версия

Дизайн должен следовать стилю основного монитора https://ungattocinereo.github.io/booking-manager/ — **бумажно-редакторский**, serif-типографика, тёплая палитра:
- Фон письма: `#faf5e7` (кремовая бумага).
- Карточка контента: `#fffdf7` с тонкой рамкой `#d9cfb8`.
- Акценты апартаментов (используются как `border-left: 4px solid`):
  - Harmony — `#c9512e`
  - Royal — `#1f3d8a`
  - Carina — `#0b7a7a`
- Основной текст: `#1d1509` (насыщенный тёмно-коричневый).
- Отмены: красный `#9a2417` + `text-decoration: line-through`.

Шрифт — **безопасный для email**, поэтому Fraunces из основного UI **использовать нельзя** (Gmail/Apple Mail их не загрузят как надо). Использовать стандартный стек:
```
font-family: Georgia, "Times New Roman", serif;
```
Заголовки и бренд-метки можно оставить serif, подписи/meta — курсивом.

Email-CSS ограничения:
- Только inline-стили (`style="..."` на каждом элементе). Никаких `<style>` блоков — многие клиенты их срезают.
- Никаких CSS-переменных, `calc()`, `grid`, `flex` рискован в Outlook — лучше `table`-вёрстка для layout.
- Ширина контейнера — 600 px, responsive через `width="100%"` и `max-width`.

**Структура письма:**

1. **Header** — маленькое eyebrow `ATRANI · COSTIERA AMALFITANA`, ниже крупный заголовок `Nuove Prenotazioni`, ниже подзаголовок-курсив `Riepilogo delle ultime 48 ore — {oggi, DD MMMM YYYY}`.
2. **Для каждого апартамента** с ≥1 бронью:
   - Полоска-заголовок: название апартамента (`Harmony` / `Royal` / `Carina`), 28-32px, + небольшая цветная пилюля со счётчиком «3 nuove».
   - Список броней (каждая — отдельная `<table>` как кликабельная карточка):
     - Большим serif-текстом: `02 – 08 maggio` (если месяц в check-in и check-out совпадает — одно название; если разные — «28 apr – 3 mag»). Под датами мелким курсивом: `6 notti`.
     - Имя гостя (если есть) — 18–20px, среднего веса. Если имени нет — строку вообще опускаем.
     - Meta-строка курсивом: `Prenotata mercoledì 20 aprile alle 11:15`. День недели — по-итальянски. Если есть `confirmationCode` — в конце метa-строки дописать `· HMABC1234` (моноширинно или в рамке, 12px, заглавными).
     - Отдельного CTA-кнопки не нужно: вся карточка — `<a href=" ..." style="display:block; color:inherit; text-decoration:none;">`.
3. **Если есть отмены за 48 ч** — блок `Prenotazioni annullate` с аналогичными карточками, но перечёркнутыми и с красным pill-бейджем `ANNULLATA · annullata venerdì 19 alle 09:12`.
4. **Footer** — мелким серым: `Generato da Monitor Atrani · vedi tutto in tempo reale su` + ссылка на https://ungattocinereo.github.io/booking-manager/

### Plain-text версия (обязательна, как мульти-парт)

Должна содержать ту же информацию без декора. Пример:

```
NUOVE PRENOTAZIONI — riepilogo ultime 48 ore (21 aprile 2026)

HARMONY
• 02 – 08 maggio (6 notti) — Gaelle Djankale
  Prenotata il 20 aprile alle 11:15 · HMABC1234
  https://www.airbnb.com/hosting/reservations/details/HMABC1234

• 11 – 15 maggio (4 notti) — Horia Madear
  Prenotata il 20 aprile alle 09:02
  https://www.airbnb.com/hosting/reservations/details/HMDEF4567

CARINA
• 05 – 10 luglio (5 notti) — Tanya Shaw
  Prenotata il 21 aprile alle 06:54
  https://www.airbnb.com/hosting/listings/20551225/calendar?date=2026-07-05

— Monitor Atrani
  https://ungattocinereo.github.io/booking-manager/
```

### Локализация — словарь

- Месяцы (полные, строчными): `gennaio, febbraio, marzo, aprile, maggio, giugno, luglio, agosto, settembre, ottobre, novembre, dicembre`.
- Месяцы короткие: `gen, feb, mar, apr, mag, giu, lug, ago, set, ott, nov, dic`.
- Дни недели (полные, строчными, с ударением): `domenica, lunedì, martedì, mercoledì, giovedì, venerdì, sabato`.
- Количество ночей: `1 notte`, `2 notti`, `3 notti` …
- «Было забронировано» — `Prenotata il {день недели} {DD} {mese} alle {HH:MM}`. Время — в европейском 24-часовом формате.
- «Отменено» — `Annullata il {день недели} {DD} alle {HH:MM}`.
- Пустое состояние не используем (письмо не шлётся).

Часовой пояс для отображения — **Europe/Rome** (CEST/CET). `firstSeenAt` и `cancelledAt` приходят в UTC — конвертируй.

---

## 6. Отправка

### Рекомендуемый провайдер

**Resend** (`https://resend.com`) — проще всего, хорошо работает с GitHub Actions, 3000 писем/мес бесплатно, API принимает JSON-payload c HTML + text + list of `to`. Альтернативы: Mailgun, SendGrid, Postmark, AWS SES. Sendgrid SMTP тоже ок, но HTTP API удобнее из Actions.

Пример запроса (Resend):
```
POST https://api.resend.com/emails
Authorization: Bearer $RESEND_API_KEY
Content-Type: application/json

{
  "from": "Monitor Atrani <monitor@<verified-domain>>",
  "to": ["dipinorosario@gmail.com", "greg@cinereo.it"],
  "subject": "Nuove prenotazioni · 3 in Harmony, 1 in Carina — 21 apr",
  "html": "...",
  "text": "...",
  "tags": [{ "name": "source", "value": "monitor-atrani" }]
}
```

### Sender / From

- Использовать верифицированный домен в Resend (или аналоге). У пользователя есть **`amalfi.day`** и **`cinereo.it`** — рекомендовать добавить DNS-записи (SPF/DKIM/Return-Path) в одном из них и прислать инструкции в README.
- From-имя: `Monitor Atrani`. From-email: например `monitor@amalfi.day` или `monitor@cinereo.it`.
- Reply-To: `greg@cinereo.it` (чтобы ответы шли Грегу).

### Dedupe / идемпотентность

Если workflow почему-то запустится дважды в один и тот же день — не слать два письма. Простейший способ: хранить в ветке `monitor/nuove-prenotazioni` файл `monitor-app/data/email-sent.json` с записью `{ lastRunIso, lastDigestHash, sentTo, subject }`. Если `digestHash` (sha256 от списка `bookingKey[firstSeenAt]` за окно 48 ч) не изменился с предыдущей отправки — пропустить и записать `skipped: true`. Коммитить файл обратно в ветку после удачной отправки.

### Ошибки

- Retry 3 раза с exp-backoff на сетевых ошибках / 5xx от email-API.
- На 4xx — фиксировать fail, но **не пытаться** повторять (обычно конфиг).
- Послать сам себе (на `greg@cinereo.it`) письмо-об-ошибке, если отправка упала — или хотя бы оставить явный fail в Actions (workflow run = failure, чтобы было видно в Actions UI).

---

## 7. Расписание

GitHub Actions cron в отдельном workflow-файле `.github/workflows/email-notifier.yml`:

```yaml
on:
  schedule:
    - cron: "0 7 * * *"   # 07:00 UTC = 09:00 Europe/Rome в летнее время
  workflow_dispatch:       # для ручного запуска из UI
```

**Важно:** scheduled workflows GitHub запускает **только с default-ветки (`main`)**. Файл `.github/workflows/email-notifier.yml` должен быть на `main`. Но логика/скрипт — на ветке `monitor/nuove-prenotazioni` (там живёт monitor-app). В workflow — `actions/checkout@v4` с `ref: monitor/nuove-prenotazioni`.

Secrets в GitHub → Settings → Secrets and variables → Actions:
- `RESEND_API_KEY` (или эквивалент для Mailgun/SendGrid).
- `EMAIL_FROM` (опц., если хотим без хардкода).

---

## 8. Структура файлов (предложение)

```
monitor-app/
  email-notifier/
    send.js                 # точка входа: загружает monitor.json, фильтрует, формирует HTML+text, отправляет
    template.js             # рендер HTML (inline-styles), текст, subject
    i18n.js                 # итальянские словари, форматирование дат
    dedupe.js               # работа с email-sent.json
  data/
    email-sent.json         # audit-трейл, коммитится обратно в ветку
  docs/
    email-notifier-task.md  # ← этот документ

.github/workflows/
  email-notifier.yml        # cron + checkout monitor/nuove-prenotazioni + node send.js + auto-commit email-sent.json
```

Дополнительно: в `monitor-app/package.json` добавить скрипт `"email": "node email-notifier/send.js"` и зависимость (ничего жесткого — `fetch` нативный в Node 20; Resend можно дёргать голым `fetch`, SDK не нужен).

Для локального запуска — `RESEND_API_KEY=... DRY_RUN=1 node email-notifier/send.js`; при `DRY_RUN=1` скрипт только печатает HTML/plain на stdout и **не** отправляет.

---

## 9. Skill для агента

Пользователь явно попросил: **агент должен у себя создать skill**, который описывает как работает эта фича, чтобы в следующих сессиях он не разбирался заново. Формат skill'а зависит от того, каким агентом пользуется оператор — Claude Code skill в `~/.claude/skills/`, Cursor rule, или README в проекте. Ниже — что skill должен содержать.

**Название:** `atrani-email-notifier` (или аналог).

**Description (для auto-trigger):** «Send Italian daily email digest of new Harmony/Royal/Carina bookings based on monitor-app data. Triggers on: changes to email template, troubleshooting email delivery, adding new recipients, modifying cron schedule.»

**Тело skill:**

1. **Где взять данные:** `https://ungattocinereo.github.io/booking-manager/data/monitor.json` (публичный, без авторизации). Обновляется каждые 30 мин из ветки `monitor/nuove-prenotazioni`.
2. **Что фильтровать:** `properties[*].events[*]` где `firstSeenAt >= now - 48h` и `propertyId` один из `harmony, royal, carina`.
3. **Отправка:** Resend HTTP API, ключ в secret `RESEND_API_KEY`, from-домен верифицирован в Resend.
4. **Получатели (жёстко зашиты):** `dipinorosario@gmail.com`, `greg@cinereo.it`.
5. **Язык:** итальянский всегда. Timezone Europe/Rome. Словари в `email-notifier/i18n.js`.
6. **Идемпотентность:** `monitor-app/data/email-sent.json`, sha256 digest содержимого.
7. **Где правят дизайн письма:** `monitor-app/email-notifier/template.js`. Inline-styles, table-layout.
8. **Где расписание:** `.github/workflows/email-notifier.yml` на `main` (иначе scheduled cron не работает).
9. **Domain для From:** предложить `monitor@amalfi.day` (если DKIM настроен) или `monitor@cinereo.it`.
10. **Локальное тестирование:** `DRY_RUN=1 node monitor-app/email-notifier/send.js`.

Skill-файл должен явно указывать что агент не должен удалять/редактировать исходные файлы основного booking-manager проекта (`backend/`, `frontend/`, `api/` в корне) — они не имеют отношения к письмам.

---

## 10. Чек-лист приёмки (для пользователя)

- [ ] Письмо приходит на оба адреса, из верифицированного домена, без попадания в «Спам».
- [ ] Subject на итальянском, с датой и правильным подсчётом.
- [ ] В письме — только Harmony / Royal / Carina, ничего лишнего.
- [ ] Каждая бронь — одна кликабельная карточка. Клик → открывается Airbnb-admin или календарь.
- [ ] Имена гостей — там где они есть. Где нет — никакого плейсхолдера.
- [ ] Дата и день недели создания брони указаны в Europe/Rome.
- [ ] Если за 48 часов броней нет — письмо не отправляется (no-op).
- [ ] Повторный запуск workflow в один и тот же день не шлёт второе письмо.
- [ ] Plain-text версия читаема без HTML.
- [ ] `email-sent.json` коммитится обратно в ветку, виден в git log.

---

## 11. Контекст, который может пригодиться

- Основной монитор (живой): https://ungattocinereo.github.io/booking-manager/
- Репозиторий: `git@github.com:ungattocinereo/booking-manager.git`
- Ветка для всех monitor-app изменений: `monitor/nuove-prenotazioni`. Не трогать основную `main` кроме как для файлов `.github/workflows/*.yml` (scheduled cron требует main).
- Исходные данные в upstream API: `https://b.amalfi.day/api/bookings?property_id=harmony` (и т.д.). Агенту **не нужно** туда ходить — этот layer уже сделан отдельным workflow. Достаточно GitHub Pages JSON.
- Аудитория писем — Rosario Dipino (оператор в Атрани, итальянец) и Greg (владелец). Язык — **только итальянский**, даже если письмо дублируется оба получателя. Никаких «русского как fallback».
- Никаких ссылок на b.amalfi.day в письме (это админский сайт на русском — рядовым получателям не нужен). В footer ссылаемся на публичный итальянский монитор: https://ungattocinereo.github.io/booking-manager/.

---

## 12. Оценка трудозатрат (ориентир для агента)

| Блок | Размер |
|---|---|
| `i18n.js` (итальянские словари + format helpers) | ~80 строк |
| `template.js` (HTML + text render) | ~180 строк |
| `send.js` (fetch monitor.json + фильтр + dedupe + Resend) | ~120 строк |
| `email-notifier.yml` (workflow) | ~40 строк |
| README + skill файл | ~120 строк |

Всё умещается в одну небольшую PR-ку.
