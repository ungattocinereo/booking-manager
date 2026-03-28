# 🤖 Интеграция с Clawd

Atrani Booking Manager предоставляет REST API, с которым Clawd может взаимодействовать для автоматизации.

## Базовая проверка

```bash
# Проверить статус системы
curl http://localhost:3001/health

# Получить дашборд (все данные)
curl http://localhost:3001/api/dashboard | jq
```

## Частые задачи

### 1. Узнать о новых бронированиях

```bash
# Бронирования на сегодня и позже
curl "http://localhost:3001/api/bookings?from_date=$(date +%Y-%m-%d)" | jq

# Только для конкретного объекта
curl "http://localhost:3001/api/bookings?property_id=1" | jq
```

### 2. Проверить задачи на уборку

```bash
# Все незавершенные уборки
curl "http://localhost:3001/api/cleaning-tasks?status=pending" | jq

# Уборки конкретной уборщицы
curl "http://localhost:3001/api/cleaning-tasks?cleaner_id=1" | jq

# Уборки на сегодня
curl "http://localhost:3001/api/cleaning-tasks?date=$(date +%Y-%m-%d)" | jq
```

### 3. Назначить уборку

```bash
# Создать задачу на уборку
curl -X POST http://localhost:3001/api/cleaning-tasks \
  -H "Content-Type: application/json" \
  -d '{
    "property_id": 1,
    "scheduled_date": "2026-03-25",
    "task_type": "checkout",
    "cleaner_id": 1,
    "notes": "Стандартная уборка после выезда"
  }'

# Назначить существующую задачу уборщице
curl -X POST http://localhost:3001/api/cleaning-tasks/5/assign \
  -H "Content-Type: application/json" \
  -d '{"cleaner_id": 2}'
```

### 4. Отметить уборку выполненной

```bash
curl -X POST http://localhost:3001/api/cleaning-tasks/5/complete \
  -H "Content-Type: application/json" \
  -d '{"notes": "Готово, всё чисто"}'
```

### 5. Список всех объектов

```bash
curl http://localhost:3001/api/properties | jq
```

### 6. Синхронизация календарей

```bash
# Запустить синхронизацию вручную
curl -X POST http://localhost:3001/api/sync
```

## Примеры для Clawd

### Утреннее резюме

Clawd может каждое утро отправлять Greg сводку:

```javascript
const dashboard = await fetch('http://localhost:3001/api/dashboard').then(r => r.json());

const message = `
🏠 *Сводка по Atrani на ${new Date().toLocaleDateString('ru-RU')}*

📅 *Заезды сегодня:* ${dashboard.today_checkins?.length || 0}
${dashboard.today_checkins?.map(b => `  • ${b.guest_name} → ${b.property_name}`).join('\n') || 'Нет'}

📤 *Выезды сегодня:* ${dashboard.today_checkouts?.length || 0}
${dashboard.today_checkouts?.map(b => `  • ${b.guest_name} ← ${b.property_name}`).join('\n') || 'Нет'}

🧹 *Уборки сегодня:* ${dashboard.cleaning_today?.length || 0}
${dashboard.cleaning_today?.map(t => `  • ${t.property_name} (${t.cleaner_name || 'не назначено'})`).join('\n') || 'Нет'}

🔔 *Ближайшие события:*
${dashboard.upcoming?.slice(0, 3).map(b => 
  `  • ${b.start_date}: ${b.guest_name} @ ${b.property_name}`
).join('\n') || 'Нет'}
`;

// Отправить в Telegram
sendToTelegram(message);
```

### Напоминания об уборках

```javascript
// Запускать каждый вечер в 20:00
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowStr = tomorrow.toISOString().split('T')[0];

const cleanings = await fetch(
  `http://localhost:3001/api/cleaning-tasks?date=${tomorrowStr}&status=pending`
).then(r => r.json());

if (cleanings.length > 0) {
  const message = `🧹 *Уборки на завтра (${tomorrowStr}):*\n\n` +
    cleanings.map(c => 
      `• ${c.property_name} — ${c.cleaner_name || '⚠️ НЕ НАЗНАЧЕНО'}\n` +
      `  Тип: ${c.task_type}, Заметки: ${c.notes || 'нет'}`
    ).join('\n\n');
  
  sendToTelegram(message);
}
```

### Автоназначение уборок

```javascript
// После синхронизации календаря найти уборки без исполнителя
const unassigned = await fetch(
  'http://localhost:3001/api/cleaning-tasks?status=pending'
).then(r => r.json()).then(tasks => tasks.filter(t => !t.cleaner_id));

