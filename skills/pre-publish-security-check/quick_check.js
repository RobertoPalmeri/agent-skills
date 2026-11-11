#!/usr/bin/env node
// Fast, free security check to run before publishing a site, app or API. Node 18+, no dependencies.
//   node quick_check.js <https://site> [source_folder]
//   node quick_check.js <source_folder>            (nothing online yet)
//   node quick_check.js --selftest
// Looks for: (1) secret keys in public code and in files, (2) open doors (.env, .git, admin, backups) and public
// source maps, (3) missing security headers, (4) HTTPS and CORS mistakes. Exit code 1 if anything SEVERE is found.
// It does NOT replace a real audit. A clean result means "nothing obvious", not "safe".
// Only scan sites you own or are allowed to test.
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

// [name, pattern, level (default SEVERE), note]
const SECRETS = [
  ['Stripe secret key', /(?:sk|rk)_live_[0-9a-zA-Z]{16,}/],
  ['Stripe webhook secret', /whsec_[0-9a-zA-Z]{20,}/],
  ['AWS access key id', /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/],
  ['AWS secret access key', /aws_?secret_?access_?key["']?\s*[=:]\s*["']?[A-Za-z0-9\/+]{40}(?![A-Za-z0-9\/+])/i],
  ['Google API key', /AIza[0-9A-Za-z_\-]{35}/, 'MEDIUM', 'often public by design (Firebase, Maps): make sure it is restricted to your domains and APIs'],
  // left boundary + at least one digit: keeps CSS names like "task-list-item-..." out
  ['OpenAI / Anthropic key', /(?<![A-Za-z0-9_-])sk-(?=[A-Za-z_-]*\d)[A-Za-z0-9_\-]{32,}/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}/],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Telegram bot token', /(?<!\d)\d{8,10}:[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])/],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----/],
  ['Cloudflare API token', /CLOUDFLARE_API_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]{30,}/i],
];
const DOORS = ['/.env', '/.git/config', '/.git/HEAD', '/admin', '/admin/', '/wp-admin/', '/backup.sql', '/db.sqlite', '/database.sqlite', '/config.json', '/.DS_Store', '/server-status', '/api/admin', '/api/users', '/api/debug', '/debug', '/phpinfo.php', '/package.json'];
const SEVERE_DOOR = /\.env|\.git|backup|sqlite|\.sql|config|phpinfo|api\/(users|admin|debug)/;
// doors that are web pages when open; every other door is a file or JSON, never an HTML page
const HTML_DOOR = /^\/(admin\/?|wp-admin\/|debug|server-status|phpinfo\.php)$/;
const HEADERS = [
  ['strict-transport-security', 'HSTS'],
  ['x-content-type-options', 'nosniff'],
  ['content-security-policy', 'CSP'],
  ['x-frame-options', 'clickjacking protection (or CSP frame-ancestors)'],
  ['referrer-policy', 'referrer-policy'],
];
const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', 'venv', '.venv', '__pycache__']);
const ENV_FILE = /^\.env|^\.dev\.vars$/;
const ENV_EXAMPLE = /example|sample|template|dist/i;

function findSecrets(text, where, out) {
  for (const [name, re, level = 'SEVERE', note] of SECRETS) {
    const m = text.match(re);
    if (m) out.push({ level, what: `${name} in ${where}${note ? ' (' + note + ')' : ''}`, hint: m[0].slice(0, 6) + '...(hidden)' });
  }
}

// read at most `max` bytes: an exposed backup can be gigabytes
async function readStart(r, max = 4000) {
  if (!r.body) return '';
  const reader = r.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < max) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
  } finally { reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).subarray(0, max).toString('utf8');
}

