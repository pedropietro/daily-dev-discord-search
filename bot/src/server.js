// Tiny HTTP server for the OAuth redirect. Must be reachable at PUBLIC_BASE_URL (use HTTPS in production).
import { createServer } from 'node:http';

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function page(title, message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;line-height:1.5}
h1{font-size:1.4rem}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body></html>`;
}

/**
 * Pure request handler for GET /oauth/callback, exported for tests.
 * @returns {Promise<{status: number, title: string, message: string}>}
 */
export async function handleCallback(searchParams, { oauth, tokens }) {
  const state = searchParams.get('state');
  const pending = oauth.consumeState(state); // single-use, even on error
  if (searchParams.get('error')) {
    return { status: 400, title: 'Not connected', message: 'Sign-in was cancelled. Run /dailydev connect in Discord to try again.' };
  }
  if (!pending) {
    return { status: 400, title: 'Link expired', message: 'This sign-in link is invalid or expired. Run /dailydev connect in Discord again.' };
  }
  const code = searchParams.get('code');
  if (!code) return { status: 400, title: 'Not connected', message: 'Missing authorization code.' };

  try {
    const grant = await oauth.exchangeCode(code, pending.verifier);
    if (!grant.scope.split(' ').includes('read')) {
      await oauth.revoke(grant.refreshToken);
      return { status: 400, title: 'Not connected', message: 'Read access was not granted, so the bot cannot search for you.' };
    }
    await tokens.saveGrant(pending.discordUserId, grant);
    return {
      status: 200,
      title: 'daily.dev connected ✅',
      message: 'You can close this tab and go back to Discord. /dailydev search now runs with your own account.',
    };
  } catch (err) {
    console.error('[oauth callback]', err.message);
    return { status: 502, title: 'Not connected', message: 'daily.dev did not accept the sign-in. Run /dailydev connect again.' };
  }
}

export function startServer({ port, oauth, tokens }) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const headers = {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    };
    if (req.method === 'GET' && url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (req.method === 'GET' && url.pathname === '/oauth/callback') {
      const r = await handleCallback(url.searchParams, { oauth, tokens });
      res.writeHead(r.status, headers).end(page(r.title, r.message));
      return;
    }
    res.writeHead(404, headers).end(page('Not found', 'Nothing here.'));
  });
  server.listen(port, () => console.log(`OAuth callback server listening on :${port}`));
  return server;
}
