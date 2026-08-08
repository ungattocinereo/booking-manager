const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.join(__dirname, '..');
const pagePaths = {
  admin: path.join(projectRoot, 'frontend/public/index.html'),
  maid: path.join(projectRoot, 'frontend/public/maid.html')
};
const pageHtml = Object.fromEntries(
  Object.entries(pagePaths).map(([name, file]) => [name, fs.readFileSync(file, 'utf8')])
);
const vercelConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'vercel.json'), 'utf8'));
const themeStorageKey = 'atrani-theme-preference';
const themeOptions = ['system', 'light', 'dark'];

function getInlineScripts(html) {
  const scripts = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const [, attributes, source] = match;
    if (/\bsrc\s*=/i.test(attributes)) continue;
    if (/\btype\s*=\s*["']application\/(?:ld\+)?json["']/i.test(attributes)) continue;
    if (source.trim()) scripts.push(source);
  }
  return scripts;
}

function getThemeBootstrap(html, pageName) {
  const source = getInlineScripts(html).find(script =>
    script.includes(themeStorageKey) && script.includes('window.AtraniTheme')
  );
  assert.ok(source, `${pageName} must expose the shared theme bootstrap before page rendering`);
  return source;
}

function createControl(option) {
  const classes = new Set();
  const attributes = new Map();
  return {
    dataset: { themeOption: option },
    classList: {
      toggle(name, active) {
        if (active) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      }
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    closest(selector) {
      return selector === '[data-theme-option]' ? this : null;
    }
  };
}

function createThemeRuntime(pageName, options = {}) {
  const html = pageHtml[pageName];
  const storage = options.storage || new Map();
  const controls = themeOptions.map(createControl);
  const root = { dataset: {}, style: {} };
  const themeColor = { content: '' };
  const statusBar = { content: 'default' };
  const documentListeners = new Map();
  const windowListeners = new Map();
  const mediaListeners = [];
  const dispatchedEvents = [];
  const media = {
    matches: Boolean(options.systemDark),
    addEventListener(type, listener) {
      if (type === 'change') mediaListeners.push(listener);
    },
    addListener(listener) {
      mediaListeners.push(listener);
    }
  };
  const document = {
    documentElement: root,
    querySelector(selector) {
      if (selector === 'meta[name="theme-color"]') return themeColor;
      if (selector === 'meta[name="apple-mobile-web-app-status-bar-style"]') return statusBar;
      return null;
    },
    querySelectorAll(selector) {
      return selector === '[data-theme-option]' ? controls : [];
    },
    addEventListener(type, listener) {
      documentListeners.set(type, listener);
    }
  };
  const localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    }
  };
  class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  const window = {
    matchMedia(query) {
      assert.equal(query, '(prefers-color-scheme: dark)');
      return media;
    },
    addEventListener(type, listener) {
      windowListeners.set(type, listener);
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
      return true;
    }
  };

  const context = { window, document, localStorage, CustomEvent };
  new vm.Script(getThemeBootstrap(html, pageName), {
    filename: `${path.basename(pagePaths[pageName])}:theme-bootstrap`
  }).runInNewContext(context);

  return {
    api: window.AtraniTheme,
    controls,
    dispatchedEvents,
    root,
    storage,
    statusBar,
    themeColor,
    fireDOMContentLoaded() {
      documentListeners.get('DOMContentLoaded')?.();
    },
    clickOption(option) {
      const control = controls.find(candidate => candidate.dataset.themeOption === option);
      assert.ok(control, `missing ${option} theme control`);
      documentListeners.get('click')?.({ target: control });
    },
    setSystemDark(value) {
      media.matches = Boolean(value);
      for (const listener of mediaListeners) listener({ matches: media.matches });
    },
    emitStorage(key = themeStorageKey) {
      windowListeners.get('storage')?.({ key });
    }
  };
}

test('all inline JavaScript in themed pages is syntactically valid', () => {
  for (const [pageName, html] of Object.entries(pageHtml)) {
    const scripts = getInlineScripts(html);
    assert.ok(scripts.length > 0, `${pageName} should contain inline JavaScript`);
    scripts.forEach((source, index) => {
      assert.doesNotThrow(
        () => new vm.Script(source, { filename: `${path.basename(pagePaths[pageName])}:inline-${index + 1}` }),
        `${pageName} inline script ${index + 1} should compile`
      );
    });
  }
});

