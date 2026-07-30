import { describe, expect, it, vi } from 'vitest';

import { handleLegalRequest } from './legalPages';

function createAssets() {
  const fetch = vi.fn((request: Request) => {
    const pathname = new URL(request.url).pathname;

    return Promise.resolve(
      new Response(pathname, {
        headers: {
          'Content-Type': pathname.endsWith('.css')
            ? 'text/css; charset=utf-8'
            : 'text/html; charset=utf-8',
        },
      }),
    );
  });

  return {
    assets: { fetch } as unknown as Fetcher,
    fetch,
  };
}

describe('public legal pages', () => {
  it('serves the privacy page with restrictive security headers', async () => {
    const { assets, fetch } = createAssets();
    const response = await handleLegalRequest(new Request('https://example.test/privacy'), assets);

    expect(fetch).toHaveBeenCalledOnce();
    expect(new URL(fetch.mock.calls[0]?.[0].url ?? '').pathname).toBe('/privacy.html');
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response?.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(response?.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('serves terms and the shared stylesheet only on known public paths', async () => {
    const { assets } = createAssets();

    await expect(
      handleLegalRequest(new Request('https://example.test/terms'), assets).then((response) =>
        response?.text(),
      ),
    ).resolves.toBe('/terms.html');
    await expect(
      handleLegalRequest(new Request('https://example.test/legal.css'), assets).then((response) =>
        response?.text(),
      ),
    ).resolves.toBe('/legal.css');
    await expect(
      handleLegalRequest(new Request('https://example.test/icons/icon-128.png'), assets),
    ).resolves.toBeNull();
  });

  it('rejects unsupported methods without fetching an asset', async () => {
    const { assets, fetch } = createAssets();
    const response = await handleLegalRequest(
      new Request('https://example.test/privacy', { method: 'POST' }),
      assets,
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(response?.status).toBe(405);
    expect(response?.headers.get('Allow')).toBe('GET, HEAD');
  });
});
