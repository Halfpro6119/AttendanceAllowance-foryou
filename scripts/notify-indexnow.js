/**
 * Submits public URLs from sitemap.xml to IndexNow after deploy (Vercel production only).
 * Requires the key file at /{key}.txt (see repo root) so search engines can verify ownership.
 *
 * https://www.indexnow.org/documentation
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const KEY_FILE = '70a36a9befda423d8c249055de5227c7.txt';
const HOST = 'www.attendanceallowance-foryou.co.uk';
const INDEXNOW_URL = 'https://api.indexnow.org/IndexNow';

function readKey() {
  const p = path.join(ROOT, KEY_FILE);
  if (!fs.existsSync(p)) {
    throw new Error(`IndexNow: missing ${KEY_FILE}`);
  }
  return fs.readFileSync(p, 'utf8').trim();
}

function urlsFromSitemap() {
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (!urls.length) throw new Error('IndexNow: no URLs in sitemap.xml');
  return urls;
}

async function main() {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    console.log('IndexNow: skipped (not production deploy)');
    return;
  }
  if (!process.env.VERCEL) {
    console.log('IndexNow: skipped (local build — set VERCEL=1 to test)');
    return;
  }

  const key = readKey();
  const keyLocation = `https://${HOST}/${KEY_FILE}`;
  const urlList = urlsFromSitemap();

  const body = {
    host: HOST,
    key,
    keyLocation,
    urlList
  };

  const res = await fetch(INDEXNOW_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (!res.ok) {
    console.warn('IndexNow: request failed', res.status, text || res.statusText);
    return;
  }
  console.log(
    `IndexNow: submitted ${urlList.length} URL(s), response ${res.status}${text ? ` — ${text}` : ''}`
  );
}

main().catch((err) => {
  console.warn('IndexNow:', err.message);
});
