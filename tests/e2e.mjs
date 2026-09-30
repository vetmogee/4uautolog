// End-to-end test against mocked Plus4U pages (the real login page is never contacted).
import { chromium } from "playwright";
const ext = new URL("..", import.meta.url).pathname;

const portal = `<!doctype html><body><div id="bar"></div><script>
setTimeout(() => {
  const bar = document.getElementById('bar');
  if (document.cookie.includes('auth=1')) bar.innerHTML = '<span id="user">Jan Novák</span> <button id="logout">Odhlásit</button>';
  else { bar.innerHTML = '<button id="login">Přihlásit se</button>'; document.getElementById('login').onclick = () => location.href = 'https://oidc.plus4u.net/uu-oidcg01-main/0-0/oidc/auth'; }
}, 500);</script></body>`;
const oidc = `<!doctype html><body><div id="root"></div><script>
setTimeout(() => {
  document.getElementById('root').innerHTML = '<button id="g">Přihlásit přes Google</button><form id="f"><input id="c1" type="text"><input id="c2" type="password"><button type="submit">Přihlásit</button></form>';
  const ok = () => { document.cookie = 'auth=1; domain=.plus4u.net; path=/'; location.href = 'https://plus4u.net/'; };
  document.getElementById('g').onclick = () => { window.__via='google'; ok(); };
  document.getElementById('f').onsubmit = (e) => { e.preventDefault(); if (c1.value==='AAA' && c2.value==='BBB') ok(); else document.body.append('bad'); };
}, 300);</script></body>`;

const ctx = await chromium.launchPersistentContext("", {
  headless: true, channel: "chromium",
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
await ctx.route("https://*.plus4u.net/**", (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: new URL(r.request().url()).hostname.startsWith("oidc") ? oidc : portal }));
await ctx.route("https://plus4u.net/**", (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: portal }));
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent("serviceworker");
const store = () => sw.evaluate(() => chrome.storage.local.get(null));
await sw.evaluate(() => chrome.storage.local.set({ rememberCodes: true }));

const page = await ctx.newPage();
// 1) first visit: extension should open login, then user logs in manually
await page.goto("https://plus4u.net/");
await page.waitForURL(/oidc/, { timeout: 20000 });
console.log("1. auto-opened login page:", page.url());
await page.fill("#c1", "AAA"); await page.fill("#c2", "BBB"); await page.click("button[type=submit]");
await page.waitForSelector("#user");
let s = await store(); console.log("   learned:", s.lastMethod, s.codes);

// 2) session expired: extension should log in fully by itself
await ctx.clearCookies();
await page.goto("https://plus4u.net/");
await page.waitForSelector("#user", { timeout: 15000 });
console.log("2. auto login with access codes OK");

// 3) switch to Google manually, then verify replay
await ctx.clearCookies();
await sw.evaluate(() => chrome.storage.local.set({ enabled: false }));
await page.goto("https://oidc.plus4u.net/x/oidc/auth");
await page.click("#g"); await page.waitForSelector("#user");
s = await store(); console.log("3. learned:", s.lastMethod);
await sw.evaluate(() => chrome.storage.local.set({ enabled: true, attempts: [] }));
await ctx.clearCookies();
await page.goto("https://plus4u.net/");
await page.waitForSelector("#user", { timeout: 15000 });
console.log("   auto login via Google OK");

// 4) manual logout pauses auto login
await page.click("#logout"); await ctx.clearCookies();
await page.goto("https://plus4u.net/"); await page.waitForTimeout(3000);
console.log("4. after logout stays on portal:", !page.url().includes("oidc"));
await ctx.close();
