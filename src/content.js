/* global chrome, P4U */
// Runs on every *.plus4u.net page (and frame).
//  - On portal pages: if a "Log in" button is visible you are signed out -> click it.
//  - On the login (OIDC) page: remember which method you use, and when the page
//    is opened automatically, replay the method you used last.
(function () {
  "use strict";

  const WAIT_MS = 15000;

  const LOGIN_TEXT = /^(přihlásit(\s+se)?|prihlásiť(\s+sa)?|log\s*-?\s*in|sign\s*-?\s*in)$/i;
  const LOGOUT_TEXT = /(odhlásit|odhlásiť|log\s*-?\s*out|sign\s*-?\s*out)/i;
  const SUBMIT_TEXT = /(přihlásit|prihlásiť|log\s*-?\s*in|sign\s*-?\s*in|continue|pokračovat|potvrdit|confirm|ok)/i;
  const ACCESS_CODES_TEXT = /(access\s*codes?|přístupov|prístupov)/i;
  const PROVIDERS = [
    ["Google", /google/i],
    ["Microsoft", /(microsoft|office\s*365|outlook|azure)/i],
    ["Apple", /apple/i],
    ["Facebook", /facebook/i],
    ["GitHub", /github/i],
    ["LinkedIn", /linkedin/i],
    ["Bank ID", /bank\s*id/i],
    ["Mobile app", /(uu\s*id|mobil|mobile|qr)/i]
  ];

  // ---------- DOM helpers ----------

  const isVisible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";

  const textOf = (el) =>
    (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("title") || "")
      .replace(/\s+/g, " ")
      .trim();

  const clickables = () =>
    Array.from(document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]')).filter(isVisible);

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

  // Plus4U signs you in with "Access code 1" + "Access code 2" (the second one is a password field).
  function findCodeInputs() {
    const pw = Array.from(document.querySelectorAll('input[type="password"]')).find(isVisible);
    if (!pw) return null;
    const scope = pw.form || pw.closest("div[class*='form'], section, main") || document;
    const inputs = Array.from(scope.querySelectorAll("input")).filter(
      (i) => isVisible(i) && /^(text|password|email|)$/i.test(i.type) && !i.readOnly && !i.disabled
    );
    if (inputs.length >= 2) return { code1: inputs[0], code2: inputs[1], scope };
    return { code1: null, code2: pw, scope };
  }

  function findSubmit(scope) {
    const root = scope || document;
    const typed = root.querySelector('button[type="submit"], input[type="submit"]');
    if (typed && isVisible(typed)) return typed;
    return (
      Array.from(root.querySelectorAll('button, [role="button"], input[type="button"]'))
        .filter(isVisible)
        .find((b) => SUBMIT_TEXT.test(textOf(b))) || null
    );
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
        if (f && f.scope.contains(el) && f.code2.value) return rememberCodesSubmit();
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
    let f = await waitFor(() => {
      const r = findCodeInputs();
      return r && r.code2 ? r : null;
    }, 4000);
    if (!f) {
      // The codes form may be behind an "Access codes" tab/button.
      const tab = clickables().find((el) => ACCESS_CODES_TEXT.test(textOf(el)));
      if (tab) tab.click();
      f = await waitFor(() => {
        const r = findCodeInputs();
        return r && r.code2 ? r : null;
      });
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

  function findLoginButton() {
    return clickables().find((el) => LOGIN_TEXT.test(textOf(el))) || null;
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

    const btn = await waitFor(findLoginButton);
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
    btn.click();
  }

  if (isLoginPage()) runLoginPage();
  else if (window === window.top) runPortalPage();
})();
