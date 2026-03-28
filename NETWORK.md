# 🌐 Настройка доступа из локальной сети

## Автоматический доступ

Docker уже настроен для доступа из локальной сети! Просто запусти:

```bash
./start.sh
```

И система автоматически покажет все доступные URL.

## Узнать свой IP

```bash
./manage.sh ip
```

Или вручную:

```bash
# macOS
ipconfig getifaddr en0  # Wi-Fi
ipconfig getifaddr en1  # Ethernet

# Linux
ip addr show | grep "inet " | grep -v 127.0.0.1
```

## Проверка доступности

### С самого Mac mini

```bash
curl http://localhost:3001/health
curl http://localhost:8080
```

### С другого устройства в сети

```bash
# Замени 192.168.1.100 на реальный IP Mac mini
curl http://192.168.1.100:3001/health
```

### Из браузера

Открой на телефоне/планшете/ноутбуке:
- `http://[IP_MAC_MINI]:8080` — красивый фронтенд
- `http://[IP_MAC_MINI]:3001/api/dashboard` — JSON API

## Firewall на macOS

Если не работает, проверь фаервол:

```bash
# Проверить статус
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# Выключить (если включен и блокирует)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off
```

Или через GUI:
1. System Settings → Network → Firewall
2. Убедись что Docker разрешен

## Порты по умолчанию

- **3001** — API (backend)
- **8080** — Frontend (nginx + dashboard)

Оба порта доступны из локальной сети автоматически.

## Изменить порты

Если порты заняты или нужны другие, отредактируй `docker-compose.yml`:

```yaml
services:
  booking-manager:
    ports:
      - "3002:3001"  # Теперь API на 3002

  frontend:
    ports:
      - "9000:80"    # Frontend на 9000
```

После изменений:
```bash
./manage.sh restart
```

## Постоянное имя хоста (опционально)

Если IP меняется, можно настроить mDNS (Bonjour):

1. Mac mini уже поддерживает `.local`
2. Сервер доступен по имени: `http://[ИМЯ_КОМПА].local:8080`

Узнать имя:
```bash
hostname
# Например: mac-mini.local
```

Тогда можно использовать:
```
http://mac-mini.local:8080
http://mac-mini.local:3001
```

## Доступ извне (интернет)

### Вариант 1: Ngrok (быстро и просто)

```bash
# Установи ngrok
brew install ngrok

# Открой туннель
ngrok http 8080
```

Получишь публичный URL типа `https://abc123.ngrok.io`

### Вариант 2: Cloudflare Tunnel

```bash
# Установи cloudflared
brew install cloudflared

# Запусти туннель
cloudflared tunnel --url http://localhost:8080
```

### Вариант 3: Проброс портов на роутере

1. Зайди в админку роутера (обычно `192.168.1.1`)
2. Найди Port Forwarding / NAT
3. Пробрось порты 3001 и 8080 на IP Mac mini
4. Теперь доступ по внешнему IP роутера

⚠️ **Важно:** При публичном доступе обязательно добавь аутентификацию!

## Доступ с мобильных устройств

### QR-код для быстрого доступа

Создай QR-код с URL:

```bash
# Установи qrencode
brew install qrencode

# Создай QR для фронтенда
qrencode -t ansiutf8 "http://$(ipconfig getifaddr en0):8080"
```

Отсканируй камерой телефона → готово!

### Добавить на домашний экран (iOS/Android)

1. Открой `http://[IP]:8080` в Safari/Chrome
2. Нажми "Поделиться" → "На экран Домой"
3. Готово — теперь как нативное приложение!

## Keenetic Router Integration

Если используешь Keenetic, можно настроить:

### Статический IP для Mac mini

1. Keenetic админка → Список устройств
2. Найди Mac mini
3. "Постоянный IP" → назначь (например, 192.168.1.100)

### Доменное имя (через KeenDNS)

1. Keenetic → KeenDNS
2. Создай домен типа `atrani.keenetic.link`
3. Проброс портов: 80 → Mac mini:8080
4. Доступ: `http://atrani.keenetic.link`

## Автозапуск при старте системы

### macOS (через launchd)

Создай файл `~/Library/LaunchAgents/io.atrani.booking-manager.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>io.atrani.booking-manager</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/greg/.openclaw/workspace/atrani-booking-manager/start.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>/Users/greg/.openclaw/workspace/atrani-booking-manager/logs/launchd-error.log</string>
    <key>StandardOutPath</key>
    <string>/Users/greg/.openclaw/workspace/atrani-booking-manager/logs/launchd-out.log</string>
</dict>
</plist>
```

Загрузи:
```bash
launchctl load ~/Library/LaunchAgents/io.atrani.booking-manager.plist
```

Теперь сервис стартует автоматически при загрузке Mac.

## Мониторинг и уведомления

### Webhook для уведомлений (Telegram)

Добавь в `backend/src/server.js` или настрой через Clawd:

```javascript
// При новом бронировании
fetch('https://api.telegram.org/bot[TOKEN]/sendMessage', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: '[CHAT_ID]',
    text: `🏠 Новое бронирование: ${booking.guest_name} → ${property.name}`
  })
});
```

### Health check мониторинг

Используй Uptime Kuma / Healthchecks.io:

- URL для проверки: `http://[IP]:3001/health`
- Интервал: каждую минуту
- Уведомления в Telegram при падении

---

## Итого: Быстрый чеклист

✅ Запусти: `./start.sh`  
✅ Узнай IP: `./manage.sh ip`  
✅ Проверь firewall (если не работает)  
✅ Открой на телефоне: `http://[IP]:8080`  
✅ Добавь в автозагрузку (если нужно постоянно)  
✅ Настрой мониторинг (опционально)

**Готово! Система доступна в локальной сети** 🎉
