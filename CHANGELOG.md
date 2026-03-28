# 📝 Changelog

## [2.0.0] - 2026-03-23 - Docker Edition

### ✨ Новое

- **Полная Docker-изация проекта**
  - `Dockerfile` для backend + frontend
  - `docker-compose.yml` с тремя сервисами (API, Frontend, Sync Cron)
  - Nginx для фронтенда с proxy к API
  - Health checks для всех сервисов
  
- **Автоматическая синхронизация**
  - Отдельный container с cron для ежечасного sync
  - Автозапуск при старте системы
  
- **Доступ из локальной сети**
  - API: `http://[IP]:3001`
  - Frontend: `http://[IP]:8080`
  - Работает сразу после `./start.sh`

### 🛠️ Утилиты управления

- **`start.sh`** — быстрый запуск всей системы
  - Автоматический билд и запуск
  - Показывает все URL (localhost + локальный IP)
  - Health check после старта
  
- **`manage.sh`** — полный набор команд управления
  - `start/stop/restart` — управление сервисами
  - `logs` — просмотр логов в реальном времени
  - `sync` — ручная синхронизация
  - `status` — статус всех сервисов + размер БД
  - `db` — доступ к SQLite CLI
  - `backup` — создание бэкапов
  - `rebuild` — пересборка образов
  - `ip` — показать IP для доступа из сети
  - `clean` — полная очистка

### 📚 Документация

- **QUICKSTART.md** — быстрый старт за 5 минут
- **NETWORK.md** — всё про доступ из локальной сети
  - Настройка firewall
  - Изменение портов
  - mDNS (.local имена)
  - Ngrok / Cloudflare tunnels
  - Автозапуск через launchd
  - QR-коды для мобильных устройств
  
- **CLAWD_INTEGRATION.md** — интеграция с Clawd
  - Примеры всех API endpoints
  - Утренние сводки
  - Напоминания об уборках
  - Автоназначение уборщиц
  - Мониторинг новых бронирований
  - Примеры cron jobs

### 🔧 Конфигурация

- `.env.example` — шаблон переменных окружения
- `.dockerignore` — оптимизация сборки образов
- `nginx.conf` — настройки веб-сервера
- Обновлен `.gitignore` для Docker-артефактов

### 📦 Docker Compose сервисы

1. **booking-manager** (API)
   - Node.js backend
   - Порт 3001
   - Персистентная БД через volume
   - Auto-restart

2. **frontend** (Nginx)
   - Статический фронтенд
   - Порт 8080
   - Proxy к API
   - Gzip сжатие

3. **sync-cron** (Автосинхронизация)
   - Alpine + cron
   - Запуск каждый час
   - Логи в `/app/logs/sync.log`

### 🌐 Сеть

- Все сервисы в одной Docker сети `booking-network`
- Внутренняя коммуникация через имена контейнеров
- Внешний доступ через пробрасываемые порты

### 🔒 Безопасность

- Volumes для персистентных данных
- Изоляция в Docker контейнерах
- Health checks для мониторинга
- TODO: Добавить API authentication

### 📊 Улучшения README

- Раздел Docker (рекомендуемый способ)
- Раздел управления через `manage.sh`
- Примеры использования API
- Troubleshooting

---

## [1.0.0] - 2026-03-18 - Initial Release

### ✨ Первая версия

- REST API для управления бронированиями
- Синхронизация с Booking.com и Airbnb (iCal)
- SQLite база данных
- Календарь уборок
- Dashboard endpoint
- Базовый HTML frontend
- Автоназначение уборок

### 📦 Объекты

8 апартаментов:
- Vingtage Room, Orange Room, Solo Room, Youth Room
- Awesome Apartments, Carina, Harmony, Royal

### 👥 Уборщицы

- Уборщица А (Vingtage, Orange, Solo)
- Уборщица Б (Orange, Solo, Youth)

---

## Типы изменений

- ✨ **Новое** — новые функции
- 🔧 **Изменено** — изменения в существующем функционале
- 🐛 **Исправлено** — баг-фиксы
- 🗑️ **Удалено** — удаленная функциональность
- 📚 **Документация** — обновления документации
- 🛠️ **Инфраструктура** — инструменты, CI/CD, Docker
