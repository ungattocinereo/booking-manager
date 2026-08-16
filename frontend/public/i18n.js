(() => {
  const STORAGE_KEY = 'atrani-language';
  const SUPPORTED_LANGUAGES = new Set(['ru', 'it']);
  const root = document.documentElement;

  function normalizeLanguage(value) {
    const language = String(value || '').trim().toLowerCase().split(/[-_]/)[0];
    return SUPPORTED_LANGUAGES.has(language) ? language : null;
  }

  function readSavedLanguage() {
    try {
      return normalizeLanguage(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function detectLanguage() {
    const saved = readSavedLanguage();
    if (saved) return saved;

    const browserLanguages = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
    for (const candidate of browserLanguages) {
      const language = normalizeLanguage(candidate);
      if (language) return language;
    }
    return 'ru';
  }

  function applyLanguage(language) {
    const safeLanguage = normalizeLanguage(language) || 'ru';
    root.lang = safeLanguage;
    root.dataset.language = safeLanguage;
    return safeLanguage;
  }

  function syncControls() {
    const language = root.dataset.language || detectLanguage();
    document.querySelectorAll('[data-language-option]').forEach(button => {
      const active = button.dataset.languageOption === language;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setLanguage(language) {
    const safeLanguage = normalizeLanguage(language) || 'ru';
    const previousLanguage = root.dataset.language;
    try {
      localStorage.setItem(STORAGE_KEY, safeLanguage);
    } catch {
      // The chosen language still applies to this page when storage is unavailable.
    }
    applyLanguage(safeLanguage);
    syncControls();
    if (previousLanguage !== safeLanguage) window.location.reload();
  }

  function switcherMarkup() {
    const italian = (root.dataset.language || detectLanguage()) === 'it';
    const groupLabel = italian ? 'Lingua dell’interfaccia' : 'Язык интерфейса';
    const russianLabel = italian ? 'Russo' : 'Русский';
    const italianLabel = italian ? 'Italiano' : 'Итальянский';
    return `<div class="language-switcher" role="group" aria-label="${groupLabel}">
      <button class="language-option" type="button" data-language-option="ru" aria-label="${russianLabel}" title="${russianLabel}" aria-pressed="false">RU</button>
      <button class="language-option" type="button" data-language-option="it" aria-label="${italianLabel}" title="${italianLabel}" aria-pressed="false">IT</button>
    </div>`;
  }

  window.AtraniI18n = {
    storageKey: STORAGE_KEY,
    getLanguage: () => root.dataset.language || detectLanguage(),
    getLocale: () => (root.dataset.language || detectLanguage()) === 'it' ? 'it-IT' : 'ru-RU',
    setLanguage,
    syncControls,
    switcherMarkup
  };

  applyLanguage(detectLanguage());

  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-language-option]');
    if (button) setLanguage(button.dataset.languageOption);
  });
  document.addEventListener('DOMContentLoaded', syncControls, { once: true });

  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    const nextLanguage = detectLanguage();
    if (nextLanguage !== root.dataset.language) window.location.reload();
  });
})();