test('admin and maid pages expose one shared three-mode theme contract', () => {
  for (const [pageName, html] of Object.entries(pageHtml)) {
    getThemeBootstrap(html, pageName);
    assert.match(html, /html\[data-color-scheme="dark"\]/);
    assert.match(html, /window\.AtraniTheme\s*=/);
    assert.match(html, /atrani-theme-change/);
    const options = [...html.matchAll(/data-theme-option="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual([...new Set(options)].sort(), [...themeOptions].sort());
  }
});

test('system is the default preference and resolves from the OS on first load', () => {
  for (const pageName of Object.keys(pageHtml)) {
    const light = createThemeRuntime(pageName, { systemDark: false });
    assert.equal(light.api.storageKey, themeStorageKey);
    assert.equal(light.api.getPreference(), 'system');
    assert.equal(light.api.getResolved(), 'light');
    assert.equal(light.root.dataset.themePreference, 'system');
    assert.equal(light.root.dataset.colorScheme, 'light');
    assert.equal(light.root.style.colorScheme, 'light');
    assert.equal(light.storage.has(themeStorageKey), false);

    const dark = createThemeRuntime(pageName, { systemDark: true });
    assert.equal(dark.api.getPreference(), 'system');
    assert.equal(dark.api.getResolved(), 'dark');
    assert.equal(dark.root.dataset.colorScheme, 'dark');
    assert.equal(dark.root.style.colorScheme, 'dark');

    const invalidStorage = new Map([[themeStorageKey, 'sepia']]);
    const invalid = createThemeRuntime(pageName, { storage: invalidStorage, systemDark: false });
    assert.equal(invalid.api.getPreference(), 'system');
    assert.equal(invalid.api.getResolved(), 'light');
  }
});

test('explicit preference persists and is shared between admin and maid pages', () => {
  const storage = new Map();
  const admin = createThemeRuntime('admin', { storage, systemDark: false });
  admin.api.setPreference('dark');
  assert.equal(storage.get(themeStorageKey), 'dark');
  assert.equal(admin.api.getResolved(), 'dark');

  const maid = createThemeRuntime('maid', { storage, systemDark: false });
  assert.equal(maid.api.getPreference(), 'dark');
  assert.equal(maid.api.getResolved(), 'dark');

  maid.api.setPreference('light');
  const reloadedAdmin = createThemeRuntime('admin', { storage, systemDark: true });
  assert.equal(storage.get(themeStorageKey), 'light');
  assert.equal(reloadedAdmin.api.getPreference(), 'light');
  assert.equal(reloadedAdmin.api.getResolved(), 'light');
});

test('system preference reacts to matchMedia while explicit modes stay fixed', () => {
  for (const pageName of Object.keys(pageHtml)) {
    const runtime = createThemeRuntime(pageName, { systemDark: false });
    runtime.setSystemDark(true);
    assert.equal(runtime.api.getPreference(), 'system');
    assert.equal(runtime.api.getResolved(), 'dark');
    assert.equal(runtime.dispatchedEvents.at(-1)?.type, 'atrani-theme-change');
    assert.equal(runtime.dispatchedEvents.at(-1)?.detail.resolved, 'dark');

    runtime.api.setPreference('light');
    runtime.setSystemDark(false);
    runtime.setSystemDark(true);
    assert.equal(runtime.api.getPreference(), 'light');
    assert.equal(runtime.api.getResolved(), 'light');
  }
});

test('storage events synchronize an already open page', () => {
  const storage = new Map();
  const admin = createThemeRuntime('admin', { storage, systemDark: false });
  const maid = createThemeRuntime('maid', { storage, systemDark: false });
  admin.api.setPreference('dark');
  assert.equal(maid.api.getPreference(), 'system');

  maid.emitStorage();
  assert.equal(maid.api.getPreference(), 'dark');
  assert.equal(maid.api.getResolved(), 'dark');
  assert.equal(maid.dispatchedEvents.at(-1)?.detail.preference, 'dark');
});

test('theme controls reflect the active preference accessibly', () => {
  const runtime = createThemeRuntime('admin', { systemDark: false });
  runtime.fireDOMContentLoaded();
  const system = runtime.controls.find(control => control.dataset.themeOption === 'system');
  const dark = runtime.controls.find(control => control.dataset.themeOption === 'dark');
  assert.equal(system.classList.contains('active'), true);
  assert.equal(system.getAttribute('aria-pressed'), 'true');
  assert.equal(dark.getAttribute('aria-pressed'), 'false');

  runtime.clickOption('dark');
  assert.equal(system.classList.contains('active'), false);
  assert.equal(system.getAttribute('aria-pressed'), 'false');
  assert.equal(dark.classList.contains('active'), true);
  assert.equal(dark.getAttribute('aria-pressed'), 'true');
});

test('all admin routes and the public maid route resolve to themed pages', () => {
  const rewrites = new Map(vercelConfig.rewrites.map(rewrite => [rewrite.source, rewrite.destination]));
  for (const route of ['/', '/stats', '/maid', '/tax', '/reporting']) {
    assert.equal(rewrites.get(route), '/frontend/public/index.html', `${route} should use the themed admin shell`);
  }
  assert.equal(rewrites.get('/maid/:slug'), '/frontend/public/maid.html');
  getThemeBootstrap(pageHtml.admin, 'admin');
  getThemeBootstrap(pageHtml.maid, 'maid');

  const tabs = [...pageHtml.admin.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]);
  for (const tab of ['calendar', 'cleaners', 'stats', 'tax', 'reporting']) {
    assert.ok(tabs.includes(tab), `admin theme shell should cover the ${tab} tab`);
  }
});

test('maid page renders the theme switcher in both normal and error states', () => {
  assert.match(pageHtml.maid, /function themeSwitcherMarkup\(\)/);
  const placements = pageHtml.maid.match(/\$\{themeSwitcherMarkup\(\)\}/g) || [];
  assert.ok(placements.length >= 2, 'maid success and error views should both render theme controls');
});
