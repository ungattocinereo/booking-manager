# 🏠 Atrani Booking Manager

Sistema completo di gestione prenotazioni e calendario pulizie per le proprietà di Atrani.

## 📋 Caratteristiche

- **Sincronizzazione automatica** da Booking.com e Airbnb (via iCal)
- **Calendario pulizie** con assegnazione automatica alle collaboratrici
- **Dashboard web** per visualizzazione in tempo reale
- **API REST** per integrazione con Clawd e altri sistemi
- **Database SQLite** — nessun server esterno richiesto

## 🏗️ Architettura

```
atrani-booking-manager/
├── backend/
│   ├── src/
│   │   ├── server.js          # API REST
│   │   ├── database.js        # Database layer
│   │   └── sync-calendars.js  # Sincronizzazione iCal
│   ├── config/
│   │   └── calendars.json     # Configurazione proprietà e calendari
│   └── database/
│       ├── schema.sql         # Schema database
│       └── bookings.db        # SQLite database (auto-creato)
├── frontend/
│   └── public/
│       └── index.html         # Dashboard web
└── package.json
```

## 🚀 Installazione

### 🐳 Docker (Raccomandato)

**Modo più semplice — tutto in un comando:**

```bash
cd ~/.openclaw/workspace/atrani-booking-manager
./start.sh
```

Questo script:
- ✅ Builda le immagini Docker
- ✅ Avvia API + Frontend + Auto-sync
- ✅ Mostra tutti gli URL di accesso (localhost + IP locale)
- ✅ Configura sincronizzazione automatica ogni ora

**Accesso:**
- **API:** `http://localhost:3001`
- **Frontend:** `http://localhost:8080`
- **Dalla rete locale:** `http://[TUO_IP]:8080`

**Comandi utili:**
```bash
# Stato dei container
docker-compose ps

# Logи в реальном времени
docker-compose logs -f

# Перезапуск
docker-compose restart

# Остановка
docker-compose down

# Синхронизация вручную
docker-compose exec booking-manager node backend/src/sync-calendars.js
```

### 📦 Modo Tradizionale (senza Docker)

```bash
cd ~/.openclaw/workspace/atrani-booking-manager

# Installa dipendenze
npm install

# Primo sync dei calendari
npm run sync

# Avvia il server API
npm start
```

## 📊 Uso

### Server API
- **Docker:** Già avviato su `http://localhost:3001`
- **Tradizionale:** `npm start`

### Dashboard Web
- **Docker:** `http://localhost:8080` (nginx serve frontend + proxy API)
- **Tradizionale:** `http://localhost:3001/api/dashboard`

### Sincronizzazione Calendari
- **Docker:** Automatica ogni ora (via cron container)
- **Manuale:** `docker-compose exec booking-manager node backend/src/sync-calendars.js`
- **Tradizionale:** `npm run sync`

## 🔌 API Endpoints

### Proprietà
- `GET /api/properties` — Lista tutte le proprietà
- `GET /api/bookings` — Lista prenotazioni
  - Query params: `property_id`, `from_date`
- `GET /api/bookings/summary` — Riepilogo prenotazioni

### Pulizie
- `GET /api/cleaning-tasks` — Lista attività di pulizia
  - Query params: `cleaner_id`, `from_date`
- `POST /api/cleaning-tasks` — Crea nuova attività
- `POST /api/cleaning-tasks/:id/complete` — Segna come completata
- `POST /api/cleaning-tasks/:id/assign` — Assegna a collaboratrice

### Collaboratrici
- `GET /api/cleaners` — Lista collaboratrici e proprietà assegnate

### Sistema
- `POST /api/sync` — Avvia sincronizzazione calendari
- `GET /api/dashboard` — Dati completi per dashboard
- `GET /health` — Health check

## ⚙️ Configurazione

Modifica `backend/config/calendars.json` per:
- Aggiungere/rimuovere proprietà
- Aggiornare URL calendari iCal
- Configurare collaboratrici e assegnazioni

## 🗄️ Database

### Tabelle principali:
- **properties** — Elenco proprietà
- **bookings** — Prenotazioni consolidate (Booking.com + Airbnb)
- **cleaners** — Collaboratrici
- **cleaner_properties** — Assegnazione proprietà → collaboratrici
- **cleaning_tasks** — Calendario pulizie con stato

### Backup del database:
```bash
cp backend/database/bookings.db backend/database/bookings.db.backup
```

## 🤖 Integrazione Clawd

Clawd può interagire con l'API per:
- Controllare prossime prenotazioni
- Assegnare pulizie
- Generare report
- Inviare notifiche

Esempio:
```javascript
// Check upcoming bookings
const response = await fetch('http://localhost:3001/api/bookings?from_date=2026-03-18');
const bookings = await response.json();
```

## 📅 Automazione

### Sincronizzazione automatica con cron
```bash
# Aggiungi a crontab (ogni ora)
0 * * * * cd ~/.openclaw/workspace/atrani-booking-manager && npm run sync
```

### Notifiche pulizie
Clawd può monitorare `/api/cleaning-tasks` e inviare reminder alle collaboratrici.

## 🛠️ Управление (Docker)

Используй утилиту `manage.sh` для удобного управления:

```bash
# Запуск
./manage.sh start

# Остановка
./manage.sh stop

# Перезапуск
./manage.sh restart

# Логи (в реальном времени)
./manage.sh logs
./manage.sh logs frontend  # логи конкретного сервиса

# Синхронизация вручную
./manage.sh sync

# Статус всех сервисов + размер БД
./manage.sh status

# Доступ к базе данных (SQLite CLI)
./manage.sh db

# Бэкап базы данных
./manage.sh backup

# Показать IP для доступа из локальной сети
./manage.sh ip

# Пересборка образов (если изменился код)
./manage.sh rebuild

# Полная очистка (удаляет все!)
./manage.sh clean
```

## 🔧 Manutenzione

### Log e debugging
```bash
# Mostra bookings nel database
sqlite3 backend/database/bookings.db "SELECT * FROM bookings ORDER BY start_date DESC LIMIT 10;"

# Mostra pulizie pendenti
sqlite3 backend/database/bookings.db "SELECT * FROM cleaning_tasks WHERE status='pending' ORDER BY scheduled_date;"
```

### Reset database
```bash
rm backend/database/bookings.db
npm run sync
```

## 📦 Proprietà Configurate

1. **Vingtage Room**
2. **Orange Room**
3. **Solo Room**
4. **Youth Room**
5. **Awesome Apartments**
6. **Carina**
7. **Harmony**
8. **Royal**

## 👥 Collaboratrici

- **Уборщица А**: Vingtage, Orange, Solo
- **Уборщица Б**: Orange, Solo, Youth

## 🐛 Troubleshooting

**Problema: Calendari non si sincronizzano**
- Verifica le URL in `backend/config/calendars.json`
- Controlla la connessione internet
- Guarda i log: `npm run sync`

**Problema: API non risponde**
- Verifica che il server sia avviato: `npm start`
- Controlla la porta 3001: `lsof -i :3001`

**Problema: Database corrotto**
- Backup: `cp backend/database/bookings.db backend/database/bookings.db.backup`
- Reset: `rm backend/database/bookings.db && npm run sync`

## 📝 TODO

- [ ] Autenticazione API
- [ ] Email notifications per pulizie
- [ ] Mobile app (React Native)
- [ ] Export calendario pulizie (iCal)
- [ ] Multi-lingua dashboard
- [ ] Statistiche occupazione
- [ ] Integrazione WhatsApp per collaboratrici

## 📄 Licenza

MIT — Greg 2026
