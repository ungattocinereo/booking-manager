const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { IstatClient } = require('../backend/src/reporting/istat-client');

test('Sinfonia client accepts the production token field and authenticates requests', async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      requests.push({ url: request.url, authorization: request.headers.authorization, body });
      response.writeHead(200, { 'content-type': 'application/json' });
      if (request.url === '/v1/auth/login') {
        response.end(JSON.stringify({ token: 'SAFE_TOKEN', expiresIn: 3600, errore: null }));
      } else if (request.url === '/v1/movimentazione/ultima-rilevazione') {
        response.end(JSON.stringify({ dataUltimaRilevazione: '26072026' }));
      } else {
        response.end(JSON.stringify({ cusr: 'SAFE_CUSR' }));
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const client = new IstatClient(
      { cusr: 'SAFE_CUSR', apiKey: 'SAFE_API_KEY' },
      { baseUrl: `http://127.0.0.1:${server.address().port}`, timeoutMs: 2000 }
    );
    const profile = await client.profile();
    assert.equal(profile.cusr, 'SAFE_CUSR');
    assert.equal(client.accessToken, 'SAFE_TOKEN');
    assert.deepEqual(JSON.parse(requests[0].body), { cusr: 'SAFE_CUSR', apiKey: 'SAFE_API_KEY' });
    assert.equal(requests[1].authorization, 'Bearer SAFE_TOKEN');
    const latest = await client.latest();
    assert.equal(latest.dataUltimaRilevazione, '26072026');
    assert.equal(requests[2].url, '/v1/movimentazione/ultima-rilevazione');
    assert.equal(requests[2].authorization, 'Bearer SAFE_TOKEN');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
