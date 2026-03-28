# 🚀 Quick Start Guide

## 30-секундный старт

```bash
cd ~/.openclaw/workspace/atrani-booking-manager

# 1. Установить зависимости
npm install

# 2. Синхронизировать календари
npm run sync

# 3. Запустить сервер
npm start
```

Готово! API работает на http://localhost:3001

## Первые шаги

### 1. Проверить статус
```bash
curl http://localhost:3001/api/dashboard | jq .stats
```

Вывод:
```json
{
  "totalProperties": 8,
  "upcomingBookings": 128,
  "pendingTasks": 127,
  "totalCleaners": 2
}
```

### 2. Посмотреть ближайшие бронирования
```bash
curl http://localhost:3001/api/bookings | jq '.[:3]'
```

### 3. Календарь уборок на сегодня
```bash
curl "http://localhost:3001/api/cleaning-tasks?from_date=$(date +%Y-%m-%d)" | jq '.[:5]'
```

### 4. Открыть веб-дашборд
```bash
cd frontend/public
python3 -m http.server 8000
# Открой: http://localhost:8000
```

## Что дальше?

📖 Читай полную документацию: [README.md](../README.md)
🔧 Настройка календарей: [backend/config/calendars.json](../backend/config/calendars.json)
📊 API reference: [README.md#api-endpoints](../README.md#api-endpoints)
🔐 GitHub setup: [docs/GITHUB_SETUP.md](GITHUB_SETUP.md)

## Troubleshooting

**Ошибка: "address already in use"**
```bash
PORT=3002 npm start
```

**Календари не синхронизируются**
```bash
npm run sync
# Проверь логи — возможно проблема с URL
```

**База данных пустая**
```bash
npm run sync  # Заполнит базу из календарей
```

---

Готово к работе! 🎉
