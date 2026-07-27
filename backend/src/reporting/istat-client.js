const fetch = require('node-fetch');

const DEFAULT_BASE_URL = 'https://turismo.regione.campania.it/turismoweb/api-gestionali';

class IstatClient {
  constructor(credentials, options = {}) {
    this.credentials = credentials;
    this.baseUrl = String(options.baseUrl || process.env.ISTAT_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = Number(options.timeoutMs || process.env.ISTAT_TIMEOUT_MS || 15000);
    this.accessToken = null;
  }

  async request(path, options = {}, authenticated = true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      if (authenticated && !this.accessToken) await this.login();
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          accept: 'application/json',
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(authenticated ? { authorization: `Bearer ${this.accessToken}` } : {}),
          ...(options.headers || {})
        },
        signal: controller.signal
      });
      const text = await response.text();
      let body = null;
      if (text) {
        try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
      }
      if (!response.ok) {
        const error = new Error(`Sinfonia HTTP ${response.status}: ${body?.errore || body?.raw || response.statusText}`);
        error.status = response.status;
        error.response = body;
        throw error;
      }
      return body;
    } catch (error) {
      if (error.name === 'AbortError') {
        const timeoutError = new Error('Sinfonia request timed out');
        timeoutError.code = 'ISTAT_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async login() {
    const body = await this.request('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ cusr: this.credentials.cusr, apiKey: this.credentials.apiKey })
    }, false);
    if (!body?.accessToken) throw new Error('Sinfonia returned an empty access token');
    this.accessToken = body.accessToken;
    return body;
  }

  codes() { return this.request('/v1/codici-istat', {}, false); }
  profile() { return this.request('/v1/anagrafica'); }
  latest() { return this.request('/v1/movimentazione/ultima-rilevazione'); }
  movements(dataInizio, offset = 1) {
    return this.request(`/v1/movimentazione?dataInizio=${encodeURIComponent(dataInizio)}&offset=${encodeURIComponent(offset)}`);
  }
  create(payload) { return this.request('/v1/movimentazione', { method: 'POST', body: JSON.stringify(payload) }); }
  replace(payload) { return this.request('/v1/movimentazione', { method: 'PUT', body: JSON.stringify(payload) }); }
}

module.exports = { IstatClient, DEFAULT_BASE_URL };
