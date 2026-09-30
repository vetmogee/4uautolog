/* global chrome, P4U */
// Runs on every *.plus4u.net and unicornuniversity.net page (and frame).
//  - On portal pages: if a "Log in" button is visible you are signed out -> click it.
//  - On the login (OIDC) page: remember which method you use, and when the page
//    is opened automatically, replay the method you used last.
(function () {
  "use strict";

  const WAIT_MS = 15000;

  // Labels in Czech, Slovak, English and Vietnamese. Patterns and page text are both
  // NFC-normalised (see nfc/textOf) so precomposed and combining diacritics match alike.
  const nfc = (s) => String(s).normalize("NFC");
  const re = (src) => new RegExp(nfc(src), "iu");

  const LOGIN_TEXT = re(String.raw`^(přihlásit(\s+se)?|prihlásiť(\s+sa)?|log\s*-?\s*in|sign\s*-?\s*in|đăng\s+nhập)$`);
  const LOGOUT_TEXT = re(String.raw`(odhlásit|odhlásiť|log\s*-?\s*out|sign\s*-?\s*out|đăng\s+xuất)`);
  const SUBMIT_TEXT = re(
    String.raw`(přihlásit|prihlásiť|log\s*-?\s*in|sign\s*-?\s*in|continue|pokračovat|pokračovať|potvrdit|potvrdiť|confirm|^ok$|đăng\s+nhập|tiếp\s+tục|xác\s+nhận)`
  );
  // "Continue with +4U Access" opens the access-code form on uuidentity.plus4u.net.
  const ACCESS_CODES_TEXT = re(String.raw`(\+\s*4\s*u\s*access|access\s*codes?|přístupov|prístupov|mã\s+truy\s+cập)`);
  // "Forgot your access codes?" also mentions access codes but must never be clicked.
  const FORGOT_TEXT = re(String.raw`(forgot|zapomněl|zabudl|quên)`);
  const PROVIDERS = [
    ["Google", /google/i],
    ["Microsoft", /(microsoft|office\s*365|outlook|azure)/i],
    ["Apple", /apple/i],
    ["Facebook", /facebook/i],
    ["GitHub", /github/i],
    ["LinkedIn", /linkedin/i],
    ["Bank ID", /bank\s*id/i],
    // \b keeps "uuidentity" (in every login-page link) from counting as the uuID app.
    ["Mobile app", /(\buu\s*id\b|mobil|mobile|\bqr\b)/i]
  ];

  // ---------- DOM helpers ----------

  const isVisible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";

  const textOf = (el) =>
    nfc(el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("title") || "")
      .replace(/\s+/g, " ")
      .trim();

  const clickables = () =>
    Array.from(
      document.querySelectorAll('button, a, [role="button"], [role="menuitem"], input[type="submit"], input[type="button"]')
    ).filter(isVisible);

  function selectorFor(el) {
    if (el.id && !/\d{4,}|^[a-f0-9-]{16,}$/i.test(el.id)) return "#" + CSS.escape(el.id);
    const name = el.getAttribute("name");
    if (name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
    return null;
  }

  function waitFor(fn, timeout = WAIT_MS) {
    return new Promise((resolve) => {
      const found = fn();
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const r = fn();
        if (r) {
          obs.disconnect();
          clearTimeout(timer);
          resolve(r);
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      const timer = setTimeout(() => {
        obs.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  function setValue(input, value) {
    // Works with React-based uu5 inputs, which ignore plain `.value =` assignments.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    input.focus();
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function badge(text, color) {
    try {
      chrome.runtime.sendMessage({ type: "badge", text, color });
    } catch (e) {
      /* extension reloaded */
    }
  }

  // ---------- Access code form ----------

  // Plus4U signs you in with "Access code 1" + "Access code 2". On uuidentity.plus4u.net both are
  // password inputs named accessCode1/accessCode2 (their ids are random per render).
  function findCodeInputs() {
    const byName = (n) => Array.from(document.querySelectorAll(`input[name="${n}"]`)).find(isVisible) || null;
    const c1 = byName("accessCode1");
    const c2 = byName("accessCode2");
    if (c2) return { code1: c1, code2: c2, scope: c2.form || c2.closest("div[class*='form'], section, main") || document };

    const pw = Array.from(document.querySelectorAll('input[type="password"]')).find(isVisible);
    if (!pw) return null;
    const scope = pw.form || pw.closest("div[class*='form'], section, main") || document;
    const inputs = Array.from(scope.querySelectorAll("input")).filter(
      (i) => isVisible(i) && /^(text|password|email|)$/i.test(i.type) && !i.readOnly && !i.disabled
    );
    if (inputs.length >= 2) return { code1: inputs[0], code2: inputs[1], scope };
    return { code1: null, code2: pw, scope };
  }

  // The real form has no submit button: "Sign in" is a type="button" next to an icon-only
  // back button and "Forgot your access codes?", so match by text and skip the latter.
  function findSubmit(scope) {
    const root = scope || document;
    const typed = root.querySelector('button[type="submit"], input[type="submit"]');
    if (typed && isVisible(typed)) return typed;
    return (
      Array.from(root.querySelectorAll('button, [role="button"], input[type="button"]'))
        .filter(isVisible)
        .find((b) => SUBMIT_TEXT.test(textOf(b)) && !FORGOT_TEXT.test(textOf(b))) || null
    );
  }

  // "Continue with +4U Access" (an <a role="menuitem">) reveals the access-code form.
  function findAccessCodesOpener() {
    return clickables().find((el) => ACCESS_CODES_TEXT.test(textOf(el)) && !FORGOT_TEXT.test(textOf(el))) || null;
  }

  // ---------- Page classification ----------

  function isLoginPage() {
    const h = location.hostname;
    return (
      /^(oidc|uuidentity|identity|login)\./i.test(h) ||
      /\/(oidc|authorize|login)\b/i.test(location.pathname) ||
      !!findCodeInputs()
    );
  }

  // ---------- Recording the method you use ----------

  function classify(el) {
    const text = textOf(el);
    if (FORGOT_TEXT.test(text)) return null;
    if (ACCESS_CODES_TEXT.test(text)) return { kind: "access-codes", label: "Access codes" };
    for (const [label, re] of PROVIDERS) {
      if (re.test(text) || re.test(el.getAttribute("href") || "") || re.test(el.className || "")) {
        return { kind: "provider", label, text, selector: selectorFor(el) };
      }
    }
    return null;
  }

  async function rememberCodesSubmit() {
    const f = findCodeInputs();
    if (!f || !f.code2 || !f.code2.value) return;
    const s = await P4U.get();
    const patch = { lastMethod: { kind: "access-codes", label: "Access codes" }, attempts: [] };
    if (s.rememberCodes) patch.codes = { code1: f.code1 ? f.code1.value : "", code2: f.code2.value };
    await P4U.set(patch);
    P4U.log("Remembered method: access codes");
  }

  function installRecorder() {
    document.addEventListener(
      "click",
      async (e) => {
        if (!e.isTrusted) return; // ignore our own automated clicks
        const el = e.target.closest('button, a, [role="button"], input[type="submit"], input[type="button"]');
        if (!el) return;
        const f = findCodeInputs();
        if (f && f.scope.contains(el) && f.code2.value && !FORGOT_TEXT.test(textOf(el))) return rememberCodesSubmit();
        const method = classify(el);
        if (method && method.kind === "provider") {
          await P4U.set({ lastMethod: method, attempts: [] });
          P4U.log("Remembered method:", method.label);
        }
      },
      true
    );
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.isTrusted && e.key === "Enter" && e.target instanceof HTMLInputElement) {
          const f = findCodeInputs();
          if (f && f.scope.contains(e.target)) rememberCodesSubmit();
        }
      },
      true
    );
  }

  // ---------- Replaying the last method ----------

  function findProviderButton(method) {
    if (method.selector) {
      const el = document.querySelector(method.selector);
      if (el && isVisible(el)) return el;
    }
    const re = (PROVIDERS.find(([l]) => l === method.label) || [])[1];
    return (
      clickables().find((el) => method.text && textOf(el) === method.text) ||
      (re && clickables().find((el) => re.test(textOf(el)) || re.test(el.getAttribute("href") || ""))) ||
      null
    );
  }

  async function loginWithCodes(s) {
    const formReady = () => {
      const r = findCodeInputs();
      return r && r.code2 ? r : null;
    };
    // The real login page starts on an e-mail/provider chooser; the code form only appears
    // after "Continue with +4U Access". Wait for whichever shows up first.
    let f = await waitFor(() => formReady() || findAccessCodesOpener());
    if (f && !f.code2) {
      f.click();
      f = await waitFor(formReady);
    }
    if (!f) return P4U.log("Access code form not found");
    if (!s.codes || !s.codes.code2) {
      // Codes not stored -> let Chrome's password manager / the user fill them in.
      (f.code1 || f.code2).focus();
      badge("?", "#f9a825");
      return P4U.log("No saved access codes – enable 'Remember access codes' in the popup.");
    }
    if (f.code1) setValue(f.code1, s.codes.code1 || "");
    setValue(f.code2, s.codes.code2);
    await P4U.recordAttempt();
    const btn = findSubmit(f.scope);
    if (btn) btn.click();
    else if (f.code2.form) f.code2.form.requestSubmit();
    badge("…");
  }

  async function runLoginPage() {
    installRecorder();
    const s = await P4U.get();
    if (!s.enabled || !s.lastMethod) return;
    if (!(await P4U.canAttempt())) {
      badge("!", "#c62828");
      return P4U.log("Too many automatic attempts – pausing for a few minutes.");
    }
    if (s.lastMethod.kind === "access-codes") return loginWithCodes(s);

    const btn = await waitFor(() => findProviderButton(s.lastMethod));
    if (!btn) return P4U.log("Could not find the button for", s.lastMethod.label);
    await P4U.recordAttempt();
    P4U.log("Signing in with", s.lastMethod.label);
    badge("…");
    btn.click();
  }

  // ---------- Portal: are we signed in? ----------

  // On plus4u.net and uuApps the signed-out sign-in control is the icon-only plus4u5 app
  // button (aria-label "Navigační tlačítko", i.e. just "navigation button"), so its uu5
  // class is the reliable signal. Text/aria-label/title is the fallback for other pages.
  // unicornuniversity.net/cs/uis has the same +4U button in the top-right corner (grey when
  // signed out, green when signed in) plus a "Přihlásit se" button in the page body. There,
  // only the +4U button counts, so the text fallback is off.
  const UU_SITE = /(^|\.)unicornuniversity\.net$/i.test(location.hostname);
  const appButton = (state) =>
    Array.from(document.querySelectorAll(".plus4u5-app-button-" + state)).find(isVisible) || null;

  function findLoginButton() {
    const btn = appButton("not-authenticated");
    if (btn || UU_SITE) return btn;
    return (
      clickables().find(
        (el) =>
          LOGIN_TEXT.test(textOf(el)) ||
          LOGIN_TEXT.test(nfc(el.getAttribute("aria-label") || "").trim()) ||
          LOGIN_TEXT.test(nfc(el.getAttribute("title") || "").trim())
      ) || null
    );
  }

  async function runPortalPage() {
    // Don't immediately log you back in after you deliberately log out.
    document.addEventListener(
      "click",
      (e) => {
        const el = e.isTrusted && e.target.closest('button, a, [role="button"]');
        if (el && LOGOUT_TEXT.test(textOf(el))) P4U.set({ pausedUntil: Date.now() + 10 * 60 * 1000 });
      },
      true
    );

    const s = await P4U.get();
    if (!s.enabled) return;
    if (s.pausedUntil && Date.now() < s.pausedUntil) return P4U.log("Paused after manual logout.");

    // Settle as soon as the +4U button shows either state; a green (authenticated) one means done.
    const found = await waitFor(() => appButton("authenticated") || findLoginButton());
    const btn = found && !found.classList.contains("plus4u5-app-button-authenticated") ? found : null;
    if (!btn) {
      badge("");
      return P4U.log("Signed in (no login button found).");
    }
    if (!(await P4U.canAttempt())) {
      badge("!", "#c62828");
      return P4U.log("Too many automatic attempts – pausing for a few minutes.");
    }
    P4U.log("Signed out – opening login.");
    badge("…");
    // Our click has no user gesture, so the login popup it opens gets blocked. page-hook.js
    // reports the blocked URL; only accept it shortly after our own click, and only for Plus4U.
    const until = Date.now() + 10000;
    window.addEventListener("message", function onMsg(e) {
      const d = e.data;
      if (e.source !== window || !d || d.source !== "p4u-autologin" || d.type !== "popup-blocked") return;
      window.removeEventListener("message", onMsg);
      if (Date.now() > until) return;
      let host = "";
      try {
        host = new URL(d.url).hostname;
      } catch (err) {
        return;
      }
      if (!/(^|\.)plus4u\.net$/i.test(host)) return; // the login itself is always on uuidentity.plus4u.net
      P4U.log("Login popup was blocked – opening it from the extension.");
      try {
        chrome.runtime.sendMessage({ type: "open-login", url: d.url });
      } catch (err) {
        /* extension reloaded */
      }
    });
    btn.click();
  }

  // The OIDC callback (e.g. www.plus4u.net/oidc/callback) only hands the result back; leave it alone.
  if (/\/oidc\/callback\b/i.test(location.pathname)) return;
  if (isLoginPage()) runLoginPage();
  else if (window === window.top) runPortalPage();
})();
