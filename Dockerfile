# Dockerfile для Atrani Booking Manager
FROM node:20-alpine

# Рабочая директория
WORKDIR /app

# Копируем package files
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем все остальное
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Создаем директорию для базы данных с правильными правами
RUN mkdir -p /app/backend/database && \
    chmod 777 /app/backend/database

# Экспонируем порт API
EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Запускаем сервер
CMD ["node", "backend/src/server.js"]
