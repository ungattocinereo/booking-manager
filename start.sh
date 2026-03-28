#!/bin/bash
# Скрипт запуска Atrani Booking Manager в Docker

set -e

cd "$(dirname "$0")"

echo "🏠 Atrani Booking Manager - Docker Setup"
echo "========================================="
echo ""

# Проверяем Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Docker daemon не запущен"
    exit 1
fi

# Создаем необходимые директории
mkdir -p logs
mkdir -p backend/database

# Останавливаем старые контейнеры
echo "🛑 Останавливаем старые контейнеры..."
docker-compose down 2>/dev/null || true

# Билдим и запускаем
echo "🔨 Собираем образы..."
docker-compose build

echo "🚀 Запускаем сервисы..."
docker-compose up -d

echo ""
echo "✅ Сервисы запущены!"
echo ""
echo "📍 Доступные URL:"
echo "   • API:       http://localhost:3002"
echo "   • Frontend:  http://localhost:8080"
echo "   • Dashboard: http://localhost:8080 (или http://localhost:3002/api/dashboard)"
echo ""
echo "🌐 Доступ из локальной сети:"
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || ip addr show 2>/dev/null | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}' | cut -d/ -f1 || echo "не определен")
if [ "$LOCAL_IP" != "не определен" ]; then
    echo "   • API:       http://$LOCAL_IP:3002"
    echo "   • Frontend:  http://$LOCAL_IP:8080"
fi
echo ""
echo "📊 Проверка статуса:"
echo "   docker-compose ps"
echo ""
echo "📋 Логи:"
echo "   docker-compose logs -f"
echo ""
echo "🔄 Первая синхронизация (запустится автоматически через cron):"
echo "   docker-compose exec booking-manager node backend/src/sync-calendars.js"
echo ""
echo "🛑 Остановка:"
echo "   docker-compose down"
echo ""

# Ждем пока сервисы поднимутся
echo "⏳ Ожидание готовности сервисов..."
sleep 5

# Проверяем здоровье
if curl -s http://localhost:3002/health > /dev/null 2>&1; then
    echo "✅ API готов к работе"
else
    echo "⚠️  API еще запускается, проверьте логи: docker-compose logs -f booking-manager"
fi

echo ""
echo "🎉 Готово!"
