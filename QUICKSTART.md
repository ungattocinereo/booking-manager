# 🚀 Быстрый старт

## Первый запуск

```bash
cd ~/.openclaw/workspace/atrani-booking-manager
./start.sh
```

Готово! Система запущена:
- **API:** http://localhost:3001
- **Frontend:** http://localhost:8080

## Доступ из локальной сети

Узнай свой IP:
```bash
./manage.sh ip
```

Теперь можешь открыть на любом устройстве в локальной сети:
- **Frontend:** `http://[ТВО_IP]:8080`
- **API:** `http://[ТВО_IP]:3001`

Например:
- `http://192.168.1.100:8080` (с телефона, планшета, другого компа)

## Основные команды

```bash
# Статус системы
./manage.sh status

# Логи в реальном времени
./manage.sh logs

# Синхронизация календарей вручную
./manage.sh sync

# Бэкап базы данных
./manage.sh backup

# Остановка
./manage.sh stop

# Запуск заново
./manage.sh start
```

## API Endpoints (примеры)

### Получить все бронирования
```bash
curl http://localhost:3001/api/bookings | jq
```

### Предстоящие бронирования
```bash
curl "http://localhost:3001/api/bookings?from_date=$(date +%Y-%m-%d)" | jq
```

### Дашборд (полная картина)
```bash
curl http://localhost:3001/api/dashboard | jq
```

### Список свойств
```bash
curl http://localhost:3001/api/properties | jq
```

### Задачи на уборку
```bash
curl http://localhost:3001/api/cleaning-tasks | jq
```

## Из локальной сети

Замени `localhost` на IP сервера:

```bash
# С телефона/планшета в той же сети
curl http://192.168.1.100:3001/api/bookings
```

Или открой в браузере: `http://192.168.1.100:8080`

## Автосинхронизация

Календари автоматически синхронизируются каждый час.  
Можешь запустить вручную: `./manage.sh sync`

## Troubleshooting

**Порты заняты?**
```bash
# Проверь что занимает порт
lsof -i :3001
lsof -i :8080

# Измени порты в docker-compose.yml:
# ports:
#   - "3002:3001"  # теперь API на 3002
#   - "8081:80"    # frontend на 8081
```

**База данных пустая?**
```bash
# Запусти синхронизацию
./manage.sh sync

# Проверь логи
./manage.sh logs
```

**Не могу подключиться из локальной сети?**
- Проверь firewall на Mac (System Settings → Network → Firewall)
- Убедись что устройства в одной сети Wi-Fi
- Узнай правильный IP: `./manage.sh ip`

## Что дальше?

- Настрой календари в `backend/config/calendars.json`
- Добавь collaboratrici (уборщиц) там же
- Интегрируй с Clawd для уведомлений
- Добавь в автозагрузку (если нужно):
  ```bash
  # Добавь в crontab
  @reboot cd ~/.openclaw/workspace/atrani-booking-manager && ./start.sh
  ```

---

📖 Полная документация: [README.md](README.md)
