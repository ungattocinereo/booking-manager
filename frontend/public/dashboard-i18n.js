(() => {
  const ITALIAN_TEXT = new Map(Object.entries({
    'Atrani — Бронирования': 'Atrani — Prenotazioni',
    'Бронирования': 'Prenotazioni',
    'Язык интерфейса': 'Lingua dell’interfaccia',
    'Русский': 'Russo',
    'Итальянский': 'Italiano',
    'Цветовая тема': 'Tema colore',
    'Системная тема': 'Tema di sistema',
    'Системное': 'Sistema',
    'Светлая тема': 'Tema chiaro',
    'День': 'Giorno',
    'Тёмная тема': 'Tema scuro',
    'Ночь': 'Notte',
    'Синхронизация': 'Sincronizza',
    'Синхронизация...': 'Sincronizzazione...',
    'Разделы приложения': 'Sezioni dell’applicazione',
    'Календарь': 'Calendario',
    'Уборка': 'Pulizie',
    'Статистика': 'Statistiche',
    'Налоги': 'Imposte',
    'Гости': 'Ospiti',
    'Atrani · операционный день': 'Atrani · giornata operativa',
    'Нет заездов и нет выездов': 'Nessun arrivo e nessuna partenza',
    'Сегодня': 'Oggi',
    'Завтра': 'Domani',
    'Заезды сегодня': 'Arrivi di oggi',
    'заезд': 'arrivo',
    'заезда': 'arrivi',
    'заездов': 'arrivi',
    'выезд': 'partenza',
    'выезда': 'partenze',
    'выездов': 'partenze',
    'ночь': 'notte',
    'ночи': 'notti',
    'ночей': 'notti',
    'день': 'giorno',
    'дня': 'giorni',
    'бронь': 'prenotazione',
    'брони': 'prenotazioni',
    'броней': 'prenotazioni',
    'ежедневный снимок': 'istantanea giornaliera',
    'ежедневных снимка': 'istantanee giornaliere',
    'ежедневных снимков': 'istantanee giornaliere',
    'гость': 'ospite',
    'гостя': 'ospiti',
    'гостей': 'ospiti',
    'проживание': 'soggiorno',
    'проживания': 'soggiorni',
    'проживаний': 'soggiorni',
    'Проверяем актуальность данных': 'Verifica aggiornamento dati',
    'Загружаем последнее состояние календарей…': 'Caricamento dello stato più recente dei calendari…',
    'Повторить': 'Riprova',
    'Всего бронирований': 'Prenotazioni totali',
    'Ближайшие заезды': 'Prossimi arrivi',
    'Конфликты': 'Conflitti',
    'Новые за 24ч': 'Nuove nelle ultime 24 ore',
    'Прямые': 'Dirette',
    'Завершено': 'Completata',
    'Недоступно': 'Non disponibile',
    'Месяц': 'Mese',
    'Масштаб календаря': 'Scala del calendario',
    'Группа апартаментов': 'Gruppo di appartamenti',
    'Платформа': 'Piattaforma',
    'Все платформы': 'Tutte le piattaforme',
    'Скрыть завершенные': 'Nascondi completate',
    'Проверяем историю статистики': 'Verifica dello storico statistiche',
    'Загружаем ежедневные снимки сезона…': 'Caricamento delle istantanee giornaliere della stagione…',
    'Операционный радар': 'Radar operativo',
    'Что потребует внимания': 'Cosa richiede attenzione',
    'Ближайшие 7 дней': 'Prossimi 7 giorni',
    'Период операционного радара': 'Periodo del radar operativo',
    '7 дней': '7 giorni',
    '14 дней': '14 giorni',
    '30 дней': '30 giorni',
    '90 дней': '90 giorni',
    'Динамика сезона': 'Andamento della stagione',
    'Как менялись бронирования': 'Come sono cambiate le prenotazioni',
    'Бронирования на выбранную дату': 'Prenotazioni alla data selezionata',
    'без изменений': 'nessuna variazione',
    'Ночи': 'Notti',
    'Занятость': 'Occupazione',
    'Сравнение появится после второго ежедневного снимка.': 'Il confronto apparirà dopo la seconda istantanea giornaliera.',
    'Предыдущий снимок': 'Istantanea precedente',
    'Дата снимка статистики': 'Data dell’istantanea statistica',
    'Следующий снимок': 'Istantanea successiva',
    'Числовые показатели доступны, но модуль графиков не загрузился.': 'I valori numerici sono disponibili, ma il modulo dei grafici non è stato caricato.',
    'Повторить графики': 'Ricarica i grafici',
    'Бронирования по месяцам': 'Prenotazioni per mese',
    'Airbnb и Booking.com по датам заезда': 'Airbnb e Booking.com per data di arrivo',
    'Заполняемость апартаментов': 'Occupazione degli appartamenti',
    'Доля занятых ночей в сезоне': 'Quota di notti occupate nella stagione',
    'Занятые ночи / продаваемые ночи (закрытые даты исключены)': 'Notti occupate / notti vendibili (date chiuse escluse)',
    'Занятые ночи / все календарные ночи (закрытые даты не исключены)': 'Notti occupate / tutte le notti di calendario (date chiuse incluse)',
    'Откуда гости': 'Provenienza degli ospiti',
    'Топ стран по бронированиям': 'Paesi principali per prenotazioni',
    'Дни заезда': 'Giorni di arrivo',
    'Распределение по дням недели': 'Distribuzione per giorno della settimana',
    'Средний срок проживания': 'Durata media del soggiorno',
    'Ночи на одно бронирование': 'Notti per prenotazione',
    'Гости по месяцам': 'Ospiti per mese',
    'Гости с заполненным количеством человек': 'Ospiti nelle prenotazioni con numero di persone indicato',
    'Имя уборщицы...': 'Nome dell’addetta...',
    'Добавить': 'Aggiungi',
    'Только неоплаченные': 'Solo non pagate',
    'Загрузите TXT, проверьте и отправьте в Alloggiati Web.': 'Carica il TXT, verificalo e invialo ad Alloggiati Web.',
    'Апартаменты': 'Appartamenti',
    'Апартамент': 'Appartamento',
    'Этапы отправки': 'Fasi dell’invio',
    'Выбрать или перетащить TXT из Comune': 'Seleziona o trascina il TXT del Comune',
    'Нажмите на поле или перетащите файл сюда · до 256 KB': 'Fai clic sull’area o trascina qui il file · massimo 256 KB',
    'Alloggiati Web · архив': 'Alloggiati Web · archivio',
    'Последние отправки': 'Ultimi invii',
    'Ежемесячный отчёт ISTAT': 'Report mensile ISTAT',
    'ISTAT · ежемесячный срок': 'ISTAT · scadenza mensile',
    'Считаем, сколько осталось до 4-го числа…': 'Calcolo dei giorni mancanti al giorno 4…',
    'Отчёт отправляется отдельно от Alloggiati.': 'Il report viene inviato separatamente da Alloggiati.',
    'дней': 'giorni',
    'ISTAT за месяц': 'ISTAT del mese',
    'Ежемесячная статистика · до 4-го числа': 'Statistiche mensili · entro il giorno 4',
    'Данные в Sinfonia Turismo': 'Dati in Sinfonia Turismo',
    'TXT пополняет черновик автоматически. Отчёт отправляется отдельно раз в месяц.': 'Il TXT aggiorna automaticamente la bozza. Il report viene inviato separatamente una volta al mese.',
    'В ISTAT внесено по': 'Dati ISTAT inseriti fino al',
    'Проверяем…': 'Verifica…',
    'Месяц отчёта ISTAT': 'Mese del report ISTAT',
    'Проверить': 'Verifica',
    'Выберите месяц для предварительной проверки.': 'Seleziona un mese per la verifica preliminare.',
    'Alloggiati Web · полный архив': 'Alloggiati Web · archivio completo',
    'История отправок': 'Storico degli invii',
    'Закрыть архив': 'Chiudi archivio',
    'Бронирование': 'Prenotazione',
    'Закрыть': 'Chiudi',
    'Команда и объекты': 'Squadra e strutture',
    'Уборка без накладок': 'Pulizie senza sovrapposizioni',
    'Назначения и публичные календари собраны в одном месте.': 'Assegnazioni e calendari pubblici sono raccolti in un unico posto.',
    'Сезон в движении': 'La stagione in movimento',
    'Цифры, которые помогают решать': 'Numeri che aiutano a decidere',
    'Загрузка, динамика и точки внимания — без визуального шума.': 'Occupazione, andamento e punti di attenzione, senza rumore visivo.',
    'Налоги без хвостов': 'Imposte senza arretrati',
    'Платежи по датам и гостям, с понятным статусом каждого визита.': 'Pagamenti per data e ospite, con lo stato chiaro di ogni soggiorno.',
    'Гости под контролем': 'Ospiti sotto controllo',
    'Проверка и отправка документов без потери контекста.': 'Verifica e invio dei documenti senza perdere il contesto.',
    'время синхронизации неизвестно': 'orario di sincronizzazione sconosciuto',
    'только что': 'pochi istanti fa',
    'Показаны сохранённые данные': 'Visualizzati i dati salvati',
    'Данные загружены, статус синхронизации неизвестен': 'Dati caricati, stato della sincronizzazione sconosciuto',
    'Данные требуют обновления': 'I dati devono essere aggiornati',
    'Последняя синхронизация завершилась ошибкой': 'L’ultima sincronizzazione è terminata con un errore',
    'Календари обновлены частично': 'Calendari aggiornati parzialmente',
    'Данные актуальны': 'Dati aggiornati',
    'Обновляем данные': 'Aggiornamento dati',
    'Проверяем состояние календарей…': 'Verifica dello stato dei calendari…',
    'Загрузка…': 'Caricamento…',
    'Ошибка загрузки': 'Errore di caricamento',
    'Ошибка загрузки. Нажмите «Синхронизация».': 'Errore di caricamento. Premi «Sincronizza».',
    'Не удалось обновить данные': 'Impossibile aggiornare i dati',
    'На экране оставлена последняя загруженная версия': 'È rimasta visibile l’ultima versione caricata',
    'Проверьте соединение и повторите попытку': 'Controlla la connessione e riprova',
    'Получен пустой ответ. Календарь оставлен без изменений.': 'È arrivata una risposta vuota. Il calendario non è stato modificato.',
    'Получен подозрительно пустой ответ': 'È arrivata una risposta insolitamente vuota',
    'На экране оставлены последние непустые данные; выполняем контрольный запрос': 'Sono rimasti visibili gli ultimi dati non vuoti; è in corso una richiesta di controllo',
    'На экране оставлены последние непустые данные; повторите обновление': 'Sono rimasti visibili gli ultimi dati non vuoti; ripeti l’aggiornamento',
    'Сегодня заездов нет': 'Nessun arrivo oggi',
    'Завтра заездов нет': 'Nessun arrivo domani',
    'Ближайших заездов нет': 'Nessun prossimo arrivo',
    'ПРЯМОЕ': 'DIRETTA',
    'Закрыто': 'Chiuso',
    'Дата не определена': 'Data non definita',
    'Сезон': 'Stagione',
    'Все группы': 'Tutti i gruppi',
    'Нет апартаментов для выбранной группы.': 'Nessun appartamento nel gruppo selezionato.',
    'Список': 'Elenco',
    'конфликт': 'conflitto',
    'Нет заездов, выездов и конфликтов.': 'Nessun arrivo, partenza o conflitto.',
    'Booking · данные гостя не получены': 'Booking · dati dell’ospite non ricevuti',
    'Booking · без имени': 'Booking · senza nome',
    'налог не отмечен': 'imposta non segnata',
    'выезд': 'partenza',
    'заезд': 'arrivo',
    'Booking без данных гостя': 'Booking senza dati dell’ospite',
    'Недоступность': 'Indisponibilità',
    'Booking · нужны детали': 'Booking · dettagli necessari',
    'Эта бронь уже завершена.': 'Questa prenotazione è già terminata.',
    'Booking.com подтверждает занятость, но имя гостя ещё не получено.': 'Booking.com conferma l’occupazione, ma il nome dell’ospite non è ancora disponibile.',
    'Это закрытый или недоступный период.': 'Questo è un periodo chiuso o non disponibile.',
    'Активная или будущая бронь.': 'Prenotazione attiva o futura.',
    'Страна': 'Paese',
    'Налог': 'Imposta',
    'Заезд': 'Arrivo',
    'Выезд / уборка': 'Partenza / pulizia',
    'Открыть бронь': 'Apri prenotazione',
    'Снять отметку налога': 'Rimuovi pagamento imposta',
    'Отметить налог оплачен': 'Segna imposta pagata',
    'оплачен': 'pagata',
    'не отмечен': 'non segnata',
    'Ошибка обновления налога': 'Errore durante l’aggiornamento dell’imposta',
    'Не назначено': 'Non assegnata',
    'Всем апартаментам назначена уборщица': 'Tutti gli appartamenti hanno un’addetta assegnata',
    'Удалить': 'Elimina',
    'Ссылка:': 'Link:',
    'короткое-имя': 'nome-breve',
    'Введите имя для ссылки': 'Inserisci un nome per il link',
    'Ссылка удалена': 'Link eliminato',
    'Модуль графиков не ответил вовремя': 'Il modulo dei grafici non ha risposto in tempo',
    'Не удалось загрузить модуль графиков': 'Impossibile caricare il modulo dei grafici',
    'Сессия доступа истекла': 'La sessione di accesso è scaduta',
    'Доступ к истории статистики отклонён': 'Accesso allo storico statistiche negato',
    'Статистика недоступна на адресе Vercel': 'Statistiche non disponibili sull’indirizzo Vercel',
    'Защищённая история открывается только на основном домене b.amalfi.day.': 'Lo storico protetto è disponibile solo sul dominio principale b.amalfi.day.',
    'Маршрут истории не найден': 'Percorso dello storico non trovato',
    'Сервер ответил HTTP 404. Откройте основной домен или повторите после обновления.': 'Il server ha risposto con HTTP 404. Apri il dominio principale o riprova dopo l’aggiornamento.',
    'Сервер вернул страницу вместо данных': 'Il server ha restituito una pagina invece dei dati',
    'Вероятно, открылась страница входа или запрос попал на неверный маршрут.': 'Probabilmente si è aperta la pagina di accesso oppure la richiesta ha raggiunto il percorso sbagliato.',
    'Ошибка сервера статистики': 'Errore del server delle statistiche',
    'Сервер статистики не ответил вовремя': 'Il server delle statistiche non ha risposto in tempo',
    'Запрос прерван через 15 секунд. Проверьте соединение и повторите.': 'La richiesta è stata interrotta dopo 15 secondi. Controlla la connessione e riprova.',
    'Нет соединения с историей статистики': 'Nessuna connessione allo storico statistiche',
    'Проверьте интернет или VPN. Текущие показатели продолжают рассчитываться.': 'Controlla Internet o la VPN. I valori attuali continuano a essere calcolati.',
    'Получен некорректный ответ статистики': 'Risposta delle statistiche non valida',
    'Формат данных не совпал с ожидаемым. Повторите запрос; если ошибка останется, нужен серверный аудит.': 'Il formato dei dati non corrisponde a quello previsto. Riprova; se l’errore persiste, serve una verifica del server.',
    'Не удалось загрузить историю статистики': 'Impossibile caricare lo storico statistiche',
    'Повторите запрос через несколько секунд.': 'Riprova tra qualche secondo.',
    'Обновить сессию': 'Aggiorna sessione',
    'Открыть b.amalfi.day': 'Apri b.amalfi.day',
    'История статистики актуальна': 'Lo storico statistiche è aggiornato',
    'История пока не накоплена': 'Lo storico non è ancora disponibile',
    'Показан текущий расчёт. Ежедневная динамика появится после следующих синхронизаций.': 'È mostrato il calcolo attuale. L’andamento giornaliero apparirà dopo le prossime sincronizzazioni.',
    'Показана сохранённая история': 'Visualizzato lo storico salvato',
    'неизвестное время': 'orario sconosciuto',
    'Последний снимок обновлён частично': 'L’ultima istantanea è stata aggiornata parzialmente',
    'Ошибка загрузки статистики': 'Errore di caricamento delle statistiche',
    'Текущие данные': 'Dati attuali',
    'автосинк': 'sincronizzazione automatica',
    'ручной синк': 'sincronizzazione manuale',
    'сейчас': 'ora',
    'сохранённый dashboard': 'dashboard salvata',
    'последний dashboard': 'ultimo dashboard',
    'синк': 'sincronizzazione',
    'первый снимок': 'prima istantanea',
    'методика изменена': 'metodologia modificata',
    'Это первый ежедневный снимок — сравнение появится после следующей синхронизации.': 'Questa è la prima istantanea giornaliera: il confronto apparirà dopo la prossima sincronizzazione.',
    'сохранённая копия': 'copia salvata',
    'Занятые ночи': 'Notti occupate',
    'Заезды': 'Arrivi',
    'Выезды': 'Partenze',
    'Уборки': 'Pulizie',
    'Без уборщицы': 'Senza addetta',
    'Налог к сбору': 'Imposta da riscuotere',
    'Забронировано': 'Prenotato',
    'Окна без брони и технического закрытия': 'Intervalli senza prenotazioni né chiusure tecniche',
    'Окна без гостевых броней (данные закрытий недоступны)': 'Intervalli senza prenotazioni degli ospiti (dati sulle chiusure non disponibili)',
    'Данные уборок отсутствуют в сохранённой копии; обновите dashboard.': 'I dati delle pulizie non sono presenti nella copia salvata; aggiorna la dashboard.',
    'Технические закрытия учтены при поиске окон.': 'Le chiusure tecniche sono incluse nella ricerca degli intervalli.',
    'Технические закрытия в сохранённой копии недоступны.': 'Le chiusure tecniche non sono disponibili nella copia salvata.',
    'Загрузка рассчитана по занятым ночам.': 'L’occupazione è calcolata sulle notti occupate.',
    'Бронирования (сезон)': 'Prenotazioni (stagione)',
    'Загрузка сезона (прогноз)': 'Occupazione stagionale (previsione)',
    'Топ страна': 'Paese principale',
    'Среднее гостей': 'Media ospiti',
    'человек на бронирование': 'persone per prenotazione',
    'Другие': 'Altri',
    'Синхронизация уже выполняется': 'La sincronizzazione è già in corso',
    'Синхронизация календарей': 'Sincronizzazione dei calendari',
    'Получаем данные Airbnb и Booking.com…': 'Ricezione dei dati da Airbnb e Booking.com…',
    '✅ Синхронизация завершена': '✅ Sincronizzazione completata',
    'Ошибка синхронизации': 'Errore di sincronizzazione',
    'Синхронизация не завершена': 'Sincronizzazione non completata',
    'Повторите попытку позже': 'Riprova più tardi',
    'Можно проверить': 'Da verificare',
    'Проверено': 'Verificato',
    'Отправляем…': 'Invio…',
    'Отправлено': 'Inviato',
    'Частично': 'Parziale',
    'Проверить вручную': 'Verifica manualmente',
    'Архив': 'Archivio',
    'дата пока не найдена': 'data non ancora disponibile',
    'Читаем последнюю дату из Sinfonia': 'Lettura dell’ultima data da Sinfonia',
    'Последняя дата, подтверждённая Sinfonia': 'Ultima data confermata da Sinfonia',
    'Sinfonia пока не вернула последнюю дату': 'Sinfonia non ha ancora restituito l’ultima data',
    'Связь с ISTAT': 'Collegamento a ISTAT',
    'Не настроена': 'Non configurato',
    'Добавьте реквизиты этой структуры': 'Aggiungi le credenziali di questa struttura',
    '4-е число — сегодня': 'Il giorno 4 è oggi',
    'сегодня': 'oggi',
    'готово': 'pronto',
    'после срока': 'scaduto',
    'Календарные объекты ещё не связаны': 'Gli appartamenti del calendario non sono ancora collegati',
    'Реальные внешние отправки пока отключены до контрольной сверки и настройки секретов.': 'Gli invii esterni reali sono disattivati fino alla verifica di controllo e alla configurazione dei segreti.',
    'Для этого объекта не настроен доступ к Alloggiati Web.': 'L’accesso ad Alloggiati Web non è configurato per questa struttura.',
    'Для этой структуры ещё не задана связь с календарными объектами.': 'Gli appartamenti del calendario non sono ancora associati a questa struttura.',
    'Откройте ISTAT, чтобы проверить месяц.': 'Apri ISTAT per verificare il mese.',
    'Незавершённые файлы': 'File non completati',
    'Происхождение не указано': 'Provenienza non indicata',
    'Не указано': 'Non indicata',
    'Скачать квитанцию': 'Scarica ricevuta',
    'Отправлено без квитанции': 'Inviato senza ricevuta',
    'Свернуть архив': 'Riduci archivio',
    'TXT': 'TXT',
    'Проверка': 'Verifica',
    'Отправка': 'Invio',
    'Отпустите TXT-файл для загрузки': 'Rilascia il file TXT per caricarlo',
    'Выбрать или перетащить TXT-файл': 'Seleziona o trascina un file TXT',
    'Можно загрузить только один TXT-файл': 'Puoi caricare un solo file TXT',
    'Поддерживается только файл с расширением .txt': 'È supportato solo il formato .txt',
    'Файл больше 256 KB': 'Il file supera 256 KB',
    'TXT загружен': 'TXT caricato',
    'Открываем файл…': 'Apertura del file…',
    'Выберите другой файл.': 'Seleziona un altro file.',
    'Выберите жильё': 'Seleziona alloggio',
    'данные не приняты': 'dati non accettati',
    'Проверка пройдена. Файл готов к отправке.': 'Verifica superata. Il file è pronto per l’invio.',
    'Внешняя отправка отключена в настройках.': 'L’invio esterno è disattivato nelle impostazioni.',
    'Отправляем гостей в Alloggiati Web. Не закрывайте страницу.': 'Invio degli ospiti ad Alloggiati Web. Non chiudere la pagina.',
    'Отправка завершена. Персональные данные удалены по сроку хранения.': 'Invio completato. I dati personali sono stati eliminati secondo i tempi di conservazione.',
    'Часть гостей не принята. Проверьте ошибки ниже и не отправляйте файл повторно целиком.': 'Alcuni ospiti non sono stati accettati. Controlla gli errori qui sotto e non inviare di nuovo l’intero file.',
    'Alloggiati Web не подтвердил результат. Проверьте отправку вручную перед повторными действиями.': 'Alloggiati Web non ha confermato il risultato. Controlla manualmente l’invio prima di riprovare.',
    'Нужно исправить:': 'Da correggere:',
    'Скачать квитанцию': 'Scarica ricevuta',
    'Удалить файл': 'Elimina file',
    'Посмотреть гостей': 'Mostra ospiti',
    'Сначала выберите TXT.': 'Seleziona prima un TXT.',
    'Готово': 'Pronto',
    'Заполнить': 'Da compilare',
    'Жильё / бронь': 'Alloggio / prenotazione',
    'Занято комнат': 'Camere occupate',
    'Провинция': 'Provincia',
    'Код ISTAT': 'Codice ISTAT',
    'Сохранить': 'Salva',
    'Проверка пройдена': 'Verifica superata',
    'Найдены ошибки': 'Sono stati trovati errori',
    'Гости отправлены': 'Ospiti inviati',
    'Файл удалён': 'File eliminato',
    'прибытий': 'arrivi',
    'отъездов': 'partenze',
    'комнато-дней': 'giorni-camera',
    'дней отправлено': 'giorni inviati',
    'день нужно обновить': 'giorno da aggiornare',
    'дней нужно обновить': 'giorni da aggiornare',
    'дней ожидают отправки': 'giorni in attesa di invio',
    'Последняя дата ISTAT': 'Ultima data ISTAT',
    'Не удалось проверить': 'Impossibile verificare',
    'Отправлено в ISTAT': 'Inviato a ISTAT',
    'Нужно обновить': 'Da aggiornare',
    'Ожидает отправки': 'In attesa di invio',
    'Месячная таблица готова к отправке.': 'La tabella mensile è pronta per l’invio.',
    'Это черновик из ежедневных импортов. Нулевые дни тоже входят в отчёт.': 'Questa è una bozza generata dalle importazioni giornaliere. Anche i giorni a zero fanno parte del report.',
    'Дата': 'Data',
    'Прибыло': 'Arrivi',
    'Осталось': 'Presenti',
    'Уехало': 'Partenze',
    'Комнат': 'Camere',
    'Состояние': 'Stato',
    'Обновить ISTAT': 'Aggiorna ISTAT',
    'Отправить месяц': 'Invia mese',
    'Загрузка...': 'Caricamento...',
    'Нет данных': 'Nessun dato',
    'Оплачено': 'Pagata',
    'Отметить оплату': 'Segna pagamento',
    'Ошибка обновления': 'Errore durante l’aggiornamento',
    'Пакет не найден': 'Pacchetto non trovato',
    'Неизвестный вид списка импортов': 'Vista dell’elenco importazioni sconosciuta',
    'Нужны unit_id и date в формате YYYY-MM-DD': 'Sono necessari unit_id e date nel formato YYYY-MM-DD',
    'Квитанция не найдена': 'Ricevuta non trovata',
    'Не удалось получить квитанцию': 'Impossibile recuperare la ricevuta',
    'Неизвестная отчётная структура': 'Struttura ricettiva sconosciuta',
    'Дождитесь завершения отправки Alloggiati': 'Attendi il completamento dell’invio ad Alloggiati',
    'Персональные данные этого пакета уже удалены': 'I dati personali di questo pacchetto sono già stati eliminati',
    'Группа гостей не принадлежит этому пакету': 'Il gruppo di ospiti non appartiene a questo pacchetto',
    'Апартамент не относится к выбранной отчётной структуре': 'L’appartamento non appartiene alla struttura ricettiva selezionata',
    'Количество комнат должно быть целым числом от 1 до 100': 'Il numero di camere deve essere un intero da 1 a 100',
    'Запись гостя не принадлежит выбранной группе': 'Il record dell’ospite non appartiene al gruppo selezionato',
    'Для каждого изменяемого гостя нужен корректный код страны или провинции': 'Ogni ospite modificato deve avere un codice paese o provincia valido',
    'Некорректная связь с бронью': 'Collegamento alla prenotazione non valido',
    'Бронь не совпадает с объектом и датами проживания': 'La prenotazione non corrisponde alla struttura e alle date del soggiorno',
    'Пакет изменился; обновите страницу': 'Il pacchetto è cambiato; aggiorna la pagina',
    'Реальная отправка пока отключена feature flag': 'L’invio reale è ancora disattivato dal feature flag',
    'Сначала выполните Test и подтвердите отправку': 'Esegui prima il test e conferma l’invio',
    'Этот пакет нельзя проверить в текущем состоянии': 'Questo pacchetto non può essere verificato nello stato attuale',
    'Отправка уже началась или пакет изменился; обновите страницу': 'L’invio è già iniziato oppure il pacchetto è cambiato; aggiorna la pagina',
    'ISTAT preview содержит блокирующие ошибки': 'L’anteprima ISTAT contiene errori bloccanti',
    'Preview изменился; повторите подтверждение': 'L’anteprima è cambiata; ripeti la conferma',
    'В Sinfonia уже есть отличающиеся данные за этот месяц; требуется отдельное подтверждение замены': 'Sinfonia contiene già dati diversi per questo mese; è necessaria una conferma separata per la sostituzione',
    'TXT превышает допустимый размер 256 KB': 'Il TXT supera la dimensione massima di 256 KB',
    'TXT не содержит записей': 'Il TXT non contiene record',
    'TXT содержит более 1000 записей': 'Il TXT contiene più di 1000 record',
    'Нельзя удалить TXT после попытки отправки в Alloggiati': 'Non puoi eliminare il TXT dopo un tentativo di invio ad Alloggiati',
    'Этот TXT уже импортирован для выбранной структуры': 'Questo TXT è già stato importato per la struttura selezionata',
    'Некорректный номер пакета': 'Numero del pacchetto non valido',
    'PII этого пакета уже удалены': 'I dati personali di questo pacchetto sono già stati eliminati',
    'дата заезда': 'data di arrivo',
    'дата рождения': 'data di nascita'
  }));

  const ITALIAN_COUNTRIES = {
    us:'Stati Uniti', ca:'Canada', gb:'Regno Unito', fr:'Francia', de:'Germania', it:'Italia', es:'Spagna',
    pt:'Portogallo', nl:'Paesi Bassi', be:'Belgio', ch:'Svizzera', at:'Austria', dk:'Danimarca', se:'Svezia',
    no:'Norvegia', fi:'Finlandia', pl:'Polonia', cz:'Repubblica Ceca', hu:'Ungheria', ro:'Romania', bg:'Bulgaria',
    gr:'Grecia', tr:'Turchia', ru:'Russia', ua:'Ucraina', il:'Israele', eg:'Egitto', au:'Australia',
    nz:'Nuova Zelanda', jp:'Giappone', kr:'Corea del Sud', cn:'Cina', in:'India', br:'Brasile',
    ar:'Argentina', cl:'Cile', co:'Colombia', mx:'Messico', sg:'Singapore', th:'Thailandia',
    ie:'Irlanda', is:'Islanda', lu:'Lussemburgo', vn:'Vietnam', id:'Indonesia', my:'Malaysia',
    ph:'Filippine', za:'Sudafrica'
  };
  const RUSSIAN_COUNTRIES = {
    us:'США', ca:'Канада', gb:'Великобритания', fr:'Франция', de:'Германия', it:'Италия', es:'Испания',
    pt:'Португалия', nl:'Нидерланды', be:'Бельгия', ch:'Швейцария', at:'Австрия', dk:'Дания', se:'Швеция',
    no:'Норвегия', fi:'Финляндия', pl:'Польша', cz:'Чехия', hu:'Венгрия', ro:'Румыния', bg:'Болгария',
    gr:'Греция', tr:'Турция', ru:'Россия', ua:'Украина', il:'Израиль', eg:'Египет', au:'Австралия',
    nz:'Новая Зеландия', jp:'Япония', kr:'Южная Корея', cn:'Китай', in:'Индия', br:'Бразилия',
    ar:'Аргентина', cl:'Чили', co:'Колумбия', mx:'Мексика', sg:'Сингапур', th:'Таиланд',
    ie:'Ирландия', is:'Исландия', lu:'Люксембург', vn:'Вьетнам', id:'Индонезия', my:'Малайзия',
    ph:'Филиппины', za:'ЮАР'
  };

  function keepOuterWhitespace(source, translated) {
    const leading = source.match(/^\s*/)?.[0] || '';
    const trailing = source.match(/\s*$/)?.[0] || '';
    return `${leading}${translated}${trailing}`;
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  let embeddedTranslationsCache = null;

  function translateDynamic(source) {
    let match;
    if ((match = source.match(/^(\d+) мин назад$/))) return `${match[1]} min fa`;
    if ((match = source.match(/^(\d+) ч назад$/))) return `${match[1]} h fa`;
    if ((match = source.match(/^(\d+) дн назад$/))) return `${match[1]} gg fa`;
    if ((match = source.match(/^(\d+) (?:заезд|заезда|заездов)$/))) return `${match[1]} ${Number(match[1]) === 1 ? 'arrivo' : 'arrivi'}`;
    if ((match = source.match(/^(\d+) (?:ночь|ночи|ночей)$/))) return `${match[1]} ${Number(match[1]) === 1 ? 'notte' : 'notti'}`;
    if ((match = source.match(/^(\d+) (?:день|дня|дней)$/))) return `${match[1]} ${Number(match[1]) === 1 ? 'giorno' : 'giorni'}`;
    if ((match = source.match(/^(\d+) чел\.$/))) return `${match[1]} ospiti`;
    if ((match = source.match(/^\.\.\.и ещё (\d+)$/))) return `…e altri ${match[1]}`;
    if ((match = source.match(/^Без уборщицы \((\d+)\)$/))) return `Senza addetta (${match[1]})`;
    if ((match = source.match(/^Заезд (.+) → выезд (.+)$/))) return `Arrivo ${match[1]} → partenza ${match[2]}`;
    if ((match = source.match(/^Обновлено (.+)$/))) return `Aggiornato ${match[1]}`;
    if ((match = source.match(/^Последняя синхронизация (.+)$/))) return `Ultima sincronizzazione: ${match[1]}`;
    if ((match = source.match(/^Последние актуальные данные: (.+)$/))) return `Ultimi dati aggiornati: ${match[1]}`;
    if ((match = source.match(/^Ответ сервера получен (.+)$/))) return `Risposta del server ricevuta ${match[1]}`;
    if ((match = source.match(/^Копия сохранена (.+); последняя синхронизация (.+)$/))) return `Copia salvata ${match[1]}; ultima sincronizzazione ${match[2]}`;
    if ((match = source.match(/^(\d+) (?:источник не обновился|источника не обновились); актуальные данные (.+)$/))) {
      return `${match[1]} ${Number(match[1]) === 1 ? 'fonte non aggiornata' : 'fonti non aggiornate'}; dati aggiornati ${match[2]}`;
    }
    if ((match = source.match(/^Показаны сохранённые данные (.+)$/))) return `Visualizzati i dati salvati alle ${match[1]}`;
    if ((match = source.match(/^Ссылка: (.+)$/))) return `Link: ${match[1]}`;
    if ((match = source.match(/^Переименовано: (.+)$/))) return `Rinominata: ${match[1]}`;
    if ((match = source.match(/^Удалить (.+)\?$/))) return `Eliminare ${match[1]}?`;
    if ((match = source.match(/^✅ (.+) добавлена$/))) return `✅ ${match[1]} aggiunta`;
    if ((match = source.match(/^🗑️ (.+) удалена$/))) return `🗑️ ${match[1]} eliminata`;
    if ((match = source.match(/^(❌ )?Ошибка: (.+)$/))) return `${match[1] || ''}Errore: ${match[2]}`;
    if ((match = source.match(/^Последние отправки · (.+)$/))) return `Ultimi invii · ${match[1]}`;
    if ((match = source.match(/^История отправок · (.+)$/))) return `Storico degli invii · ${match[1]}`;
    if ((match = source.match(/^Выбрать или перетащить TXT для (.+)$/))) return `Seleziona o trascina il TXT per ${match[1]}`;
    if ((match = source.match(/^Открыть отправку: (.+)$/))) return `Apri invio: ${match[1]}`;
    if ((match = source.match(/^Скачать квитанцию за (.+)$/))) return `Scarica la ricevuta del ${match[1]}`;
    if ((match = source.match(/^Показать ещё (\d+)$/))) return `Mostra altri ${match[1]}`;
    if ((match = source.match(/^Все отправки · (\d+)$/))) return `Tutti gli invii · ${match[1]}`;
    if ((match = source.match(/^Группа (\d+)$/))) return `Gruppo ${match[1]}`;
    if ((match = source.match(/^Строка (\d+)$/))) return `Riga ${match[1]}`;
    if ((match = source.match(/^(\d+) к оплате$/))) return `${match[1]} da pagare`;
    if ((match = source.match(/^(\d+) оплачено$/))) return `${match[1]} pagate`;
    if ((match = source.match(/^(\d+) всего$/))) return `${match[1]} totali`;
    if ((match = source.match(/^(\d+) оплачено из (\d+)$/))) return `${match[1]} pagate su ${match[2]}`;
    if ((match = source.match(/^(.+) · последний (.+)$/))) return `${match[1]} · ultima il ${match[2]}`;
    if ((match = source.match(/^Копия от (.+)\. (.+): (.+)$/))) {
      const title = ITALIAN_TEXT.get(match[2]) || translateDynamic(match[2]);
      const detail = ITALIAN_TEXT.get(match[3]) || translateDynamic(match[3]);
      return `Copia del ${match[1]}. ${title}: ${detail}`;
    }
    if ((match = source.match(/^Сервер отклонил запрос( \(HTTP \d+\))?\. Обновите сессию и войдите снова\.$/))) {
      return `Il server ha rifiutato la richiesta${match[1] || ''}. Aggiorna la sessione ed esegui di nuovo l’accesso.`;
    }
    if ((match = source.match(/^Cloudflare не разрешил этот маршрут( \(HTTP \d+\))?\. Повторите запрос; если ошибка останется, требуется проверка политики доступа\.$/))) {
      return `Cloudflare non ha autorizzato questo percorso${match[1] || ''}. Riprova; se l’errore persiste, controlla la policy di accesso.`;
    }
    if ((match = source.match(/^История временно недоступна( \(HTTP \d+\))?\. Текущие показатели продолжают рассчитываться\.$/))) {
      return `Lo storico è temporaneamente non disponibile${match[1] || ''}. I valori attuali continuano a essere calcolati.`;
    }
    if ((match = source.match(/^Сервер ответил HTTP (\d+)\.$/))) return `Il server ha risposto con HTTP ${match[1]}.`;
    if ((match = source.match(/^(.+) · исключено некорректных\/повторных: (\d+)$/))) return `${match[1]} · escluse non valide/duplicate: ${match[2]}`;
    if ((match = source.match(/^(.+) · ошибок источников: (\d+)$/))) return `${match[1]} · errori delle fonti: ${match[2]}`;
    if ((match = source.match(/^Сравнение с (.+)\. Детализация новых и снятых броней появится для снимков нового формата\.$/))) {
      return `Confronto con ${match[1]}. I dettagli sulle nuove prenotazioni e su quelle annullate saranno disponibili per le istantanee nel nuovo formato.`;
    }
    if ((match = source.match(/^Состав броней не изменился с (.+)\.$/))) return `La composizione delle prenotazioni non è cambiata dal ${match[1]}.`;
    if ((match = source.match(/^(.+) · сейчас$/))) return `${match[1]} · ora`;
    if ((match = source.match(/^([+−-]?[\d,.]+) п\.п\.$/))) return `${match[1]} p.p.`;
    if ((match = source.match(/^Окна без брони и технического закрытия: окон на (\d+)\+ ночи нет$/))) {
      return `Intervalli senza prenotazioni né chiusure tecniche: nessun intervallo di almeno ${match[1]} notti`;
    }
    if ((match = source.match(/^Окна без гостевых броней \(данные закрытий недоступны\): окон на (\d+)\+ ночи нет$/))) {
      return `Intervalli senza prenotazioni degli ospiti (dati sulle chiusure non disponibili): nessun intervallo di almeno ${match[1]} notti`;
    }
    if ((match = source.match(/^Свободно (\d+) из (\d+) апартамент-ночей в выбранном периоде\. Технические закрытия учтены при поиске окон\. Загрузка рассчитана по занятым ночам\.$/))) {
      return `${match[1]} notti-appartamento libere su ${match[2]} nel periodo selezionato. Le chiusure tecniche sono incluse nella ricerca degli intervalli. L’occupazione è calcolata sulle notti occupate.`;
    }
    if ((match = source.match(/^Свободно (\d+) из (\d+) апартамент-ночей в выбранном периоде\. Технические закрытия в сохранённой копии недоступны\. Загрузка рассчитана по занятым ночам\.$/))) {
      return `${match[1]} notti-appartamento libere su ${match[2]} nel periodo selezionato. Le chiusure tecniche non sono disponibili nella copia salvata. L’occupazione è calcolata sulle notti occupate.`;
    }
    if ((match = source.match(/^С (.+): \+(\d+) новых, −(\d+) снятых или изменённых броней\.$/))) {
      return `Dal ${match[1]}: +${match[2]} nuove, −${match[3]} prenotazioni annullate o modificate.`;
    }
    if ((match = source.match(/^Апрель — Ноябрь (\d{4})$/))) return `Aprile — Novembre ${match[1]}`;
    if ((match = source.match(/^(\d+) апартаментов · все календарные ночи$/))) return `${match[1]} appartamenti · tutte le notti di calendario`;
    if ((match = source.match(/^(\d+) бронирований$/))) return `${match[1]} prenotazioni`;
    if ((match = source.match(/^(\d+) продаваемых ночей(?: · (\d+) закрыто)?$/))) {
      return `${match[1]} notti vendibili${match[2] ? ` · ${match[2]} chiuse` : ''}`;
    }
    if ((match = source.match(/^⚠️ Обновлено частично: ошибок источников (\d+)$/))) return `⚠️ Aggiornamento parziale: ${match[1]} errori delle fonti`;
    if ((match = source.match(/^❌ Ошибка синхронизации: (.+)$/))) return `❌ Errore di sincronizzazione: ${match[1]}`;
    if ((match = source.match(/^(.+) · (\d+) (?:проживание|проживания|проживаний) · (.+)$/))) {
      return `${match[1]} · ${match[2]} ${Number(match[2]) === 1 ? 'soggiorno' : 'soggiorni'} · ${match[3]}`;
    }
    if ((match = source.match(/^До 4-го числа осталось (\d+) (?:день|дня|дней|giorni)$/))) return `Mancano ${match[1]} giorni al giorno 4`;
    if ((match = source.match(/^Отчёт за (.+) нужно отправить до (.+)\.$/))) return `Il report di ${match[1]} deve essere inviato entro il ${match[2]}.`;
    if ((match = source.match(/^ISTAT за (.+) уже отправлен$/))) return `ISTAT di ${match[1]} già inviato`;
    if ((match = source.match(/^В Sinfonia подтверждены данные по (.+)\.$/))) return `In Sinfonia sono confermati i dati fino al ${match[1]}.`;
    if ((match = source.match(/^Срок ISTAT прошёл (\d+) (?:день|дня|дней|giorni) назад$/))) return `La scadenza ISTAT è trascorsa da ${match[1]} giorni`;
    if ((match = source.match(/^Отчёт за (.+) нужно было отправить до (.+)\.$/))) return `Il report di ${match[1]} doveva essere inviato entro il ${match[2]}.`;
    if ((match = source.match(/^TXT загружен для (.+)$/))) return `TXT caricato per ${match[1]}`;
    if ((match = source.match(/^TXT содержит (\d+) ранее импортированных записей$/))) return `Il TXT contiene ${match[1]} record già importati`;
    if ((match = source.match(/^Строка (\d+): неверное поле (.+)$/))) return `Riga ${match[1]}: campo ${ITALIAN_TEXT.get(match[2]) || match[2]} non valido`;
    if ((match = source.match(/^Строка (\d+): невозможная дата (.+)$/))) return `Riga ${match[1]}: data ${ITALIAN_TEXT.get(match[2]) || match[2]} impossibile`;
    if ((match = source.match(/^Строка (\d+): ожидается (\d+) символов, получено (\d+)$/))) return `Riga ${match[1]}: previsti ${match[2]} caratteri, ricevuti ${match[3]}`;
    if ((match = source.match(/^Строка (\d+): неизвестный тип гостя (.+)$/))) return `Riga ${match[1]}: tipo di ospite ${match[2]} sconosciuto`;
    if ((match = source.match(/^Строка (\d+): срок проживания должен быть от 1 до 30 дней$/))) return `Riga ${match[1]}: la durata del soggiorno deve essere compresa tra 1 e 30 giorni`;
    if ((match = source.match(/^Строка (\d+): отсутствует имя или фамилия$/))) return `Riga ${match[1]}: nome o cognome mancante`;
    if ((match = source.match(/^Строка (\d+): неверный код пола$/))) return `Riga ${match[1]}: codice sesso non valido`;
    if ((match = source.match(/^Строка (\d+): для главной записи обязателен документ$/))) return `Riga ${match[1]}: il documento è obbligatorio per il record principale`;
    if ((match = source.match(/^Строка (\d+): тип (.+) указан без соответствующей главной записи (.+)$/))) return `Riga ${match[1]}: il tipo ${match[2]} non ha il record principale ${match[3]} corrispondente`;
    if ((match = source.match(/^Строка (\d+): дата заезда участника не совпадает с главной записью группы$/))) return `Riga ${match[1]}: la data di arrivo del componente non corrisponde al record principale del gruppo`;
    if ((match = source.match(/^Строка (\d+): (.+)$/))) return `Riga ${match[1]}: ${match[2]}`;
    if ((match = source.match(/^Проверить: (\d+) (.+)$/))) return `Verifica: ${match[1]} ${match[2]}`;
    if ((match = source.match(/^Отправить: (\d+) (.+)$/))) return `Invia: ${match[1]} ${match[2]}`;
    if ((match = source.match(/^Отправлено (.+)\.$/))) return `Inviato il ${match[1]}.`;
    if ((match = source.match(/^(.+) · (\d+) (.+) · (\d+) заездов$/))) return `${match[1]} · ${match[2]} ${match[3]} · ${match[4]} arrivi`;
    if ((match = source.match(/^(\d+) заполнить$/))) return `${match[1]} da compilare`;
    if ((match = source.match(/^Данные из (.+) используются для ежемесячного отчёта\.$/))) return `I dati di ${match[1]} vengono usati per il report mensile.`;
    if ((match = source.match(/^Группа сохранена для «(.+)»$/))) return `Gruppo salvato per «${match[1]}»`;
    if ((match = source.match(/^Считаем движения по дням для «(.+)»…$/))) return `Calcolo dei movimenti giornalieri per «${match[1]}»…`;
    if ((match = source.match(/^ISTAT для «(.+)» отправлен и проверен$/))) return `ISTAT per «${match[1]}» inviato e verificato`;
    if ((match = source.match(/^ISTAT для «(.+)» отправлен; нужна сверка$/))) return `ISTAT per «${match[1]}» inviato; è necessaria una verifica`;

    let translated = source;
    const phraseReplacements = [
      ['Реальные внешние отправки пока отключены до контрольной сверки и настройки секретов.', 'Gli invii esterni reali sono disattivati fino alla verifica di controllo e alla configurazione dei segreti.'],
      ['Для этого объекта не настроен доступ к Alloggiati Web.', 'L’accesso ad Alloggiati Web non è configurato per questa struttura.'],
      ['Для этой структуры ещё не задана связь с календарными объектами.', 'Gli appartamenti del calendario non sono ancora associati a questa struttura.'],
      ['Великобритания', 'Regno Unito'], ['Австралия', 'Australia'], ['Италия', 'Italia'],
      ['Германия', 'Germania'], ['Франция', 'Francia'], ['США', 'Stati Uniti']
    ];
    for (const [from, to] of phraseReplacements) translated = translated.replaceAll(from, to);
    const embeddedTranslations = embeddedTranslationsCache || (embeddedTranslationsCache = [...ITALIAN_TEXT.entries()]
      .filter(([from]) => /[А-Яа-яЁё]/.test(from) && from.length >= 4)
      .sort((a, b) => b[0].length - a[0].length)
      .map(([from, to]) => [new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(from)}(?=$|[^\\p{L}\\p{N}])`, 'gu'), to]));
    for (const [pattern, to] of embeddedTranslations) {
      translated = translated.replace(pattern, (_full, prefix) => `${prefix}${to}`);
    }
    for (const [countryCode, russianName] of Object.entries(RUSSIAN_COUNTRIES)) {
      translated = translated.replaceAll(russianName, ITALIAN_COUNTRIES[countryCode]);
    }
    translated = translated.replace(/(\d+) чел\./g, (_full, count) => `${count} ${Number(count) === 1 ? 'ospite' : 'ospiti'}`);
    return translated;
  }

  function translateText(value) {
    const source = String(value ?? '');
    if (window.AtraniI18n?.getLanguage() !== 'it' || !source.trim()) return source;
    const trimmed = source.trim();
    const exact = ITALIAN_TEXT.get(trimmed);
    if (exact) return keepOuterWhitespace(source, exact);
    const dynamic = translateDynamic(trimmed);
    return dynamic === trimmed ? source : keepOuterWhitespace(source, dynamic);
  }

  function localizeElement(element) {
    if (!(element instanceof Element)) return;
    if (element.matches('.booking-bar')) return;
    for (const attribute of ['aria-label', 'title', 'placeholder']) {
      if (!element.hasAttribute(attribute)) continue;
      const current = element.getAttribute(attribute);
      const translated = translateText(current);
      if (translated !== current) element.setAttribute(attribute, translated);
    }
  }

  const PRESERVED_CONTENT_SELECTOR = [
    '.bar-label', '.cal-property-title', '.prop-name', '.booking-panel-title',
    '.tax-property-name', '.tax-guest-name', '.cleaner-name-input',
    '#reportingCurrentUnitName', '.reporting-unit strong', '.reporting-stay-title',
    '.reporting-guest-row > span:first-child', '.reporting-history-property', '.user-provided-name'
  ].join(',');

  function isPreservedTextNode(node) {
    return Boolean(node.parentElement?.closest?.(PRESERVED_CONTENT_SELECTOR));
  }

  function localizeSubtree(root) {
    if (window.AtraniI18n?.getLanguage() !== 'it' || !root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      const parentName = root.parentElement?.tagName;
      if (parentName === 'SCRIPT' || parentName === 'STYLE' || isPreservedTextNode(root)) return;
      const translated = translateText(root.nodeValue);
      if (translated !== root.nodeValue) root.nodeValue = translated;
      return;
    }
    if (!(root instanceof Element) && root !== document) return;
    if (root instanceof Element) localizeElement(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const parentName = node.parentElement?.tagName;
        if (parentName === 'SCRIPT' || parentName === 'STYLE' || isPreservedTextNode(node)) continue;
        const translated = translateText(node.nodeValue);
        if (translated !== node.nodeValue) node.nodeValue = translated;
      } else {
        localizeElement(node);
      }
    }
  }

  function start() {
    if (window.AtraniI18n?.getLanguage() !== 'it') return;
    document.title = translateText(document.title);
    const description = 'Gestione delle prenotazioni e del calendario pulizie per gli appartamenti turistici di Atrani';
    const descriptions = document.querySelectorAll('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]');
    descriptions.forEach(meta => { meta.content = description; });
    const socialTitles = document.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]');
    socialTitles.forEach(meta => { meta.content = 'Atrani — Prenotazioni'; });
    localizeSubtree(document.body);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') localizeSubtree(record.target);
        record.addedNodes.forEach(localizeSubtree);
      }
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  }

  window.AtraniDashboardI18n = {
    countriesIt: ITALIAN_COUNTRIES,
    locale: () => window.AtraniI18n?.getLocale() || 'ru-RU',
    isItalian: () => window.AtraniI18n?.getLanguage() === 'it',
    translateText,
    localizeSubtree
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
