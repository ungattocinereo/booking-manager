# monitor-app — Nuove Prenotazioni

Статический монитор новых бронирований Airbnb для **Harmony / Royal / Carina**, хостится на **GitHub Pages** с ветки `monitor/nuove-prenotazioni`.

## Архитектура

- **Статический HTML** (`index.html`) — итальянский UI с time-travel навигацией, читает `./data/monitor.json`.
- **GitHub Actions** (`.github/workflows/monitor-sync.yml`) — крон каждые 30 минут:
  1. Fetch активных броней с основного Vercel API (`https://b.amalfi.day/api/bookings?property_id=...`).
  2. Парсинг CSV-экспортов из `monitor-app/exports/`.
  3. Snapshot-diff vs предыдущее состояние в `data/state.json` → события `created`/`cancelled`/`updated`.
  4. Запись обновлённых `data/monitor.json`, `data/state.json`, `data/imports.json` и коммит обратно в ветку.
- **Без сервера / без БД** — всё живёт в git: полный audit trail событий, время-travel работает offline.

## Настройка GitHub Pages (один раз)

1. GitHub → repo Settings → Pages:
   - Source: **Deploy from a branch**
   - Branch: `monitor/nuove-prenotazioni`, folder: `/monitor-app`
   - Save → URL будет `https://<user>.github.io/booking-manager/`.
2. Для custom-домена (опц.): добавить CNAME в `monitor-app/CNAME`.

## Локальная разработка

```bash
cd monitor-app
npm install
npm run sync              # создаёт data/monitor.json из upstream API + exports
npx serve .               # или python3 -m http.server  — UI на http://localhost
```

## Что делать с новыми экспортами

Положить CSV/XLS в `monitor-app/exports/` и закоммитить в ветку — следующий GH Actions run (в течение 30 мин или запусти вручную через **Actions → monitor-sync → Run workflow**) подхватит, залогирует изменения, обновит карточку.

## Ограничения

- Исторические отмены до первого run (~20 апреля 2026) потеряны — основной Vercel sync их уже удалил.
- Booking.com брони для Harmony/Royal/Carina не поддерживаются (эти свойства только на Airbnb).
- PII гостей коммитится в git (имена, confirmation codes). Если критично — приватный репо или Git LFS / удалить файлы после bootstrap.
