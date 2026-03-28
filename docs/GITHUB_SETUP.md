# 📦 GitHub Setup & Deployment

Инструкция по загрузке проекта на GitHub и настройке автоматической синхронизации.

## 1️⃣ Создать репозиторий на GitHub

### Через веб-интерфейс:
1. Зайди на https://github.com/new
2. Название: `atrani-booking-manager`
3. Описание: `Booking and cleaning calendar management system for Atrani properties`
4. Visibility: **Private** (рекомендуется, т.к. содержит календари)
5. НЕ добавляй README, .gitignore, license (уже есть в проекте)
6. Нажми "Create repository"

### Или через gh CLI:
```bash
cd ~/.openclaw/workspace/atrani-booking-manager
gh repo create atrani-booking-manager --private --source=. --remote=origin --push
```

## 2️⃣ Подключить локальный репозиторий к GitHub

```bash
cd ~/.openclaw/workspace/atrani-booking-manager

# Добавить remote (замени USERNAME на свой GitHub username)
git remote add origin https://github.com/USERNAME/atrani-booking-manager.git

# Или через SSH (если настроен SSH key)
git remote add origin git@github.com:USERNAME/atrani-booking-manager.git

# Отправить код на GitHub
git branch -M main
git push -u origin main
```

## 3️⃣ Проверить что загрузилось

```bash
gh repo view --web
# Или открой: https://github.com/USERNAME/atrani-booking-manager
```

## 4️⃣ Настроить автоматическую синхронизацию (опционально)

### Вариант А: GitHub Actions (каждые 6 часов)

Создай файл `.github/workflows/sync-calendars.yml`:

```yaml
name: Sync Calendars

on:
  schedule:
    # Каждые 6 часов: 00:00, 06:00, 12:00, 18:00 UTC
    - cron: '0 */6 * * *'
  workflow_dispatch: # Можно запустить вручную

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Sync calendars
        run: npm run sync
      
      - name: Commit updated database
        run: |
          git config user.name "Calendar Sync Bot"
          git config user.email "bot@atrani-booking.local"
          git add backend/database/bookings.db
          git commit -m "Auto-sync: $(date)" || echo "No changes"
          git push
```

**Важно:** Добавь `*.db` в `.gitignore`, если не хочешь коммитить database (рекомендуется).

### Вариант Б: Local cron (Mac/Linux)

```bash
# Открыть crontab
crontab -e

# Добавить строку (синхронизация каждые 6 часов)
0 */6 * * * cd ~/.openclaw/workspace/atrani-booking-manager && npm run sync >> ~/atrani-sync.log 2>&1
```

### Вариант В: OpenClaw cron job (рекомендуется)

```bash
openclaw cron create \
  --schedule "0 */6 * * *" \
  --task "cd ~/.openclaw/workspace/atrani-booking-manager && npm run sync" \
  --name "Atrani Calendar Sync"
```

## 5️⃣ Защита чувствительных данных

### Текущий статус:
✅ URLs календарей НЕ являются секретными (публичные iCal ссылки)
✅ Нет API ключей или паролей в коде

### Рекомендация:
Если репозиторий приватный — всё безопасно.

Если хочешь сделать публичным:
1. Вынеси `backend/config/calendars.json` в `.env`
2. Добавь `.env` в `.gitignore`
3. Создай `.env.example` с placeholder'ами

## 6️⃣ Клонирование на другую машину

```bash
# Клонировать репозиторий
git clone https://github.com/USERNAME/atrani-booking-manager.git
cd atrani-booking-manager

# Установить зависимости
npm install

# Первая синхронизация
npm run sync

# Запустить сервер
npm start
```

## 7️⃣ Обновление кода

### На локальной машине:
```bash
cd ~/.openclaw/workspace/atrani-booking-manager

# Сделать изменения
# ...

# Закоммитить и отправить
git add .
git commit -m "Update: описание изменений"
git push
```

### На удалённой машине:
```bash
cd path/to/atrani-booking-manager
git pull
npm install  # если изменились зависимости
```

## 8️⃣ Backup базы данных

### Автоматический backup в Git (НЕ рекомендуется для production)
```bash
# Убрать *.db из .gitignore
sed -i '' '/\*.db/d' .gitignore

# Закоммитить базу
git add backend/database/bookings.db
git commit -m "Backup: $(date)"
git push
```

### Рекомендуемый подход: External backup
```bash
# Создать backup script
cat > scripts/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=~/atrani-backups
mkdir -p $BACKUP_DIR
DATE=$(date +%Y-%m-%d_%H-%M-%S)
cp backend/database/bookings.db "$BACKUP_DIR/bookings-$DATE.db"
echo "✅ Backup created: bookings-$DATE.db"
# Удалить backup старше 30 дней
find $BACKUP_DIR -name "bookings-*.db" -mtime +30 -delete
EOF

chmod +x scripts/backup-db.sh

# Добавить в cron (каждый день в 03:00)
crontab -e
# Добавить: 0 3 * * * ~/atrani-booking-manager/scripts/backup-db.sh
```

## 9️⃣ Useful Commands

### Проверить статус репозитория
```bash
git status
git log --oneline -10  # Последние 10 коммитов
```

### Откатить изменения
```bash
# Откатить незакоммиченные изменения
git checkout -- filename

# Откатить последний коммит
git revert HEAD
```

### Синхронизация с GitHub
```bash
# Скачать изменения
git pull

# Отправить изменения
git push
```

### Просмотр удалённых репозиториев
```bash
git remote -v
```

## 🔟 CI/CD (продвинутый уровень)

Если хочешь автоматический деплой при push:

`.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to production server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd ~/atrani-booking-manager
            git pull
            npm install
            npm run sync
            pm2 restart atrani-booking-manager
```

## 📝 Checklist перед первым push

- [ ] Проверить `.gitignore` (нет секретов/чувствительных данных)
- [ ] Обновить README.md с актуальной информацией
- [ ] Удалить тестовые данные (если есть)
- [ ] Проверить что `npm install && npm start` работает
- [ ] Добавить LICENSE (опционально)
- [ ] Настроить GitHub repo visibility (private/public)

## 🚨 Security Best Practices

1. **Никогда не коммить:**
   - `.env` файлы
   - API ключи
   - Пароли
   - Токены

2. **Использовать GitHub Secrets** для CI/CD

3. **Регулярно обновлять dependencies:**
   ```bash
   npm audit
   npm audit fix
   ```

4. **Включить Dependabot** для автоматических security updates

---

Готово! Теперь твой проект на GitHub и доступен с любой машины. 🎉