for (const task of unassigned) {
  // Получить уборщиц для этого объекта
  const cleaners = await fetch(
    `http://localhost:3001/api/cleaners?property_id=${task.property_id}`
  ).then(r => r.json());
  
  if (cleaners.length > 0) {
    // Назначить первой доступной
    await fetch(`http://localhost:3001/api/cleaning-tasks/${task.id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cleaner_id: cleaners[0].id })
    });
    
    console.log(`Уборка ${task.id} назначена ${cleaners[0].name}`);
  }
}
```

### Мониторинг новых бронирований

```javascript
// Сохранить последний ID бронирования
let lastBookingId = localStorage.getItem('lastBookingId') || 0;

const bookings = await fetch('http://localhost:3001/api/bookings').then(r => r.json());

const newBookings = bookings.filter(b => b.id > lastBookingId);

if (newBookings.length > 0) {
  const message = `🎉 *Новые бронирования!*\n\n` +
    newBookings.map(b => 
      `• ${b.guest_name}\n` +
      `  ${b.property_name}\n` +
      `  ${b.start_date} → ${b.end_date}\n` +
      `  Источник: ${b.source}`
    ).join('\n\n');
  
  sendToTelegram(message);
  
  // Обновить последний ID
  localStorage.setItem('lastBookingId', Math.max(...bookings.map(b => b.id)));
}
```

## Cron Job для Clawd

Добавить в OpenClaw cron:

```javascript
// Название: "Atrani Booking Check"
// Расписание: 0 8 * * * (каждое утро в 8:00)
// Промпт:

`
Проверь статус бронирований через API:
http://localhost:3001/api/dashboard

Если есть:
1. Заезды сегодня → отправь список
2. Выезды сегодня → отправь список + создай задачи на уборку если еще нет
3. Незавершенные уборки → напомни

Формат: короткое сообщение с emoji, по-русски
`
```

## Webhook уведомления (будущее)

В будущем можно добавить webhooks в backend:

```javascript
// В backend/src/server.js
async function notifyClawd(event, data) {
  await fetch('http://localhost:3000/api/webhook/atrani-booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, data })
  });
}

// При новом бронировании
notifyClawd('new_booking', booking);

// При изменении статуса уборки
notifyClawd('cleaning_completed', cleaningTask);
```

## Полезные фильтры

```bash
# Бронирования только Booking.com
curl "http://localhost:3001/api/bookings?source=booking" | jq

# Бронирования только Airbnb
curl "http://localhost:3001/api/bookings?source=airbnb" | jq

# Активные бронирования (гости сейчас в объекте)
curl "http://localhost:3001/api/bookings?active=true" | jq

# Уборки конкретного типа
curl "http://localhost:3001/api/cleaning-tasks?task_type=checkout" | jq
curl "http://localhost:3001/api/cleaning-tasks?task_type=turnaround" | jq
curl "http://localhost:3001/api/cleaning-tasks?task_type=maintenance" | jq
```

## Статистика

```bash
# Сводка по всем бронированиям
curl "http://localhost:3001/api/bookings/summary" | jq

# Пример ответа:
{
  "total": 42,
  "by_property": {
    "Vingtage Room": 8,
    "Orange Room": 12,
    ...
  },
  "by_source": {
    "booking": 25,
    "airbnb": 17
  },
  "upcoming": 5,
  "active": 3
}
```

## Безопасность (TODO)

⚠️ Сейчас API открыт без авторизации (только localhost).

Для продакшна добавить:
- API ключи (Bearer token)
- Rate limiting
- HTTPS (если доступ извне)

---

## Итого: Что Clawd может делать

✅ Проверять новые бронирования каждый час  
✅ Отправлять ежедневные сводки  
✅ Напоминать об уборках  
✅ Автоназначать уборщиц  
✅ Уведомлять о заездах/выездах  
✅ Генерировать статистику  
✅ Интегрироваться с другими системами (Telegram, календарь, и т.д.)

**API — мост между данными и автоматизацией** 🌉
