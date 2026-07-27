const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { AlloggiatiClient } = require('../backend/src/reporting/alloggiati-client');

function soap(body) {
  return `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>${body}</soap:Body></soap:Envelope>`;
}

test('Alloggiati SOAP client generates a token and parses row-level Test outcomes', async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      requests.push(body);
      response.writeHead(200, { 'content-type': 'application/soap+xml' });
      if (body.includes('<GenerateToken ')) {
        response.end(soap(`<GenerateTokenResponse xmlns="AlloggiatiService"><GenerateTokenResult><issued>2026-07-27</issued><expires>2026-07-27</expires><token>SAFE_TOKEN</token></GenerateTokenResult><result><esito>true</esito><ErroreCod/><ErroreDes/><ErroreDettaglio/></result></GenerateTokenResponse>`));
      } else {
        response.end(soap(`<TestResponse xmlns="AlloggiatiService"><TestResult><esito>true</esito><ErroreCod/><ErroreDes/><ErroreDettaglio/></TestResult><result><SchedineValide>2</SchedineValide><Dettaglio><EsitoOperazioneServizio><esito>true</esito><ErroreCod/><ErroreDes/><ErroreDettaglio/></EsitoOperazioneServizio><EsitoOperazioneServizio><esito>false</esito><ErroreCod>12</ErroreCod><ErroreDes>SCHEDINA_CAMPO_NON_CORRETTO</ErroreDes><ErroreDettaglio>Data errata</ErroreDettaglio></EsitoOperazioneServizio></Dettaglio></result></TestResponse>`));
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const client = new AlloggiatiClient(
      { user: 'USER', password: 'PASSWORD', wsKey: 'WSKEY' },
      { endpoint: `http://127.0.0.1:${server.address().port}`, timeoutMs: 2000 }
    );
    const result = await client.test(['ROW1', 'ROW2']);
    assert.equal(result.ok, true);
    assert.equal(result.validRecords, 2);
    assert.equal(result.details[0].ok, true);
    assert.equal(result.details[1].ok, false);
    assert.equal(result.details[1].code, '12');
    assert.ok(requests[0].includes('<Password>PASSWORD</Password>'));
    assert.ok(requests[1].includes('<token>SAFE_TOKEN</token>'));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('Alloggiati SOAP client uses GestioneAppartamenti methods with the mapped apartment ID', async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      requests.push(body);
      response.writeHead(200, { 'content-type': 'application/soap+xml' });
      if (body.includes('<GenerateToken ')) {
        response.end(soap(`<GenerateTokenResponse xmlns="AlloggiatiService"><GenerateTokenResult><token>SAFE_TOKEN</token></GenerateTokenResult><result><esito>true</esito></result></GenerateTokenResponse>`));
      } else {
        response.end(soap(`<GestioneAppartamenti_TestResponse xmlns="AlloggiatiService"><GestioneAppartamenti_TestResult><esito>true</esito></GestioneAppartamenti_TestResult><result><SchedineValide>1</SchedineValide><Dettaglio><EsitoOperazioneServizio><esito>true</esito></EsitoOperazioneServizio></Dettaglio></result></GestioneAppartamenti_TestResponse>`));
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const client = new AlloggiatiClient(
      { user: 'USER', password: 'PASSWORD', wsKey: 'WSKEY', mode: 'apartments', apartmentId: 1 },
      { endpoint: `http://127.0.0.1:${server.address().port}`, timeoutMs: 2000 }
    );
    const result = await client.test(['ROW1']);
    assert.equal(result.ok, true);
    assert.equal(result.validRecords, 1);
    assert.ok(requests[1].includes('<GestioneAppartamenti_Test '));
    assert.ok(requests[1].includes('<IdAppartamento>1</IdAppartamento>'));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