const isHtml = (t) => /^\s*(?:<!doctype|<html|<head|<body|<!--|<meta|<script|<div)/i.test(t);
const titleOf = (t) => ((t.match(/<title[^>]*>([^<]*)/i) || [])[1] || '').trim();
// page fingerprint without attribute values (nonces, CSRF tokens) and whitespace
const shape = (t) => t.replace(/=\s*(?:"[^"]*"|'[^']*')/g, '=').replace(/\s+/g, ' ').slice(0, 2000);
const noQuery = (u) => u.split(/[?#]/)[0]; // a key in ?key=... must not be printed

async function checkUrl(url, out) {
  let origin = new URL(url);
  const get = (p, opts = {}) => fetch(new URL(p, origin), { redirect: 'manual', signal: AbortSignal.timeout(20000), ...opts });
  // follow redirects for the home page (http -> https, / -> /login): everything else is checked on the final site
  const home = await get('/', { redirect: 'follow' });
  const html = await home.text();
  const finalUrl = new URL(home.url || origin);
  origin = finalUrl;
  if (!home.ok) out.push({ level: 'LOW', what: `home page answered ${home.status}: a firewall or bot challenge may be hiding the real site, results below describe that response` });
  findSecrets(html, 'the home page', out);

  // soft-404 baseline: what does a path that cannot exist return?
  let fallback = '';
  try {
    const r = await get('/qc-' + Date.now().toString(36) + '-does-not-exist');
    fallback = r.status === 200 ? await readStart(r, 65536) : (r.body?.cancel().catch(() => {}), '');
  } catch (e) { /* skip */ }
  const seenShapes = [html, fallback].filter(Boolean).map(shape);
  // titles are compared with the not-found page only: a real /admin often shares the home page's layout and title
  const fallbackTitle = isHtml(fallback) ? titleOf(fallback) : null;
  const sameAsKnownPage = (t) => seenShapes.includes(shape(t)) || (isHtml(t) && titleOf(t) !== '' && titleOf(t) === fallbackTitle);

  const scripts = [...new Set([...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]))].slice(0, 25);
  for (const src of scripts) {
    try {
      const srcUrl = new URL(src, finalUrl);
      const r = await get(srcUrl);
      const t = await r.text();
      findSecrets(t, 'script ' + noQuery(src), out);
      // source maps: only for scripts on the site itself (CDN libraries ship their own maps)
      if (srcUrl.host !== finalUrl.host) continue;
      const refs = [...t.matchAll(/[#@]\s*sourceMappingURL=([^\s'"`*]+)/g)];
      const mapUrl = new URL(refs.length ? refs[refs.length - 1][1] : noQuery(srcUrl.href) + '.map', srcUrl);
      const sm = await fetch(mapUrl, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
      const body = sm.status === 200 ? await readStart(sm) : (sm.body?.cancel().catch(() => {}), '');
      if (/"(?:mappings|sources)"\s*:/.test(body)) out.push({ level: 'MEDIUM', what: 'public source map (readable source code): ' + noQuery(src) });
    } catch (e) { /* unreachable script: skip */ }
  }

  for (const d of DOORS) {
    try {
      const r = await get(d);
      if (r.status !== 200) { r.body?.cancel().catch(() => {}); continue; }
      const t = await readStart(r, 65536);
      if (!t.trim() || sameAsKnownPage(t)) continue;
      if (isHtml(t) && (!HTML_DOOR.test(d) || /404|not found/i.test(titleOf(t)))) continue; // a .env or .sql is never an HTML page
      out.push({ level: SEVERE_DOOR.test(d) ? 'SEVERE' : 'MEDIUM', what: `open door without login: ${d} (200). Check by hand: a login page is fine, data is not.` });
    } catch (e) { /* skip */ }
  }

  for (const [key, label] of HEADERS) {
    const framed = key === 'x-frame-options' && /frame-ancestors/.test(home.headers.get('content-security-policy') || '');
    if (!home.headers.get(key) && !framed) out.push({ level: 'LOW', what: 'missing header: ' + label });
  }
  if (finalUrl.protocol !== 'https:') out.push({ level: 'SEVERE', what: 'site is not served over HTTPS' });

  try {
    const r = await get(finalUrl, { redirect: 'follow', headers: { Origin: 'https://evil.example' } });
    r.body?.cancel().catch(() => {});
    if (r.headers.get('access-control-allow-origin') === 'https://evil.example' && r.headers.get('access-control-allow-credentials') === 'true') {
      out.push({ level: 'SEVERE', what: 'CORS on the home page reflects any origin and allows credentials' });
    }
  } catch (e) { /* skip */ }
}

// Windows PowerShell 5.1 writes UTF-16 by default (echo KEY=... > .env): decode it instead of calling it binary
function textOf(buf) {
  const even = (b) => b.subarray(0, b.length & ~1);
  if (buf[0] === 0xff && buf[1] === 0xfe) return even(buf.subarray(2)).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) return Buffer.from(even(buf.subarray(2))).swap16().toString('utf16le');
  return buf.subarray(0, 8000).includes(0) ? null : buf.toString('utf8'); // null: binary file
}

function checkFolder(dir, out) {
  let count = 0;
  (function walk(d) {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { out.push({ level: 'LOW', what: `could not read folder ${d} (${e.code})` }); return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); continue; }
      try {
        const st = fs.statSync(p); // follows a symlinked file (.env -> ../secrets/.env); folder links are not walked
        if (!st.isFile() || st.size > 3e6) continue;
        if (ENV_FILE.test(e.name) && !ENV_EXAMPLE.test(e.name)) out.push({ level: 'MEDIUM', what: `secrets file in the folder: ${p} (must never be published)` });
        const text = textOf(fs.readFileSync(p));
        if (text === null) continue;
        count++;
        findSecrets(text, p, out);
      } catch (err) { out.push({ level: 'LOW', what: `could not read ${p} (${err.code})` }); }
    }
  })(dir);
  return count;
}

async function selftest() {
  const fails = [];
  const check = (label, cond) => { if (!cond) fails.push(label); };
  const key = 'sk_live_' + 'a'.repeat(24);

  let out = [];
  findSecrets('x ' + key, 't', out);
  findSecrets('AKIA' + 'A'.repeat(16), 't', out);
  findSecrets('AWS_SECRET_ACCESS_KEY=' + 'Ab1/'.repeat(10), 't', out);
  findSecrets('nothing to see here', 't', out);
  findSecrets('<div class="task-list-item-checkbox-container-wrapper-large">', 't', out);
  check('three real keys, no false positive', out.length === 3 && out.every((x) => x.level === 'SEVERE'));
  check('secret value hidden', out.every((x) => !/aaaa/.test(x.hint)));
  out = []; findSecrets('apiKey: "AIza' + 'B'.repeat(35) + '"', 't', out);
  check('Google key is MEDIUM', out.length === 1 && out[0].level === 'MEDIUM');

  // folder walk: dotenv variants and .tsx, inside a path that contains "venv", node_modules skipped
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-venv-'));
  try {
    fs.writeFileSync(path.join(tmp, '.env.local'), 'STRIPE=' + key);
    fs.writeFileSync(path.join(tmp, 'App.tsx'), `const k = '${key}'`);
    fs.writeFileSync(path.join(tmp, '.env.example'), 'STRIPE=');
    fs.writeFileSync(path.join(tmp, '.env'), Buffer.from(String.fromCharCode(0xfeff) + 'STRIPE=' + key, 'utf16le')); // PowerShell 5.1 "> .env"
    fs.mkdirSync(path.join(tmp, 'node_modules'));
    fs.writeFileSync(path.join(tmp, 'node_modules', 'x.js'), key);
    out = [];
    const n = checkFolder(tmp, out);
    check('folder walk', n === 4 && out.filter((x) => x.level === 'SEVERE').length === 3 && out.filter((x) => /secrets file/.test(x.what)).length === 2);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

  const doorsOn = async (handler) => {
    const server = http.createServer(handler);
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
    try {
      out = [];
      await checkUrl(`http://127.0.0.1:${server.address().port}/`, out);
      return out.filter((x) => /open door/.test(x.what));
    } finally { server.closeAllConnections?.(); server.close(); }
  };

  // SPA host: every path returns the page with a fresh nonce; only the real /.env is exposed
  let doors = await doorsOn((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/.env') return res.end('DB_PASSWORD=hunter2\n');
    if (p === '/app.js') return res.end('var s="//# sourceMappingURL="+n;\n//# sourceMappingURL=app.js.map\n');
    res.setHeader('content-type', 'text/html');
    res.end(`<!doctype html><html><head><script nonce="${Math.random()}"></script><title>Shop</title></head><body><script src="/app.js?key=AIza${'Q'.repeat(35)}"></script></body></html>`);
  });
  check('soft-404 doors', doors.length === 1 && /\/\.env /.test(doors[0].what));
  check('no fake source map', !out.some((x) => /source map/.test(x.what)));
  check('script query not printed', !out.some((x) => /QQQQ/.test(x.what)));

  // server-rendered site with real 404s: an open /admin that shares the home page's title is still reported
  doors = await doorsOn((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    res.statusCode = p === '/' || p === '/admin' ? 200 : 404;
    res.end(`<!doctype html><html><head><title>Shop</title></head><body>${p === '/admin' ? '<table>all users</table>' : 'Welcome'}</body></html>`);
  });
  check('admin with same title', doors.length === 1 && /\/admin /.test(doors[0].what));

  console.log(fails.length ? 'selftest FAILED: ' + fails.join(', ') : 'selftest ok');
  process.exitCode = fails.length ? 1 : 0;
}

async function main() {
  let [target, folder] = process.argv.slice(2);
  if (target === '--selftest') return selftest();
  if (target && !/^https?:\/\//i.test(target)) {
    if (folder) { console.error(`error: "${target}" is not a site address (it must start with https://)`); process.exitCode = 2; return; }
    folder = target; target = ''; // folder only: nothing online yet
  }
  if (!target && !folder) { console.log('usage: node quick_check.js <https://site> [source_folder]  |  <source_folder>  |  --selftest'); process.exitCode = 2; return; }
  if (folder && !(fs.existsSync(folder) && fs.statSync(folder).isDirectory())) { console.error(`error: "${folder}" is not a folder (a site must start with https://)`); process.exitCode = 2; return; }

  const out = [];
  const files = folder ? checkFolder(folder, out) : 0;
  let failed = '';
  if (target) {
    try { await checkUrl(target, out); } catch (e) { failed = (e.cause && (e.cause.code || e.cause.message)) || e.message; }
  }
  const rank = { SEVERE: 0, MEDIUM: 1, LOW: 2 };
  const severe = out.filter((x) => x.level === 'SEVERE').length;
  const label = [target, folder && `${folder} (${files} files)`].filter(Boolean).join(' + ');
  console.log(`Quick check ${label}: ${out.length} findings, ${severe} SEVERE`);
  for (const x of out.sort((a, b) => rank[a.level] - rank[b.level])) console.log(` [${x.level}] ${x.what}${x.hint ? ' -> ' + x.hint : ''}`);
  if (failed) console.log(` could not reach ${target} (${failed}): the site was NOT checked`);
  else if (!out.length) console.log(' nothing found by the quick check (this does NOT mean secure: do the full review too)');
  process.exitCode = severe ? 1 : failed ? 2 : 0;
}

main().catch((e) => { console.error('error:', e.message); process.exitCode = 2; });
