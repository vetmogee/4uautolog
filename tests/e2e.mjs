// End-to-end test against mocked Plus4U pages. The mocks mirror the real DOM seen on
// www.plus4u.net and uuidentity.plus4u.net (see README), but the real sites are never contacted:
// every request is answered by page.route, and anything that slips past it hits a dead proxy.
import { chromium } from "playwright";
const ext = new URL("..", import.meta.url).pathname;

const check = (cond, msg) => {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("  ok -", msg);
};

const ID = "uu-identitymanagement-maing01/a9b105aff2744771be4daa8361954677";
const AUTH = "https://uuidentity.plus4u.net/uu-oidc-maing02/bb977a99f4cc4c37a2afce3fd599d0a7/oidc/auth?response_type=code&redirect_uri=https%3A%2F%2Fwww.plus4u.net%2Foidc%2Fcallback";
const LOGIN = `https://uuidentity.plus4u.net/${ID}/login?acrValues=standard%20high%20veryHigh&clientId=b605ee96c322478aba7d8bbd34c82989`;

// Portal. Real (cs/en): signed out shows only an icon-only plus4u5 app button (aria-label
// "Navigační tlačítko") that opens the login in a popup via window.open. The Vietnamese
// variant is hypothetical: a text button "Đăng nhập", written with combining diacritics (NFD).
const portal = `<!doctype html><meta charset="utf-8"><body><div id="bar"></div><script>
const vi = navigator.language.startsWith('vi');
setTimeout(() => {
  const bar = document.getElementById('bar');
  if (document.cookie.includes('auth=1')) {
    bar.innerHTML = vi
      ? '<span id="user">Nguyễn Văn An</span> <button id="logout">' + 'Đăng xuất'.normalize('NFD') + '</button>'
      : '<button type="button" class="plus4u5-app-button-button plus4u5-app-button-authenticated" aria-label="Navigační tlačítko"><svg width="24" height="24"></svg></button><span id="user">Jan Novák</span> <button id="logout">Odhlásit se</button>';
    return;
  }
  bar.innerHTML = vi
    ? '<button type="button" id="login">' + 'Đăng nhập'.normalize('NFD') + '</button>'
    : '<button type="button" class="uu5-bricks-button plus4u5-app-button-button plus4u5-app-button-not-authenticated" aria-label="Navigační tlačítko"><svg width="24" height="24"></svg></button>';
  bar.querySelector('button').onclick = () => window.open(${JSON.stringify(AUTH)}, 'uuOidcLogin', 'width=500,height=700');
}, 500);</script></body>`;

// Real OIDC /auth answers with a 302 to the login page.
const auth = `<!doctype html><script>location.replace(${JSON.stringify(LOGIN)})</script>`;

