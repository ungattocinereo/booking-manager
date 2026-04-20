# Exports — monitor-app

Положите сюда экспорты из Airbnb (CSV) и Booking.com (XLS) и закоммитьте в ветку
`monitor/nuove-prenotazioni`. После деплоя Vercel в ближайший час крон-sync
обнаружит новые файлы и залогирует изменения в таблицу `monitor_booking_events`.

## Именование

- Airbnb: `airbnb.csv`, `airbnb-2026-04-20.csv`, или любое имя c `.csv`.
- Booking.com: `booking.xls`, `booking-2026-04-20.xls` или `.xlsx`.

## Идемпотентность

Каждый файл проверяется по SHA-256: повторный импорт того же содержимого
пропускается (`monitor_exports_log` c уникальным `(filename, checksum)`).
Если поменялись данные — достаточно положить новый файл с другим именем,
либо перезаписать тот же файл (checksum изменится, импорт выполнится).

## Что извлекаем

**Airbnb CSV** — парсер ищет колонки `Confirmation code`, `Status`, `Guest name`,
`Start date`, `End date`, `Booked`, `Listing`. Поле `Listing` маппится на
`harmony` / `royal` / `carina` по точному совпадению названия листинга:

- `Suite Harmony Royal. Excellent Central Location` → royal
- `Suite Harmony Excellent Central Location` → harmony
- `2 Story Suite "Carina" Excellent Central Location` → carina

Если `Status` содержит `cancel` — строка логируется как отменённая.

**Booking.com XLS** — в v1 не используется для Harmony/Royal/Carina, так как эти
три свойства на Booking.com не размещены. Файл будет обработан без ошибок, но
строки пропущены (BOOKING_ROOM_MAP пуст).

## Безопасность

Файлы коммитятся в git. Гостевые имена и confirmation-коды Airbnb попадают в
историю. Если это нежелательно — используйте отдельный приватный репозиторий
или Vercel Blob storage (вариант для v2).
