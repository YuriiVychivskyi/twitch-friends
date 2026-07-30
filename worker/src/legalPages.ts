const legalAssets = new Map([
  ['/legal.css', '/legal.css'],
  ['/privacy', '/privacy.html'],
  ['/privacy.html', '/privacy.html'],
  ['/terms', '/terms.html'],
  ['/terms.html', '/terms.html'],
]);

function applySecurityHeaders(response: Response) {
  const headers = new Headers(response.headers);
  const contentType = headers.get('Content-Type');

  if (contentType === 'text/html' || contentType === 'text/css') {
    headers.set('Content-Type', `${contentType}; charset=utf-8`);
  }

  headers.set('Cache-Control', 'public, max-age=300, must-revalidate');
  headers.set(
    'Content-Security-Policy',
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; style-src 'self'",
  );
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export async function handleLegalRequest(request: Request, assets: Fetcher) {
  const url = new URL(request.url);
  const assetPath = legalAssets.get(url.pathname);

  if (!assetPath) {
    return null;
  }

  if (!['GET', 'HEAD'].includes(request.method)) {
    return applySecurityHeaders(
      new Response('Method Not Allowed', {
        headers: {
          Allow: 'GET, HEAD',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        status: 405,
      }),
    );
  }

  url.pathname = assetPath;
  url.search = '';

  return applySecurityHeaders(
    await assets.fetch(
      new Request(url, {
        method: request.method,
      }),
    ),
  );
}
