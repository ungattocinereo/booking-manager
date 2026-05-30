const PUBLIC_ASSET_PATHS = new Set([
  '/favicon.ico',
  '/favicon-16.png',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
]);

function isVercelHost(hostname) {
  return hostname === 'vercel.app' || hostname.endsWith('.vercel.app');
}

function isPublicMaidPath(pathname) {
  return pathname.startsWith('/maid/');
}

function isPublicMaidApiPath(pathname) {
  return pathname.startsWith('/api/maid/');
}

function hasBearerSecret(request, secret) {
  const authorization = request.headers.get('authorization') || '';
  return Boolean(secret && authorization === `Bearer ${secret}`);
}

function hasTelegramSecret(request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  const header = request.headers.get('x-telegram-bot-api-secret-token') || '';
  return Boolean(secret && header === secret);
}

function isAllowedMachinePath(pathname, request) {
  if (pathname === '/api/sync') {
    return hasBearerSecret(request, process.env.CRON_SECRET || '');
  }

  if (pathname === '/api/telegram') {
    return hasTelegramSecret(request);
  }

  return false;
}

function blockedResponse() {
  return new Response('Not found', {
    status: 404,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}

export default function middleware(request) {
  const url = new URL(request.url);

  if (!isVercelHost(url.hostname)) return;
  if (PUBLIC_ASSET_PATHS.has(url.pathname)) return;
  if (isPublicMaidPath(url.pathname)) return;
  if (isPublicMaidApiPath(url.pathname)) return;
  if (isAllowedMachinePath(url.pathname, request)) return;

  return blockedResponse();
}

export const config = {
  matcher: '/:path*',
};
