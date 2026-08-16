const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'frontend/public/i18n.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(projectRoot, 'frontend/public/index.html'), 'utf8');
const maidHtml = fs.readFileSync(path.join(projectRoot, 'frontend/public/maid.html'), 'utf8');

function createRuntime({ languages = ['en-US'], savedLanguage = null } = {}) {
  const storage = new Map(savedLanguage == null ? [] : [['atrani-language', savedLanguage]]);
  const listeners = new Map();
  const controls = ['ru', 'it'].map(language => {
    const attributes = new Map();
    const classes = new Set();
    return {
      dataset: { languageOption: language },
      classList: {
        toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); }
      },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) ?? null; }
    };
  });
  const root = { lang: '', dataset: {} };
  const document = {
    documentElement: root,
    addEventListener(type, handler) { listeners.set(type, handler); },
    querySelectorAll(selector) { return selector === '[data-language-option]' ? controls : []; }
  };
  let reloads = 0;
  const window = {
    location: { reload() { reloads++; } },
    addEventListener(type, handler) { listeners.set(`window:${type}`, handler); }
  };
  const context = vm.createContext({
    window,
    document,
    navigator: { languages, language: languages[0] },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    Set,
    Array,
    String
  });
  new vm.Script(source, { filename: 'i18n.js' }).runInContext(context);
  return { api: window.AtraniI18n, root, storage, controls, get reloads() { return reloads; } };
}

test('Italian is selected from the first supported browser language', () => {
  assert.equal(createRuntime({ languages: ['it-IT', 'en-US'] }).api.getLanguage(), 'it');
  assert.equal(createRuntime({ languages: ['de-DE', 'it-IT'] }).api.getLanguage(), 'it');
  assert.equal(createRuntime({ languages: ['ru-RU', 'it-IT'] }).api.getLanguage(), 'ru');
  assert.equal(createRuntime({ languages: ['en-US', 'de-DE'] }).api.getLanguage(), 'ru');
});

test('saved manual language overrides browser detection and persists across pages', () => {
  const savedRussian = createRuntime({ languages: ['it-IT'], savedLanguage: 'ru' });
  assert.equal(savedRussian.api.getLanguage(), 'ru');
  assert.equal(savedRussian.root.lang, 'ru');

  savedRussian.api.setLanguage('it');
  assert.equal(savedRussian.storage.get('atrani-language'), 'it');
  assert.equal(savedRussian.root.lang, 'it');
  assert.equal(savedRussian.reloads, 1);
});

test('language controls expose accessible active state', () => {
  const runtime = createRuntime({ languages: ['it-IT'] });
  runtime.api.syncControls();
  const russian = runtime.controls.find(control => control.dataset.languageOption === 'ru');
  const italian = runtime.controls.find(control => control.dataset.languageOption === 'it');
  assert.equal(russian.getAttribute('aria-pressed'), 'false');
  assert.equal(italian.getAttribute('aria-pressed'), 'true');
  assert.equal(italian.classList.contains('active'), true);
});

test('admin and public maid pages share the language contract', () => {
  for (const html of [adminHtml, maidHtml]) {
    assert.match(html, /<script src="\/i18n\.js"><\/script>/);
    assert.match(html, /language-switcher/);
  }
  assert.match(adminHtml, /data-language-option/);
  assert.match(maidHtml, /languageSwitcherMarkup/);
  assert.match(adminHtml, /dashboard-i18n\.js/);
  assert.match(maidHtml, /const MAID_COPY =/);
});
