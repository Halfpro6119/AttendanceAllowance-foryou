/**
 * One-time: obtain GOOGLE_REFRESH_TOKEN for Gmail API (gmail.send scope).
 *
 * Prerequisite: Google Cloud Console → OAuth client (Web application) with redirect URI:
 *   http://localhost:3456/oauth2callback
 *
 * Run (from project root):
 *   set GOOGLE_CLIENT_ID=...
 *   set GOOGLE_CLIENT_SECRET=...
 *   npm run google-oauth
 *
 * PowerShell:
 *   $env:GOOGLE_CLIENT_ID="..."; $env:GOOGLE_CLIENT_SECRET="..."; npm run google-oauth
 *
 * Enable Gmail API and add scope https://www.googleapis.com/auth/gmail.send on the consent screen.
 */
const http = require('http');
const { URL } = require('url');
const { OAuth2Client } = require('google-auth-library');

const PORT = 3456;
const REDIRECT_PATH = '/oauth2callback';
const REDIRECT_URI = `http://localhost:${PORT}${REDIRECT_PATH}`;

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.');
  process.exit(1);
}

const oauth2 = new OAuth2Client(clientId, clientSecret, REDIRECT_URI);

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', `http://localhost:${PORT}`);
  if (u.pathname !== REDIRECT_PATH) {
    res.statusCode = 404;
    res.end();
    return;
  }
  const code = u.searchParams.get('code');
  const err = u.searchParams.get('error');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (err) {
    res.statusCode = 400;
    res.end(`<p>OAuth error: ${err}</p>`);
    server.close();
    process.exit(1);
    return;
  }
  if (!code) {
    res.statusCode = 400;
    res.end('<p>No code in callback.</p>');
    server.close();
    process.exit(1);
    return;
  }
  try {
    const { tokens } = await oauth2.getToken(code);
    res.statusCode = 200;
    res.end('<p>Success. Copy the refresh token from the terminal and add GOOGLE_REFRESH_TOKEN in Vercel. You can close this tab.</p>');
    console.log('\n--- Add this to Vercel as GOOGLE_REFRESH_TOKEN ---\n');
    if (!tokens.refresh_token) {
      console.error(
        'No refresh token returned. Revoke app access (Google Account → Data & privacy → Third-party apps) and run this script again.'
      );
      server.close();
      process.exit(1);
      return;
    }
    console.log(tokens.refresh_token);
    console.log('\n');
    server.close();
    process.exit(0);
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end('<p>Token exchange failed; see terminal.</p>');
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.send'],
    prompt: 'consent'
  });
  console.log('\nOpen this URL in your browser, sign in as rilrogsa@gmail.com, then allow access:\n');
  console.log(url);
  console.log(`\nWaiting for redirect to ${REDIRECT_URI} ...\n`);
});
