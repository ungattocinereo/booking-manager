const test = require('node:test');
const assert = require('node:assert/strict');
const { getRomeDate, shiftDateOnly } = require('../telegram-bot/today');

function fakeResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    }
  };
}

test('Telegram webhook routes today and both details aliases correctly', async () => {
  const today = getRomeDate();
  const fetchPath = require.resolve('node-fetch');
  const dbPath = require.resolve('../backend/src/database');
  const handlerPath = require.resolve('../api/telegram');
  const savedFetch = require.cache[fetchPath];
  const savedDb = require.cache[dbPath];
  const savedHandler = require.cache[handlerPath];
  const savedEnv = {
    POSTGRES_URL: process.env.POSTGRES_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    FAMILY_CHAT_ID: process.env.FAMILY_CHAT_ID,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET
  };
  const calls = [];
  const bookings = [
    {
      active: null,
      property_id: 'youth',
      platform: 'booking',
      start_date: today,
      end_date: shiftDateOnly(today, 2),
      booking_type: 'reservation',
      guest_name: 'Arrival'
    },
    {
      active: true,
      property_id: 'orange',
      platform: 'booking',
      start_date: today,
      end_date: shiftDateOnly(today, 6),
      booking_type: 'blocked',
      raw_summary: 'CLOSED - Not available',
      guest_name: null,
      guest_count: 0
    },
    {
      active: true,
      property_id: 'solo',
      platform: 'airbnb',
      start_date: shiftDateOnly(today, -2),
      end_date: today,
      booking_type: 'reservation',
      guest_name: 'Checkout'
    },
    {
      active: true,
      property_id: 'orange',
      platform: 'booking',
      start_date: shiftDateOnly(today, -3),
      end_date: shiftDateOnly(today, 1),
      booking_type: 'reservation',
      guest_name: 'Staying'
    }
  ];

  try {
    delete process.env.POSTGRES_URL;
    delete process.env.DATABASE_URL;
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.FAMILY_CHAT_ID = '123';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';

    require.cache[fetchPath] = {
      id: fetchPath,
      filename: fetchPath,
      loaded: true,
      exports: async (url, options) => {
        calls.push({ url, options });
        return { ok: true };
      }
    };
    require.cache[dbPath] = {
      id: dbPath,
      filename: dbPath,
      loaded: true,
      exports: {
        db: {},
        getBookings: async (_propertyId, fromDate) => {
          assert.equal(fromDate, today);
          return bookings;
        }
      }
    };
    delete require.cache[handlerPath];
    const handler = require('../api/telegram');

    for (const command of ['/today', '/today-details', '/today_details']) {
      const req = {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: { message: { text: command, chat: { id: 123 } } }
      };
      const res = fakeResponse();
      await handler(req, res);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { ok: true });
    }

    const messages = calls
      .filter(call => call.url.endsWith('/sendMessage'))
      .map(call => JSON.parse(call.options.body).text);

    assert.equal(messages.length, 3);
    assert.match(messages[0], /Заезды сегодня/);
    assert.match(messages[0], /Youth Room/);
    assert.doesNotMatch(messages[0], /Orange Room/);
    assert.doesNotMatch(messages[0], /Выезды/);
    for (const details of messages.slice(1)) {
      assert.match(details, /<b>Заезды<\/b>/);
      assert.match(details, /<b>Выезды<\/b>/);
      assert.match(details, /<b>Остаются<\/b>/);
      assert.equal((details.match(/Orange Room/g) || []).length, 1);
    }
  } finally {
    if (savedFetch) require.cache[fetchPath] = savedFetch;
    else delete require.cache[fetchPath];
    if (savedDb) require.cache[dbPath] = savedDb;
    else delete require.cache[dbPath];
    if (savedHandler) require.cache[handlerPath] = savedHandler;
    else delete require.cache[handlerPath];
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
