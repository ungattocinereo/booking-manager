// These routes authenticate inside their handler before accessing the database.
function isPublicWidgetApiRequest({ pathname, method, widget, widgetCount = 1 }) {
  if (pathname !== '/api/bookings' || widgetCount !== 1) return false;
  return widget === 'today' || (method === 'GET' && widget === 'upcoming') ||
    (method === 'PATCH' && widget === 'tax') ||
    (['GET', 'POST', 'PUT'].includes(method) && widget === 'cleaners');
}

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
  isPublicWidgetApiRequest,
  isVercelHost,
  shouldAllowProtectedRoute,
};
