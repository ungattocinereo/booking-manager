function isVercelHost(hostname) {
  return hostname === 'vercel.app' || hostname.endsWith('.vercel.app');
}

function shouldAllowProtectedRoute({
  hostname,
  vercelEnvironment,
  requireCloudflareIdentity,
  hasCloudflareIdentity,
}) {
  if (isVercelHost(hostname)) {
    return vercelEnvironment === 'preview';
  }

  return !requireCloudflareIdentity || hasCloudflareIdentity;
}

module.exports = {
  isVercelHost,
  shouldAllowProtectedRoute,
};
