declare const process: {
  env: Record<string, string | undefined>;
};

const PUBLIC_ASSET_PATHS = new Set([
  '/favicon.ico',
  '/favicon-16.png',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/airbnb.png',
  '/booking.png',
  '/manifest.json',
]);

function isVercelHost(hostname: string) {
  return hostname === 'vercel.app' || hostname.endsWith('.vercel.app');
}

function isPublicMaidPath(pathname: string) {
  return pathname.startsWith('/maid/');
}

function isPublicMaidApiPath(pathname: string) {
  return pathname.startsWith('/api/maid/');
}

function isPublicHealthPath(pathname: string) {
  return pathname === '/health' || pathname === '/api/health';
}

function isPublicWidgetApiRequest(pathname: string, request: Request) {
  if (pathname !== '/api/bookings') return false;
  const url = new URL(request.url);
  return url.searchParams.get('widget') === 'today';
}

function hasBearerSecret(request: Request, secret: string) {
  const authorization = request.headers.get('authorization') || '';
  return Boolean(secret && authorization === `Bearer ${secret}`);
}

function hasTelegramSecret(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  const header = request.headers.get('x-telegram-bot-api-secret-token') || '';
  return Boolean(secret && header === secret);
}

function hasCloudflareAccessIdentity(request: Request) {
  return Boolean(
    request.headers.get('cf-access-authenticated-user-email') ||
    request.headers.get('cf-access-jwt-assertion')
  );
}

function isAllowedMachinePath(pathname: string, request: Request) {
  if (pathname === '/api/sync') {
    return hasBearerSecret(request, process.env.CRON_SECRET || '');
  }

  if (pathname === '/api/reporting/maintenance') {
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

export default function middleware(request: Request) {
  const url = new URL(request.url);

  if (PUBLIC_ASSET_PATHS.has(url.pathname)) return;
  if (isPublicMaidPath(url.pathname)) return;
  if (isPublicMaidApiPath(url.pathname)) return;
  if (isPublicHealthPath(url.pathname)) return;
  if (isPublicWidgetApiRequest(url.pathname, request)) return;
  if (isAllowedMachinePath(url.pathname, request)) return;

  if (!isVercelHost(url.hostname)) {
    const requireIdentity = process.env.REQUIRE_CF_ACCESS_IDENTITY === '1' || process.env.REQUIRE_CF_ACCESS_IDENTITY === 'true';
    if (!requireIdentity || hasCloudflareAccessIdentity(request)) return;
  }

  return blockedResponse();
}

export const config = {
  matcher: '/:path*',
};