// Login page. Real: e-mail field + "Sign in" (type=button), then provider links
// (<a role="menuitem">). "+4U Access" reveals a <form> with accessCode1/accessCode2 password
// inputs (random ids), an icon-only back button, "Sign in" and "Forgot your access codes?",
// all type=button. The page follows the browser language. It has no Vietnamese UI today, so
// the vi labels are hypothetical (and NFD-encoded to exercise NFC normalisation).
const login = `<!doctype html><meta charset="utf-8"><body><div id="root"></div><script>
const lang = navigator.language.slice(0, 2);
const T = {
  cs: { title: 'Přihlaste se nebo vytvořte účet', signin: 'Přihlásit se', create: 'Vytvořit účet', access: 'Pokračovat s +4U Access', google: 'Pokračovat s Google', ms: 'Pokračovat s Microsoft', ph1: 'Zadejte přístupový kód 1', ph2: 'Zadejte přístupový kód 2', forgot: 'Zapomněli jste své přístupové kódy?' },
  en: { title: 'Sign in or create account', signin: 'Sign in', create: 'Create account', access: 'Continue with +4U Access', google: 'Continue with Google', ms: 'Continue with Microsoft', ph1: 'Enter access code 1', ph2: 'Enter access code 2', forgot: 'Forgot your access codes?' },
  vi: { title: 'Đăng nhập hoặc tạo tài khoản', signin: 'Đăng nhập', create: 'Tạo tài khoản', access: 'Tiếp tục với mã truy cập', google: 'Tiếp tục với Google', ms: 'Tiếp tục với Microsoft', ph1: 'Nhập mã truy cập 1', ph2: 'Nhập mã truy cập 2', forgot: 'Quên mã truy cập?' }
};
const L = Object.fromEntries(Object.entries(T[lang] || T.en).map(([k, v]) => [k, lang === 'vi' ? v.normalize('NFD') : v]));
const hex = () => crypto.randomUUID().replace(/-/g, '');
const flag = (n) => { document.cookie = n + '=1; domain=.plus4u.net; path=/'; };
const ok = () => { flag('auth'); location.href = 'https://www.plus4u.net/oidc/callback?code=x'; };
setTimeout(() => {
  root.innerHTML = '<h2>' + L.title + '</h2>'
    + '<input id="' + hex() + '" name="username" type="email" autocomplete="username">'
    + '<button type="button" id="create">' + L.create + '</button><button type="button" id="email-signin">' + L.signin + '</button>'
    + '<div role="menu"><a role="menuitem">' + L.access + '</a><a role="menuitem">' + L.google + '</a><a role="menuitem">' + L.ms + '</a></div>'
    + '<div id="panel"></div><a role="link" href="https://uuidentity.plus4u.net/${ID}/about">About app</a>';
  document.getElementById('email-signin').onclick = () => flag('emailsignin');
  const items = root.querySelectorAll('[role=menuitem]');
  items[1].onclick = () => { flag('viaGoogle'); ok(); };
  items[0].onclick = () => setTimeout(() => {
    panel.innerHTML = '<form><button type="button" class="back"><svg width="16" height="16"></svg></button>'
      + '<input id="' + hex() + '" name="accessCode1" type="password" autocomplete="one-time-code" placeholder="' + L.ph1 + '">'
      + '<input id="' + hex() + '" name="accessCode2" type="password" autocomplete="current-password" placeholder="' + L.ph2 + '">'
      + '<button type="button" class="signin">' + L.signin + '</button><button type="button" class="forgot">' + L.forgot + '</button></form>';
    panel.querySelector('.forgot').onclick = () => flag('forgot');
    panel.querySelector('.signin').onclick = () => {
      const [c1, c2] = panel.querySelectorAll('input');
      if (c1.value === 'AAA' && c2.value === 'BBB') ok(); else panel.append('bad codes');
    };
  }, 300);
}, 300);</script></body>`;

// The callback hands the result back. In a popup the extension closes it; in a tab, go home.
const callback = `<!doctype html><body>callback<script>setTimeout(() => location.href = 'https://www.plus4u.net/cs/', 1500)</script></body>`;

