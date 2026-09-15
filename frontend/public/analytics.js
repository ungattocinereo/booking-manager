/* Analytics rendering is separate from the calendar and uses server-computed data. */
(() => {
  const state = { year: null, period: 'year', property: '', platform: '', group: 'month', annualMetric: 'arrivals', cancellationBasis: 'event', historyMetric: 'bookings', historyMode: 'auto', historyFrom: null, historyTo: null, data: null, key: '', fetched: 0, charts: [], sequence: 0 };
  const t = (ru, it) => typeof IS_ITALIAN !== 'undefined' && IS_ITALIAN ? it : ru;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => n == null ? '—' : new Intl.NumberFormat(t('ru-RU', 'it-IT'), { maximumFractionDigits: 1 }).format(n);
  const percent = n => n == null ? '—' : `${num(n)}%`;
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const date = value => value ? new Intl.DateTimeFormat(t('ru-RU', 'it-IT'), { day:'numeric', month:'short', year:'numeric', timeZone:'Europe/Rome' }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value)) : '—';
  const month = value => new Intl.DateTimeFormat(t('ru-RU', 'it-IT'), { month:'short', timeZone:'UTC' }).format(new Date(`${value}-01T12:00:00Z`));
  const metricNames = () => ({ bookings:t('Бронирования','Prenotazioni'), nights:t('Занятые ночи','Notti prenotate'), occupancy:t('Загрузка','Occupazione'), guests:t('Гости','Ospiti') });
  const eventNames = () => ({ created:t('Новые','Nuove'), restored:t('Восстановлены','Ripristinate'), cancelled:t('Отменены','Annullate'), removed:t('Сняты с календаря','Rimosse dal calendario'), net:t('Изменение','Variazione'), changed:t('Переносы','Modifiche delle date') });
  function select(id, label, value, choices) { return `<label class="a-control" for="${id}">${esc(label)}<select id="${id}" data-setting="${id.replace('analytics-', '')}">${choices.map(([v,l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`; }
  function table(headers, rows, caption = '', open = false) { return `<details class="a-table-details" ${open ? 'open' : ''}><summary>${t('Таблица значений','Tabella dei valori')}</summary><div class="a-table-scroll" tabindex="0" role="region" aria-label="${esc(t('Таблица значений','Tabella dei valori'))}"><table class="a-table">${caption ? `<caption>${esc(caption)}</caption>` : ''}<thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((v,i)=>i===0?`<th scope="row">${esc(v)}</th>`:`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`; }
  function heading(title, subtitle, glyph, control = '') { return `<div class="a-heading"><div><h2>${icon(glyph)}${esc(title)}</h2><div class="a-sub">${esc(subtitle)}</div></div>${control}</div>`; }
  function chartArea(id, label) { return `<div class="a-chart" ${typeof Chart === 'undefined' ? 'hidden' : ''}><canvas id="${id}" role="img" aria-label="${esc(label)}"></canvas></div>`; }
  function kpi(label, value, sub, glyph, tone = '') { return `<div class="a-kpi stats-summary-card"><div class="a-kpi-top">${icon(glyph)}${esc(label)}</div><strong class="${tone}">${esc(value)}</strong><small>${esc(sub)}</small></div>`; }
  function colors() { const css = getComputedStyle(document.getElementById('statsTab')); return { created:css.getPropertyValue('--a-green').trim(), restored:themeCssColor('--chart-accent','#7842e8'), cancelled:css.getPropertyValue('--a-red').trim(), removed:css.getPropertyValue('--a-amber').trim(), net:css.getPropertyValue('--a-purple').trim(), muted:themeCssColor('--chart-text','#686b7d') }; }
  function dispose() { state.charts.forEach(c=>c.destroy()); state.charts = []; state.historyChart = null; }
  function chart(id, type, labels, datasets, extra = {}) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById(id); if (!canvas) return;
    const defaults = statsChartDefaults();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    state.charts.push(new Chart(canvas, { type, data:{labels,datasets}, options:{ responsive:true, maintainAspectRatio:false, animation:reduce?false:{duration:250}, interaction:{mode:'index',intersect:false}, plugins:{...defaults.plugins, legend:{...defaults.plugins.legend, position:'bottom'}}, scales:defaults.scales, ...extra } }));
  }
  function rankRows(entries, total, unit = '') {
    const max = Math.max(1,...entries.map(e=>e[1]||0));
    return `<div class="a-rank">${entries.length ? entries.map(([label,value])=>`<div class="a-rank-row"><span>${esc(label)}</span><span class="a-rank-track" aria-hidden="true"><span class="a-rank-fill" style="--fill:${(value||0)/max*100}%"></span></span><span class="a-rank-value">${num(value)}${unit}<small>${total ? ` · ${percent(value/total*100)}` : ''}</small></span></div>`).join('') : `<div class="a-empty">${t('Нет данных за выбранный период','Nessun dato per il periodo selezionato')}</div>`}</div>`;
  }
  function historyMode(data) {
    if (state.historyMode !== 'auto') return state.historyMode;
    return data.legacy_snapshots.length > data.snapshots.length ? 'legacy' : 'annual';
  }
  function historyData(data) {
    if (historyMode(data) === 'legacy') return data.legacy_snapshots.map(s=>({ date:s.snapshot_date||String(s.captured_at).slice(0,10), captured_at:s.captured_at, bookings:s.booking_count,nights:s.occupied_nights,occupancy:Number(s.occupancy_percent),guests:s.guest_count, version:s.payload?.calculation_version||1 }));
    return data.snapshots;
  }
  function comparisonHtml(comparison) {
    if (!comparison) return '';
    const {current,previous,days}=comparison;
    if (!current.available || !previous.available) return `<div class="a-note">${t('Сравнение с предыдущим месяцем появится после накопления сопоставимой истории.','Il confronto con il mese precedente sarà disponibile quando lo storico sarà sufficiente.')}</div>`;
    const difference=current.totals.created-previous.totals.created;
    return `<div class="a-coverage">${icon('git-compare-arrows')}<span>${t('Новые бронирования','Nuove prenotazioni')}: <strong>${num(current.totals.created)}</strong> ${t('против','contro')} <strong>${num(previous.totals.created)}</strong> · ${difference>0?'+':''}${num(difference)}. ${date(current.from)}–${date(current.through)} / ${date(previous.from)}–${date(previous.through)} · ${days} ${t('полных дней в каждом периоде','giorni completi in ciascun periodo')}.</span></div>`;
  }
  function paint() {
    const data=state.data; if (!data) return;
    const root=document.getElementById('analyticsRoot'); if (!root) return;
    const focused=document.activeElement?.id;
    dispose();
    const o=data.overview, movement=data.movement, totals=movement.totals;
    const known=movement.buckets.some(b=>b.coverage!=='none');
    const hasEvents = Object.keys(eventNames()).some(k => k !== 'net' && totals[k] > 0) || totals.cancellation_confirmed > 0;
    const complete = movement.buckets.every(b=>b.coverage==='observed');
    const labels=eventNames(), names=metricNames();
    const counts = k => known ? `${k==='net' && totals[k]>0?'+':''}${num(totals[k])}` : '—';
    const coverageText = known
      ? `${t('Учёт изменений с','Movimenti osservati dal')} ${date(movement.coverage_start)}. ${t('Пустые интервалы означают отсутствие истории. Неполные периоды отмечены в таблице.','Gli intervalli vuoti indicano assenza di storico. I periodi parziali sono indicati nella tabella.')}`
      : t('За выбранный период нет наблюдений за изменениями.','Nessuna osservazione dei movimenti nel periodo selezionato.');
    root.innerHTML = `
      <div class="a-toolbar" aria-label="${t('Фильтры статистики','Filtri statistiche')}">
        ${select('analytics-year',t('Год','Anno'),state.year,data.years.map(y=>[y,y]))}
        ${select('analytics-period',t('Период','Periodo'),state.period,[['year',t('Весь год','Anno intero')],['season',t('Апрель–ноябрь','Aprile–novembre')]])}
        <div class="a-filter-property">${select('analytics-property',t('Апартамент','Appartamento'),state.property,[['',t('Все апартаменты','Tutti gli appartamenti')],...data.properties.map(p=>[p.id,p.name])])}</div>
        ${select('analytics-platform',t('Платформа','Piattaforma'),state.platform,[['',t('Все платформы','Tutte le piattaforme')],['airbnb','Airbnb'],['booking','Booking.com'],['direct',t('Напрямую','Dirette')]])}
        <button class="a-btn a-refresh" type="button" data-refresh>${icon('refresh-cw')}${t('Обновить','Aggiorna')}</button>
      </div>
      <div class="a-section-head"><h2>${t('Год проживания','Anno del soggiorno')} · ${state.year}</h2><span>${t('Заезды и ночи по датам проживания','Arrivi e notti per date del soggiorno')}</span></div>
      <div class="a-kpis" id="statsSummary">
        ${kpi(t('Заезды','Arrivi'),num(o.arrivals),`${num(o.bookings)} ${t('броней пересекают период','prenotazioni intersecano il periodo')}`,'calendar-days')}
        ${kpi(t('Занятые ночи','Notti prenotate'),num(o.nights),t('День выезда не включён','Il giorno di partenza è escluso'),'bed-double')}
        ${kpi(t('Загрузка','Occupazione'),percent(o.occupancy),t('Доля продаваемых ночей','Quota delle notti vendibili'),'chart-no-axes-combined')}
        ${kpi(t('Гости','Ospiti'),num(o.guests),`${t('Число гостей известно для','Ospiti noti per')} ${num(o.guests_known)} / ${num(o.arrivals)} ${t('заездов','arrivi')}`,'users')}
      </div>
      <section class="a-card a-feature" id="statsDynamicsCard">
        ${heading(t('Как менялось число бронирований','Come cambiava il numero di prenotazioni'),t('Сохранённые значения на даты наблюдения','Valori salvati alle date di osservazione'),'chart-no-axes-combined')}
        <div id="analyticsHistoryContent"></div>
      </section>
      <div id="statsChartsStatus" class="a-coverage" role="status" ${typeof Chart!=='undefined'?'hidden':''}>${t('Модуль графиков не загрузился. Показатели и таблицы доступны.','Il modulo grafici non è disponibile. Valori e tabelle restano accessibili.')} <button class="a-btn" data-refresh>${t('Повторить','Riprova')}</button></div>
      <div class="a-grid" id="statsGrid">
        <section class="a-card stats-chart-card">
          ${heading(t('Год по месяцам','L’anno mese per mese'),t('Прошедшие и будущие заезды по текущим данным','Arrivi passati e futuri secondo i dati attuali'),'calendar-days',select('analytics-annualMetric',t('Показатель','Indicatore'),state.annualMetric,[['arrivals',t('Заезды','Arrivi')],['nights',t('Ночи','Notti')]]))}
          ${chartArea('analyticsAnnualChart',t('Распределение заездов или ночей по месяцам','Arrivi o notti per mese'))}
          ${table([t('Месяц','Mese'),t('Заезды','Arrivi'),t('Ночи','Notti'),'Airbnb','Booking.com',t('Напрямую','Dirette')],o.months.map(m=>[month(m.month),m.arrivals,m.nights,m.platforms.airbnb,m.platforms.booking,m.platforms.direct]),'',typeof Chart==='undefined')}
        </section>
        <section class="a-card stats-chart-card">
          ${heading(t('Отмены и снятые брони','Annullamenti e rimozioni'),t('Раздельно по подтверждению источника','Distinti secondo la conferma della fonte'),'calendar-x',select('analytics-cancellationBasis',t('Группировать','Raggruppa'),state.cancellationBasis,[['event',t('Когда отменили','Data di annullamento')],['arrival',t('Когда планировался заезд','Arrivo previsto')]]))}
          <div id="analyticsCancellationVisual"></div>
          <div id="analyticsCancellationTable"></div>
          <div class="a-note">${t('Снятие с календаря не доказывает отмену. Дата события — момент обнаружения, если источник не сообщил дату оформления.','La rimozione dal calendario non prova un annullamento. La data dell’evento è quella del rilevamento, se la fonte non indica la data originale.')}</div>
        </section>
      </div>
      <section class="a-card" id="analyticsMovement">
        ${heading(t('Что изменилось за период','Movimenti del periodo'),t('По дате события · любые даты будущего заезда','Per data dell’evento · qualsiasi data di arrivo'),'activity',select('analytics-group',t('Группировка','Raggruppamento'),state.group,[['month',t('Месяцы','Mesi')],['week',t('Недели','Settimane')],['day',t('Дни','Giorni')]]))}
        <div class="a-kpis" id="analyticsMovementSummary" ${hasEvents?'':'hidden'}>
        ${kpi(t('Новые бронирования','Nuove prenotazioni'),counts('created'),t('Впервые обнаружены в периоде','Rilevate per la prima volta nel periodo'),'calendar-plus','a-positive')}
        ${kpi(t('Подтверждённые отмены','Annullamenti confermati'),known?num(totals.cancelled+totals.cancellation_confirmed):'—',t('Явное подтверждение источником','Conferma esplicita della fonte'),'calendar-x','a-negative')}
        ${kpi(t('Снято с календаря','Rimosse dal calendario'),counts('removed'),t('Причина источником не указана','Motivo non indicato dalla fonte'),'calendar-minus','a-warning')}
        ${kpi(t('Изменение количества','Variazione del numero'),counts('net'),known?`${t('Восстановлены','Ripristinate')}: ${num(totals.restored)} · ${complete?t('полный период','periodo completo'):t('доступная часть периода','parte osservata del periodo')}`:t('По доступной истории','Secondo lo storico disponibile'),'chart-no-axes-combined',totals.net<0?'a-negative':'a-positive')}
      </div>
        ${hasEvents?chartArea('analyticsMovementChart',t('Новые бронирования и потери по периодам','Nuove prenotazioni e perdite per periodo')):`<div class="a-empty a-journal-empty">${icon('notebook-pen')}<strong>${t('Новых изменений пока не зарегистрировано','Nessun nuovo movimento registrato')}</strong><span>${t('Исходные бронирования уже учтены в показателях выше. Отмены, новые и снятые брони появятся здесь по мере обнаружения.','Le prenotazioni iniziali sono già incluse negli indicatori sopra. Annullamenti, nuove prenotazioni e rimozioni appariranno quando rilevati.')}</span></div>`}
        <div class="a-coverage">${icon('info')}<span>${esc(coverageText)}</span></div>
        ${hasEvents?`<div class="a-note">${t('Плюс — новые и восстановленные. Минус — отменённые и снятые. Переносы не увеличивают число броней.','Positivo: nuove e ripristinate. Negativo: annullate e rimosse. Le modifiche di date non aumentano il numero di prenotazioni.')}</div>`:''}
        ${hasEvents?comparisonHtml(data.comparison):''}
        ${table([t('Период','Periodo'),...Object.values(labels),t('Покрытие','Copertura')],movement.buckets.map(b=>[b.period,...Object.keys(labels).map(k=>b.coverage==='none'?'—':num(b[k])),b.coverage==='none'?t('Нет истории','Nessuno storico'):b.coverage==='partial'?t('Неполный','Parziale'):t('Наблюдался','Osservato')]),'',typeof Chart==='undefined')}
      </section>
      <section class="a-card">
        ${heading(t('Загрузка апартаментов','Occupazione degli appartamenti'),t('Занятые / продаваемые ночи · расчёт по текущему составу апартаментов','Notti prenotate / vendibili · inventario attuale degli appartamenti'),'bed-double')}
        <div class="a-table-scroll" role="region" tabindex="0" aria-label="${t('Загрузка по апартаментам и месяцам','Occupazione per appartamento e mese')}"><table class="a-table a-matrix"><thead><tr><th scope="col">${t('Апартамент','Appartamento')}</th>${o.months.map(m=>`<th scope="col">${month(m.month)}</th>`).join('')}<th scope="col">${t('Итого','Totale')}</th></tr></thead><tbody>${o.matrix.map(p=>{const sellable=p.months.reduce((s,m)=>s+m.sellable,0);return `<tr><th scope="row">${esc(p.name)}</th>${p.months.map(m=>`<td style="--heat:${m.occupancy==null?0:Math.min(45,m.occupancy*.45)}%" title="${m.nights} / ${m.sellable}">${percent(m.occupancy)}</td>`).join('')}<td class="a-matrix-total">${percent(sellable?p.months.reduce((s,m)=>s+m.nights,0)/sellable*100:null)}</td></tr>`;}).join('')}</tbody></table></div>
        <div class="a-matrix-key">0% <i aria-hidden="true"></i> 100% · ${t('«—» — нет продаваемых ночей','«—» — nessuna notte vendibile')}</div>
      </section>
      <div class="a-section-head"><h2>${t('Портрет гостей','Profilo degli ospiti')}</h2><span>${t('По заездам выбранного периода','Per arrivi nel periodo selezionato')}</span></div>
      <div class="a-grid">
        <section class="a-card stats-chart-card">${heading(t('Откуда гости','Provenienza degli ospiti'),t('Количество и доля бронирований','Numero e quota delle prenotazioni'),'globe')}<div id="analyticsCountries"></div></section>
        <section class="a-card stats-chart-card">${heading(t('Дни заезда','Giorni di arrivo'),t('Распределение по дням недели','Distribuzione per giorno della settimana'),'calendar-days')}${chartArea('analyticsWeekdayChart',t('Заезды по дням недели','Arrivi per giorno della settimana'))}<div id="analyticsWeekdayTable"></div></section>
        <section class="a-card stats-chart-card">${heading(t('Срок проживания','Durata del soggiorno'),t('Среднее число ночей по апартаментам','Numero medio di notti per appartamento'),'moon')}<div id="analyticsDuration"></div></section>
        <section class="a-card stats-chart-card">${heading(t('Гости по месяцам','Ospiti per mese'),`${t('Количество заполнено для','Numero compilato per')} ${num(o.guests_known)} / ${num(o.arrivals)} ${t('заездов','arrivi')}`,'users')}${chartArea('analyticsGuestsChart',t('Гости по месяцам','Ospiti per mese'))}${table([t('Месяц','Mese'),t('Гости','Ospiti'),t('Броней с числом гостей','Prenotazioni con numero ospiti')],o.months.map(m=>[month(m.month),num(m.guests),`${m.guests_known} / ${m.arrivals}`]),'',typeof Chart==='undefined')}</section>
      </div>

    `;
    const c=colors();
    const periodLabels=movement.buckets.map(b=>state.group==='month'?month(b.period):new Intl.DateTimeFormat(t('ru-RU','it-IT'),{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${b.start}T12:00:00Z`)));
    chart('analyticsMovementChart','bar',periodLabels,['created','restored','cancelled','removed'].map(k=>({label:labels[k],data:movement.buckets.map(b=>b.coverage==='none'?null:b[k]*(k==='cancelled'||k==='removed'?-1:1)),backgroundColor:c[k],borderRadius:4,stack:k==='created'||k==='restored'?'positive':'negative'})),{scales:{x:{...statsChartDefaults().scales.x,stacked:true},y:{...statsChartDefaults().scales.y,stacked:true}}});
    chart('analyticsAnnualChart','bar',o.months.map(m=>month(m.month)),state.annualMetric==='nights'?[{label:names.nights,data:o.months.map(m=>m.nights),backgroundColor:c.net,borderRadius:5}]:['airbnb','booking','direct'].map((p,i)=>({label:p==='booking'?'Booking.com':p==='airbnb'?'Airbnb':t('Напрямую','Dirette'),data:o.months.map(m=>m.platforms[p]),backgroundColor:[c.cancelled,c.net,c.created][i],borderRadius:4,stack:'arrivals'})),{scales:{x:{...statsChartDefaults().scales.x,stacked:true},y:{...statsChartDefaults().scales.y,stacked:true}}});
    const cancellationMonths = o.months.map(m=>({month:m.month,cancelled:null,removed:null}));
    if(state.cancellationBasis==='arrival') {
      cancellationMonths.forEach(m=>{const row=movement.cancellations_by_arrival.find(r=>r.month===m.month);if(movement.coverage_start){m.cancelled=row?.cancelled||0;m.removed=row?.removed||0;}});
    } else {
      // Event grouping remains monthly regardless of the main chart's grouping.
      const monthRows=data.movement_monthly?.buckets || movement.buckets;
      cancellationMonths.forEach(m=>{const row=monthRows.find(b=>b.period===m.month);if(row&&row.coverage!=='none'){m.cancelled=row.cancelled+row.cancellation_confirmed;m.removed=row.removed;}});
    }
    const hasCancellations=cancellationMonths.some(m=>m.cancelled>0||m.removed>0);
    document.getElementById('analyticsCancellationVisual').innerHTML=hasCancellations?chartArea('analyticsCancellationChart',t('Отмены и снятые брони по месяцам','Annullamenti e rimozioni per mese')):`<div class="a-empty a-journal-empty">${icon('calendar-check')}<strong>${t('Нет зарегистрированных отмен и снятий','Nessun annullamento o rimozione registrati')}</strong><span>${movement.coverage_start?`${t('Учёт изменений с','Movimenti osservati dal')} ${date(movement.coverage_start)}. `:''}${t('История до начала учёта недоступна.','Lo storico precedente non è disponibile.')}</span></div>`;
    chart('analyticsCancellationChart','bar',cancellationMonths.map(m=>month(m.month)),['cancelled','removed'].map(k=>({label:labels[k],data:cancellationMonths.map(m=>m[k]),backgroundColor:c[k],borderRadius:4})));
    document.getElementById('analyticsCancellationTable').innerHTML=table([t('Месяц','Mese'),labels.cancelled,labels.removed],cancellationMonths.map(m=>[month(m.month),num(m.cancelled),num(m.removed)]),t('Только зарегистрированные события; прошлое покрыто не полностью.','Solo eventi registrati; copertura storica incompleta.'),typeof Chart==='undefined');
    const countries=Object.entries(o.countries).sort((a,b)=>b[1]-a[1]).map(([code,n])=>[code==='unknown'?t('Не указано','Non indicata'):(new Intl.DisplayNames([t('ru','it')],{type:'region'}).of(/^[a-z]{2}$/i.test(code)?code.toUpperCase():'ZZ')||code),n]);
    document.getElementById('analyticsCountries').innerHTML=rankRows(countries,o.arrivals)+table([t('Страна','Paese'),t('Бронирования','Prenotazioni'),t('Доля','Quota')],countries.map(([name,n])=>[name,n,percent(o.arrivals?n/o.arrivals*100:null)]));
    const weekdays=t('Пн,Вт,Ср,Чт,Пт,Сб,Вс','Lun,Mar,Mer,Gio,Ven,Sab,Dom').split(',');
    chart('analyticsWeekdayChart','bar',weekdays,[{label:t('Заезды','Arrivi'),data:o.weekdays,backgroundColor:o.weekdays.map(n=>n===Math.max(...o.weekdays)?c.net:colorMix(c.net)),borderRadius:5}]);
    document.getElementById('analyticsWeekdayTable').innerHTML=table([t('День','Giorno'),t('Заезды','Arrivi'),t('Доля','Quota')],o.weekdays.map((n,i)=>[weekdays[i],n,percent(o.arrivals?n/o.arrivals*100:null)]),'',typeof Chart==='undefined');
    document.getElementById('analyticsDuration').innerHTML=rankRows(o.matrix.map(p=>[p.name,p.avg_stay]).sort((a,b)=>(b[1]||0)-(a[1]||0)),0)+table([t('Ночей','Notti'),t('Бронирования','Prenotazioni')],Object.entries(o.stay_buckets));
    chart('analyticsGuestsChart','bar',o.months.map(m=>month(m.month)),[{label:names.guests,data:o.months.map(m=>m.guests),backgroundColor:c.net,borderRadius:5}]);
    paintHistory();
    root.onchange=event=>{const setting=event.target.dataset.setting;if(!setting)return;state[setting]=event.target.value;if(['year','period','property','platform','group'].includes(setting)){state.historyFrom=null;state.historyTo=null;if(setting!=='group')state.historyMode='auto';renderStats();}else paint();};
    root.onclick=event=>{if(event.target.closest('[data-refresh]')){state.fetched=0;retryStatsHistory();}};
    if (typeof lucide!=='undefined')lucide.createIcons();
    if(focused)document.getElementById(focused)?.focus({preventScroll:true});
  }
  function colorMix(hex) { return /^#[0-9a-f]{6}$/i.test(hex)?`${hex}88`:hex; }
  function paintHistory() {
    const target=document.getElementById('analyticsHistoryContent');if(!target||!state.data)return;
    const existing=state.historyChart;
    if(existing){existing.destroy();state.charts=state.charts.filter(c=>c!==existing);state.historyChart=null;}
    const rows=historyData(state.data), names=metricNames(), mode=historyMode(state.data);
    const to=rows.find(r=>r.date===state.historyTo)||rows.at(-1);
    const from=rows.find(r=>r.date===state.historyFrom)||rows.find(r=>r.version===to?.version)||rows[0];
    const compatible=from&&to&&from.version===to.version&&from.date<=to.date&&from[state.historyMetric]!=null&&to[state.historyMetric]!=null;
    target.innerHTML=`<div class="a-history-controls">${select('analytics-historyMode',t('История','Storico'),state.historyMode,[['auto',t('Доступная история','Storico disponibile')],['annual',t('Новый годовой учёт','Nuovo storico annuale')],['legacy',t('Архив сезона апрель–ноябрь','Archivio aprile–novembre')]])}${select('analytics-historyMetric',t('Показатель','Indicatore'),state.historyMetric,Object.entries(names))}${rows.length?select('analytics-historyFrom',t('Сравнить с','Confronta con'),from.date,rows.map(r=>[r.date,date(r.date)]))+select('analytics-historyTo',t('На дату','Alla data'),to.date,rows.map(r=>[r.date,date(r.date)])):''}</div>
      ${rows.length?`<div class="a-history-scope">${icon('calendar-range')}<span>${mode==='legacy'?t('Сезон апрель–ноябрь','Stagione aprile–novembre'):state.period==='season'?t('Апрель–ноябрь','Aprile–novembre'):t('Весь год','Anno intero')} ${state.year} · ${esc(names[state.historyMetric])}</span></div>
      <div class="a-history-summary">
        <div><small>${date(from.date)}</small><strong>${state.historyMetric==='occupancy'?percent(from[state.historyMetric]):num(from[state.historyMetric])}</strong></div>
        <div><small>${date(to.date)}</small><strong id="statsDynamicBookings">${state.historyMetric==='occupancy'?percent(to[state.historyMetric]):num(to[state.historyMetric])}</strong></div>
        <div><small>${t('Изменение за интервал','Variazione nell’intervallo')}</small><strong class="a-history-delta">${compatible?`${to[state.historyMetric]-from[state.historyMetric]>0?'+':''}${num(to[state.historyMetric]-from[state.historyMetric])}${state.historyMetric==='occupancy'?t(' п.п.',' p.p.'):''}`:'—'}</strong></div>
      </div>
      ${!compatible?`<div class="a-note">${t('Сравнение недоступно: выберите даты по порядку и с одинаковой методикой подсчёта.','Confronto non disponibile: scegli date in ordine con lo stesso metodo di calcolo.')}</div>`:''}
      ${new Set(rows.map(r=>r.version)).size>1?`<div class="a-note">${t('Методика подсчёта менялась. В месте изменения линия прерывается; для сравнения автоматически выбраны сопоставимые даты.','Il metodo di calcolo è cambiato. La linea si interrompe nel punto di cambio; il confronto iniziale usa date compatibili.')}</div>`:''}
      ${rows.length>1?chartArea('analyticsHistoryChart',t('Состояние показателя на даты наблюдения','Valore alle date di osservazione')):`<div class="a-note">${t('Сохранена первая точка наблюдения. Следующие точки появятся после ежедневных синхронизаций.','È disponibile la prima osservazione. Le prossime verranno salvate con le sincronizzazioni giornaliere.')}</div>`}
      ${table([t('Дата','Data'),...Object.values(names)],rows.map(r=>[date(r.date),r.bookings,r.nights,percent(r.occupancy),num(r.guests)]),'',typeof Chart==='undefined')}`:`<div class="a-empty">${t('Для выбранных фильтров ещё нет сохранённой истории. Текущие значения доступны выше, распределение по месяцам — ниже.','Non è ancora disponibile uno storico per questi filtri. I valori attuali sono sopra, la distribuzione mensile sotto.')}</div>`}
      <div class="a-note">${mode==='legacy'?t('История сезона охватывает апрель–ноябрь, а не весь год. Изменение общего количества не позволяет отдельно определить новые брони и отмены.','Lo storico stagionale copre aprile–novembre, non l’intero anno. La variazione del totale non permette di distinguere nuove prenotazioni e annullamenti.'):t('Состояние бронирований на дату наблюдения. Все показатели используют выбранный год проживания и фильтры.','Stato alle date di osservazione. Gli indicatori usano l’anno di soggiorno e i filtri selezionati.')}</div>`;
    if(rows.length>1){chart('analyticsHistoryChart','line',rows.map(r=>date(r.date)),[{label:names[state.historyMetric],data:rows.map(r=>r[state.historyMetric]),borderColor:colors().net,backgroundColor:colors().net,pointRadius:rows.length>50?0:3,tension:0,spanGaps:false,segment:{borderColor:ctx=>rows[ctx.p0DataIndex].version!==rows[ctx.p1DataIndex].version?'transparent':undefined}}],{scales:{...statsChartDefaults().scales,y:{...statsChartDefaults().scales.y,beginAtZero:false,grace:'10%'}},plugins:{...statsChartDefaults().plugins,legend:{display:false}}});state.historyChart=state.charts.at(-1);}

  }
  async function render() {
    const seq=++state.sequence;
    const root=document.getElementById('analyticsRoot'); if(!root)return;
    if(state.year==null)state.year=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Europe/Rome'}).format(new Date()));
    const params=new URLSearchParams({analytics:'1',year:state.year,period:state.period,property:state.property,platform:state.platform,group:state.group});
    const key=params.toString();
    try {
      if(!state.data||state.key!==key||Date.now()-state.fetched>30000){
        root.setAttribute('aria-busy','true');
        if(!state.data)root.innerHTML=`<div class="a-empty">${t('Загружаем годовую статистику…','Caricamento statistiche annuali…')}</div>`;
        const response=await fetch(`${API}/dashboard?${params}`,{credentials:'same-origin'});
        if(!response.ok)throw new Error('load');
        const data=await response.json();if(data.version!==1||!data.overview)throw new Error('format');
        if(seq!==state.sequence)return;
        state.data=data;state.key=key;state.fetched=Date.now();
      }
      paint();
    } catch(e){if(seq===state.sequence){dispose();root.innerHTML=`<div class="a-coverage" role="alert">${t('Не удалось загрузить статистику. Проверьте соединение и повторите.','Impossibile caricare le statistiche. Controlla la connessione e riprova.')}<button class="a-btn" data-refresh>${t('Повторить','Riprova')}</button></div>`;root.onclick=()=>{state.fetched=0;renderStats();};}}
    finally{if(seq===state.sequence)root.removeAttribute('aria-busy');}
  }
  window.BookingAnalytics={render,refresh(){state.fetched=0;},dispose};
})();
