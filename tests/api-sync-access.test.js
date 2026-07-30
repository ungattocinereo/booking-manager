const test = require('node:test');
const assert = require('node:assert/strict');

const syncServicePath = require.resolve('../backend/src/sync-service');
const syncApiPath = require.resolve('../api/sync');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('preview deployments cannot start a calendar sync', async () => {
  const previousEnvironment = process.env.VERCEL_ENV;
  const previousSyncService = require.cache[syncServicePath];
  let syncCalls = 0;

  class SyncInProgressError extends Error {}
  require.cache[syncServicePath] = {
    id: syncServicePath,
    filename: syncServicePath,
    loaded: true,
    exports: {
      SyncInProgressError,
      runSync: async () => {
        syncCalls += 1;
        return { success: true };
      }
    }
  };
  delete require.cache[syncApiPath];

  try {
    const handler = require(syncApiPath);
    process.env.VERCEL_ENV = 'preview';

    const previewResponse = responseRecorder();
    await handler({ method: 'POST', headers: {} }, previewResponse);
    assert.equal(previewResponse.statusCode, 403);
    assert.equal(previewResponse.body.code, 'SYNC_DISABLED_IN_PREVIEW');
    assert.equal(syncCalls, 0);

    process.env.VERCEL_ENV = 'production';
    const productionResponse = responseRecorder();
    await handler({ method: 'POST', headers: {} }, productionResponse);
    assert.equal(productionResponse.statusCode, 200);
    assert.equal(syncCalls, 1);
  } finally {
    delete require.cache[syncApiPath];
    if (previousSyncService) require.cache[syncServicePath] = previousSyncService;
    else delete require.cache[syncServicePath];
    if (previousEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnvironment;
  }
});