async function run(locale) {
  console.log(`\n=== ${locale} ===`);
  const ctx = await chromium.launchPersistentContext("", {
    headless: true, channel: "chromium", locale,
    // Keep Chrome's popup blocker on, like a normal profile (Playwright turns it off by default).
    ignoreDefaultArgs: ["--disable-popup-blocking"],
    // Requests that bypass page.route (a new window's very first one can) go nowhere.
    proxy: { server: "http://127.0.0.1:9" },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
  });
  const html = (body) => ({ contentType: "text/html; charset=utf-8", body });
  await ctx.route(/^https:\/\/([a-z0-9-]+\.)*plus4u\.net\//, (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === "uuidentity.plus4u.net") return r.fulfill(html(u.pathname.endsWith("/oidc/auth") ? auth : login));
    return r.fulfill(html(u.pathname.startsWith("/oidc/callback") ? callback : portal));
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  const store = () => sw.evaluate(() => chrome.storage.local.get(null));
  const setStore = (v) => sw.evaluate((v) => chrome.storage.local.set(v), v);
  const flags = async () => (await ctx.cookies("https://www.plus4u.net")).map((c) => c.name);
  const page = await ctx.newPage();

  // The extension opens the (popup-blocked) login in its own window.
  async function loginWindow() {
    const win = await ctx.waitForEvent("page", { predicate: (p) => p !== page, timeout: 20000 });
    await win.waitForLoadState("domcontentloaded").catch(() => {});
    if (!win.url().startsWith("https://")) await win.reload(); // first request raced page.route
    return win;
  }
  const vi = locale.startsWith("vi");
  const T = vi
    ? { access: "Tiếp tục với mã truy cập", google: "Tiếp tục với Google", signin: "Đăng nhập" }
    : { access: "Pokračovat s +4U Access", google: "Pokračovat s Google", signin: "Přihlásit se" };
  const nfd = (s) => (vi ? s.normalize("NFD") : s);

  await setStore({ rememberCodes: true });

  // 1) Signed out: the extension clicks the portal's sign-in button; the popup is blocked, so
  //    the extension opens the login window itself. You sign in there once by hand.
  let win = loginWindow();
  await page.goto("https://www.plus4u.net/cs/");
  win = await win;
  check(/uuidentity\.plus4u\.net\/.*\/login/.test(win.url()), "blocked login popup reopened by the extension: " + win.url().slice(0, 60));
  await win.getByText(nfd(T.access), { exact: true }).click();
  await win.fill('input[name="accessCode1"]', "AAA");
  await win.fill('input[name="accessCode2"]', "BBB");
  await win.locator("form button.signin").click();
  await win.waitForEvent("close", { timeout: 15000 });
  await page.waitForSelector("#user", { timeout: 15000 });
  let s = await store();
  check(s.lastMethod && s.lastMethod.kind === "access-codes", "learned method: access codes");
  check(s.codes && s.codes.code1 === "AAA" && s.codes.code2 === "BBB", "codes remembered (Remember access codes is on)");
  check(true, "login window closed and portal reloaded signed in");

  // 2) Session expired: fully automatic, through "+4U Access" -> codes -> Sign in.
  await ctx.clearCookies();
  win = loginWindow();
  await page.goto("https://www.plus4u.net/cs/");
  await (await win).waitForEvent("close", { timeout: 20000 });
  await page.waitForSelector("#user", { timeout: 15000 });
  check(true, "automatic login with access codes");
  const f = await flags();
  check(!f.includes("forgot") && !f.includes("emailsignin"), "never clicked 'Forgot…' or the e-mail 'Sign in'");

  // 3) Switch to Google by hand on the login page, then check it is replayed.
  await ctx.clearCookies();
  await setStore({ enabled: false });
  await page.goto(LOGIN);
  await page.getByText(nfd(T.google), { exact: true }).click();
  await page.waitForSelector("#user", { timeout: 15000 });
  s = await store();
  check(s.lastMethod && s.lastMethod.label === "Google", "learned method: Google");
  await setStore({ enabled: true, attempts: [] });
  await ctx.clearCookies();
  win = loginWindow();
  await page.goto("https://www.plus4u.net/cs/");
  await (await win).waitForEvent("close", { timeout: 20000 });
  await page.waitForSelector("#user", { timeout: 15000 });
  check((await flags()).includes("viaGoogle"), "automatic login via Google");

  // 4) A manual logout pauses auto login.
  await page.click("#logout");
  await ctx.clearCookies();
  let opened = false;
  const onPage = () => (opened = true);
  ctx.on("page", onPage);
  await page.goto("https://www.plus4u.net/cs/");
  await page.waitForTimeout(3000);
  ctx.off("page", onPage);
  check(!opened && (await page.locator("#user").count()) === 0, "stays signed out after a manual logout");
  await ctx.close();
}

await run("cs-CZ");
await run("vi-VN");
console.log("\nAll checks passed.");
