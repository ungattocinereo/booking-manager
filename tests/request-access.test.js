const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isVercelHost,
  shouldAllowProtectedRoute,
} = require('../lib/request-access');

test('recognizes only Vercel deployment hosts', () => {
  assert.equal(isVercelHost('booking-manager.vercel.app'), true);
  assert.equal(isVercelHost('vercel.app'), true);
  assert.equal(isVercelHost('booking-manager.example.com'), false);
  assert.equal(isVercelHost('notvercel.app'), false);
});

test('allows protected routes on Preview deployments', () => {
  assert.equal(shouldAllowProtectedRoute({
    hostname: 'booking-manager-feature.vercel.app',
    vercelEnvironment: 'preview',
    requireCloudflareIdentity: true,
    hasCloudflareIdentity: false,
  }), true);
});

test('keeps Vercel-hosted production deployments private', () => {
  for (const vercelEnvironment of ['production', 'development', undefined]) {
    assert.equal(shouldAllowProtectedRoute({
      hostname: 'booking-manager-production.vercel.app',
      vercelEnvironment,
      requireCloudflareIdentity: false,
      hasCloudflareIdentity: true,
    }), false);
  }
});

test('preserves Cloudflare Access enforcement on custom domains', () => {
  assert.equal(shouldAllowProtectedRoute({
    hostname: 'b.amalfi.day',
    vercelEnvironment: 'production',
    requireCloudflareIdentity: true,
    hasCloudflareIdentity: false,
  }), false);

  assert.equal(shouldAllowProtectedRoute({
    hostname: 'b.amalfi.day',
    vercelEnvironment: 'production',
    requireCloudflareIdentity: true,
    hasCloudflareIdentity: true,
  }), true);

  assert.equal(shouldAllowProtectedRoute({
    hostname: 'localhost',
    vercelEnvironment: 'development',
    requireCloudflareIdentity: false,
    hasCloudflareIdentity: false,
  }), true);
});
