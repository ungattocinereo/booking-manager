const fetch = require('node-fetch');
const { XMLParser } = require('fast-xml-parser');

const DEFAULT_ENDPOINT = 'https://alloggiatiweb.poliziadistato.it/service/service.asmx';

function xmlEscape(value) {
  return String(value ?? '').replace(/[<>&"']/g, char => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
  }[char]));
}

function findKey(value, wanted) {
  if (!value || typeof value !== 'object') return undefined;
  for (const [key, child] of Object.entries(value)) {
    if (key.split(':').pop() === wanted) return child;
    const nested = findKey(child, wanted);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function operationResult(parsed, action) {
  const result = findKey(parsed, `${action}Result`);
  const esito = String(findKey(result, 'esito')).toLowerCase() === 'true';
  return {
    ok: esito,
    code: String(findKey(result, 'ErroreCod') || ''),
    description: String(findKey(result, 'ErroreDes') || ''),
    detail: String(findKey(result, 'ErroreDettaglio') || '')
  };
}

class AlloggiatiClient {
  constructor(credentials, options = {}) {
    this.credentials = credentials;
    this.endpoint = options.endpoint || process.env.ALLOGGIATI_WS_ENDPOINT || DEFAULT_ENDPOINT;
    this.timeoutMs = Number(options.timeoutMs || process.env.ALLOGGIATI_TIMEOUT_MS || 15000);
  }

  async call(action, innerXml) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body><${action} xmlns="AlloggiatiService">${innerXml}</${action}></soap12:Body>
</soap12:Envelope>`;
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': `application/soap+xml; charset=utf-8; action="AlloggiatiService/${action}"` },
        body: envelope,
        signal: controller.signal
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`Alloggiati HTTP ${response.status}`);
      const parsed = new XMLParser({ ignoreAttributes: false, trimValues: false }).parse(body);
      const fault = findKey(parsed, 'Fault');
      if (fault) throw new Error(`Alloggiati SOAP Fault: ${String(findKey(fault, 'Text') || findKey(fault, 'faultstring') || 'unknown')}`);
      return parsed;
    } catch (error) {
      if (error.name === 'AbortError') {
        const timeoutError = new Error('Alloggiati request timed out');
        timeoutError.code = 'ALLOGGIATI_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async token() {
    const parsed = await this.call('GenerateToken',
      `<Utente>${xmlEscape(this.credentials.user)}</Utente>` +
      `<Password>${xmlEscape(this.credentials.password)}</Password>` +
      `<WsKey>${xmlEscape(this.credentials.wsKey)}</WsKey>`
    );
    const statusNode = findKey(parsed, 'result') || {};
    const status = {
      ok: String(findKey(statusNode, 'esito')).toLowerCase() === 'true',
      code: String(findKey(statusNode, 'ErroreCod') || ''),
      description: String(findKey(statusNode, 'ErroreDes') || ''),
      detail: String(findKey(statusNode, 'ErroreDettaglio') || '')
    };
    if (!status.ok) throw new Error(`Alloggiati authentication failed: ${status.description || status.code}`);
    const tokenResult = findKey(parsed, 'GenerateTokenResult');
    const token = String(findKey(tokenResult, 'token') || '');
    if (!token) throw new Error('Alloggiati returned an empty token');
    return token;
  }

  async submit(action, lines) {
    const token = await this.token();
    const list = lines.map(line => `<string>${xmlEscape(line)}</string>`).join('');
    const apartmentMode = this.credentials.mode === 'apartments';
    const soapAction = apartmentMode ? `GestioneAppartamenti_${action}` : action;
    const apartmentXml = apartmentMode
      ? `<IdAppartamento>${xmlEscape(this.credentials.apartmentId)}</IdAppartamento>`
      : '';
    const parsed = await this.call(soapAction,
      `<Utente>${xmlEscape(this.credentials.user)}</Utente>` +
      `<token>${xmlEscape(token)}</token><ElencoSchedine>${list}</ElencoSchedine>` +
      apartmentXml
    );
    const status = operationResult(parsed, soapAction);
    const result = findKey(parsed, 'result') || {};
    const rawDetails = asArray(findKey(findKey(result, 'Dettaglio'), 'EsitoOperazioneServizio'));
    const details = lines.map((_, index) => {
      const item = rawDetails[index] || {};
      return {
        lineNumber: index + 1,
        ok: String(findKey(item, 'esito')).toLowerCase() === 'true',
        code: String(findKey(item, 'ErroreCod') || ''),
        description: String(findKey(item, 'ErroreDes') || ''),
        detail: String(findKey(item, 'ErroreDettaglio') || '')
      };
    });
    return {
      ...status,
      validRecords: Number(findKey(result, 'SchedineValide')) || details.filter(item => item.ok).length,
      totalRecords: lines.length,
      details
    };
  }

  test(lines) {
    return this.submit('Test', lines);
  }

  send(lines) {
    return this.submit('Send', lines);
  }

  async table(type) {
    const token = await this.token();
    const parsed = await this.call('Tabella',
      `<Utente>${xmlEscape(this.credentials.user)}</Utente><token>${xmlEscape(token)}</token><tipo>${xmlEscape(type)}</tipo>`
    );
    const status = operationResult(parsed, 'Tabella');
    if (!status.ok) throw new Error(`Alloggiati table failed: ${status.description || status.code}`);
    return String(findKey(parsed, 'CSV') || '');
  }

  async receipt(date) {
    const token = await this.token();
    const parsed = await this.call('Ricevuta',
      `<Utente>${xmlEscape(this.credentials.user)}</Utente><token>${xmlEscape(token)}</token><Data>${xmlEscape(date)}T00:00:00</Data>`
    );
    const status = operationResult(parsed, 'Ricevuta');
    if (!status.ok) return { ...status, pdf: null };
    const pdf = String(findKey(parsed, 'PDF') || '');
    return { ...status, pdf: pdf ? Buffer.from(pdf, 'base64') : null };
  }
}

module.exports = { AlloggiatiClient, xmlEscape, findKey, operationResult };
