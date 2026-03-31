/**
 * Writes supabase/config.js during deploy (e.g. Vercel) from env vars.
 * Root config.js is gitignored, so production needs this to get real credentials.
 *
 * Set in Vercel: Project Settings → Environment Variables
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_ANON_KEY=eyJ...
 *   NOTIFY_WEBHOOK_SECRET=...   (same string used by api/notify-submission — also embedded as internalNotifyKey for client notify)
 *
 * Local: does not overwrite an existing config.js unless env vars are set (so npm run build is safe).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outFile = path.join(root, 'supabase', 'config.js');
const exampleFile = path.join(root, 'supabase', 'config.example.js');

const url = (process.env.SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_ANON_KEY || '').trim();
const notifySecret = (process.env.NOTIFY_WEBHOOK_SECRET || '').trim();
const isCi = Boolean(process.env.VERCEL || process.env.CI);

if (url && key) {
  const body = `export const supabaseConfig = {
  url: ${JSON.stringify(url)},
  anonKey: ${JSON.stringify(key)},
  internalNotifyKey: ${JSON.stringify(notifySecret)}
};
`;
  fs.writeFileSync(outFile, body, 'utf8');
  process.stdout.write(
    'Wrote supabase/config.js from SUPABASE_URL / SUPABASE_ANON_KEY / NOTIFY_WEBHOOK_SECRET\n'
  );
} else if (isCi) {
  fs.copyFileSync(exampleFile, outFile);
  process.stdout.write(
    'Copied supabase/config.example.js → config.js (set SUPABASE_URL and SUPABASE_ANON_KEY on Vercel for production)\n'
  );
} else if (!fs.existsSync(outFile)) {
  fs.copyFileSync(exampleFile, outFile);
  process.stdout.write(
    'Created supabase/config.js from config.example.js (edit with your Supabase URL and anon key)\n'
  );
} else {
  process.stdout.write(
    'Leaving existing supabase/config.js unchanged (set SUPABASE_URL + SUPABASE_ANON_KEY to overwrite)\n'
  );
}
