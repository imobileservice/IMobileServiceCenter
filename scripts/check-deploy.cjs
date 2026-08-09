/*
 * Post-deploy health check for the live site.
 *
 *   npm run check:deploy
 *   npm run check:deploy -- https://staging.example.com
 *
 * Guards the failure that has white-screened this site twice: a MISSING /assets/*
 * chunk being answered with index.html at HTTP 200 + text/html while the /assets/*
 * rule stamps it max-age=31536000, so browsers cache the fallback page *as* the
 * entry bundle and never recover.
 *
 * Run this AFTER every deploy, before telling anyone it is fixed.
 */
const https = require('https');
const http = require('http');
const { URL } = require('url');

const BASE = (process.argv[2] || 'https://imobileservicecenter.lk').replace(/\/$/, '');

// http:// is allowed so the same checks can run against `wrangler pages dev`
// BEFORE a deploy, which is where the fallback behaviour is cheapest to catch.
const get = (url) => new Promise((resolve, reject) => {
  (url.startsWith('http://') ? http : https).get(url, { headers: { 'User-Agent': 'deploy-check' } }, (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  }).on('error', reject);
});

const results = [];
const ok = (name, pass, detail) => results.push({ name, pass, detail });

/*
 * Client-side routes. Each must return 200 AND the app shell, with no redirect.
 *
 * These exist because a change that made missing files return 404 also took out
 * the SPA fallback that was routing /admin/*, so the whole admin panel 404'd in
 * production. Asset checks alone did not catch it. Routes are checked first now.
 */
/*
 * One route per rule family in public/_redirects - plain paths and splats both,
 * because they fail independently. A rewrite pointed at /index.html returns a 308
 * to / rather than the app shell, so a redirect here is a failure, not a pass.
 */
const ROUTES = [
  '/', '/shop', '/about', '/cart', '/contact', '/signin',
  '/product/123', '/invoice/123', '/auth/callback',
  '/admin', '/admin/login', '/admin/products', '/cashier/pos',
];

(async () => {
  /*
   * 0. Every client route must serve the app shell directly - no 404, no
   *    redirect - AND must say so uncacheably.
   *
   * The cache-control half is checked per route, not just on /. Every deploy
   * renames every asset (BUILD_ID in vite.config.ts), so a route allowed to sit
   * in a browser cache keeps naming files that no longer exist: the page white-
   * screens with "Refused to apply style ... MIME type text/html" and a 404 for
   * the entry bundle, long after the deploy succeeded. A rule that covers / but
   * misses /admin/* breaks only the admin panel, and only for people who had it
   * open - which is exactly the kind of fault that gets reported as "it worked
   * yesterday".
   *
   * The shell references are collected too: every route must name the SAME
   * build. Two different build ids across routes means a half-finished deploy.
   */
  const shellRefs = new Map();

  for (const route of ROUTES) {
    const r = await get(`${BASE}${route}`);
    const ref = (r.body.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"/) || [])[1];
    const loc = r.headers.location ? ` -> ${r.headers.location}` : '';
    ok(`route ${route} serves the app`,
      r.status === 200 && Boolean(ref),
      `${r.status}${loc}` + (r.status === 200 && !ref ? ' (200 but not the app shell)' : ''));

    if (ref) shellRefs.set(route, ref);

    const routeCc = r.headers['cache-control'] || '';
    ok(`route ${route} is not cached`,
      /no-store|no-cache/.test(routeCc),
      `cache-control: ${routeCc || '(none)'}`);
  }

  const distinctBuilds = new Set(shellRefs.values());
  ok('every route serves the same build',
    distinctBuilds.size <= 1,
    distinctBuilds.size <= 1
      ? [...distinctBuilds][0] || '(none)'
      : [...shellRefs].map(([route, ref]) => `${route} -> ${ref}`).join('\n        '));

  // 1. entry HTML must never be cached, or clients pin an old bundle reference
  const index = await get(`${BASE}/`);
  const cc = index.headers['cache-control'] || '';
  ok('index.html is not cached',
    /no-store|no-cache/.test(cc),
    `status ${index.status}, cache-control: ${cc || '(none)'}`);

  // 2. the bundle the live HTML references must actually exist and be JS
  const ref = (index.body.match(/src="(\/assets\/[^"]+\.js)"/) || [])[1];
  if (!ref) {
    ok('entry bundle reference found in HTML', false, 'no /assets/*.js <script> in index.html');
  } else {
    const entry = await get(`${BASE}${ref}`);
    const ct = entry.headers['content-type'] || '';
    ok('referenced entry bundle serves JavaScript',
      entry.status === 200 && /javascript|ecmascript/i.test(ct),
      `${ref} -> ${entry.status} ${ct}`);
  }

  // 3. THE BIG ONE: a missing asset must not masquerade as a cacheable module
  const missing = await get(`${BASE}/assets/does-not-exist-${Date.now()}.js`);
  const mct = missing.headers['content-type'] || '';
  const mcc = missing.headers['cache-control'] || '';
  const poisonable = missing.status === 200 && /text\/html/i.test(mct);
  ok('missing asset does NOT return 200 text/html',
    !poisonable,
    `${missing.status} ${mct}, cache-control: ${mcc || '(none)'}`);

  // 3b. the SPA fallback must stay narrow. If an unknown page still answers with
  // the app shell, the rewrite is a catch-all again and check 3 only passes by
  // luck - the next missing chunk goes straight back to being served as HTML.
  const unknown = await get(`${BASE}/no-such-page-${Date.now()}`);
  ok('unknown route does NOT return the app shell',
    unknown.status === 404,
    `${unknown.status} ${unknown.headers['content-type'] || ''}`);

  const longCachedHtml = poisonable && /max-age=\d{6,}/.test(mcc);
  ok('missing asset is not long-cached as HTML',
    !longCachedHtml,
    longCachedHtml
      ? 'fallback HTML carries a multi-day max-age - browsers will cache it AS the bundle'
      : 'ok');

  console.log(`\n  Deploy check - ${BASE}\n`);
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n        ${r.detail}`);
  }
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n  ${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED'}\n`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('check-deploy error:', e.message); process.exit(2); });
