/* global P4U */
// Runs on accounts.google.com, but only acts when the Google sign-in was started by Plus4U
// (redirect_uri points at *.plus4u.net, e.g. uuidentity.plus4u.net/.../authGoogle/callback).
//  - Remembers which account you pick in Google's account chooser (your real clicks only).
//  - Next time, picks that same account for you.
// Password, 2-step verification and consent screens are left to you.
(function () {
  "use strict";

  const FOR_PLUS4U = /redirect_uri=https:\/\/([a-z0-9-]+\.)*plus4u\.net\//i;
  const decoded = (() => {
    let u = location.href;
    for (let i = 0; i < 3; i++) {
      try {
        u = decodeURIComponent(u);
      } catch (e) {
        break;
      }
    }
    return u;
  })();
  if (!FOR_PLUS4U.test(decoded)) return;

  const RETRY_KEY = "p4uGoogleAccountPicked";
  const RETRY_MS = 2 * 60 * 1000;

  const isVisible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const norm = (s) => String(s || "").trim().toLowerCase();

  // Google's chooser marks each account row with data-identifier (older: data-email).
  // "Use another account" has neither, so it is never remembered or clicked.
  const accountOf = (el) => {
    const row = el && el.closest("[data-identifier], [data-email]");
    const id = row && norm(row.getAttribute("data-identifier") || row.getAttribute("data-email"));
    return id && id.includes("@") ? { row, id } : null;
  };

  function findAccountRow(email) {
    const rows = Array.from(document.querySelectorAll("[data-identifier], [data-email]")).filter(isVisible);
    return rows.find((r) => norm(r.getAttribute("data-identifier") || r.getAttribute("data-email")) === email) || null;
  }

  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted) return; // ignore our own automated clicks
      const acc = accountOf(e.target);
      if (!acc) return;
      P4U.set({ googleAccount: acc.id });
      P4U.log("Remembered Google account:", acc.id);
    },
    true
  );

  function waitFor(fn, timeout = 15000) {
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

  (async () => {
    const s = await P4U.get();
    if (!s.enabled || !s.googleAccount || !s.lastMethod || s.lastMethod.label !== "Google") return;
    // Pick at most once per couple of minutes in this window, so a chooser that keeps coming
    // back (e.g. the account was signed out of Chrome) does not loop.
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RETRY_KEY)) || 0;
    } catch (e) {
      /* storage blocked */
    }
    if (Date.now() - last < RETRY_MS) return P4U.log("Already picked the Google account once – leaving it to you.");

    const row = await waitFor(() => findAccountRow(norm(s.googleAccount)));
    if (!row) return P4U.log("Google account", s.googleAccount, "not in the chooser.");
    try {
      sessionStorage.setItem(RETRY_KEY, String(Date.now()));
    } catch (e) {
      /* storage blocked */
    }
    P4U.log("Choosing Google account", s.googleAccount);
    row.click();
  })();
})();
