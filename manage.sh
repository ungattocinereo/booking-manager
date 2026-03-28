#!/bin/bash
# Утилита управления Atrani Booking Manager

set -e
cd "$(dirname "$0")"

case "$1" in
  start)
    echo "🚀 Запуск сервисов..."
    docker-compose up -d
    echo "✅ Готово"
    ;;
  
  stop)
    echo "🛑 Остановка сервисов..."
    docker-compose down
    echo "✅ Остановлено"
    ;;
  
  restart)
    echo "🔄 Перезапуск..."
    docker-compose restart
    echo "✅ Перезапущено"
    ;;
  
  logs)
    docker-compose logs -f "${2:-booking-manager}"
    ;;
  
  sync)
    echo "🔄 Запуск синхронизации..."
    docker-compose exec booking-manager node backend/src/sync-calendars.js
    ;;
  
  status)
    echo "📊 Статус сервисов:"
    docker-compose ps
    echo ""
    echo "💾 Размер базы данных:"
    du -h backend/database/bookings.db 2>/dev/null || echo "База еще не создана"
    echo ""
    echo "🌐 API Health:"
    curl -s http://localhost:3002/health && echo "" || echo "❌ API недоступен"
    ;;
  
  db)
    echo "📊 Подключение к базе данных..."
    docker-compose exec booking-manager sqlite3 /app/backend/database/bookings.db
    ;;
  
  backup)
    BACKUP_FILE="backup/bookings-$(date +%Y%m%d-%H%M%S).db"
    mkdir -p backup
    echo "💾 Создание бэкапа: $BACKUP_FILE"
    cp backend/database/bookings.db "$BACKUP_FILE"
    echo "✅ Бэкап создан"
    ;;
  
  rebuild)
    echo "🔨 Пересборка образов..."
    docker-compose down
    docker-compose build --no-cache
    docker-compose up -d
    echo "✅ Готово"
    ;;
  
  clean)
    echo "🧹 Очистка (будут удалены: контейнеры, образы, volumes)..."
    read -p "Продолжить? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      docker-compose down -v
      docker image rm atrani-booking-manager_booking-manager 2>/dev/null || true
      docker image rm atrani-booking-manager_sync-cron 2>/dev/null || true
      echo "✅ Очищено"
    else
      echo "❌ Отменено"
    fi
    ;;
  
  ip)
    LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || ip addr show 2>/dev/null | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}' | cut -d/ -f1 || echo "не определен")
    echo "🌐 Доступ из локальной сети:"
    echo "   API:       http://$LOCAL_IP:3002"
    echo "   Frontend:  http://$LOCAL_IP:8080"
    ;;
  
  *)
    echo "🏠 Atrani Booking Manager - Управление"
    echo ""
    echo "Использование: ./manage.sh [команда]"
    echo ""
    echo "Команды:"
    echo "  start      Запустить сервисы"
    echo "  stop       Остановить сервисы"
    echo "  restart    Перезапустить сервисы"
    echo "  logs       Показать логи (добавьте имя сервиса: logs frontend)"
    echo "  sync       Запустить синхронизацию календарей вручную"
    echo "  status     Показать статус сервисов и API"
    echo "  db         Подключиться к базе данных SQLite"
    echo "  backup     Создать бэкап базы данных"
    echo "  rebuild    Пересобрать образы с нуля"
    echo "  clean      Удалить все контейнеры и образы (ОПАСНО)"
    echo "  ip         Показать IP для доступа из локальной сети"
    echo ""
    echo "Примеры:"
    echo "  ./manage.sh start"
    echo "  ./manage.sh logs booking-manager"
    echo "  ./manage.sh sync"
    echo "  ./manage.sh backup"
    ;;
esac
