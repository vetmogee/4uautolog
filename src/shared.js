// Shared helpers, loaded before content.js and by the popup.
/* global chrome */
var P4U = (function () {
  const DEFAULTS = {
    enabled: true,
    rememberCodes: false,
    lastMethod: null, // { kind: "access-codes" | "provider" | "button", label, selector, text }
    codes: null, // { code1, code2 } – only saved when rememberCodes is true
    googleAccount: null, // e-mail picked in Google's account chooser during a Plus4U sign-in
    pausedUntil: 0, // set after a manual logout so we do not log straight back in
    attempts: [] // timestamps of recent automatic attempts (loop guard)
  };

  const MAX_ATTEMPTS = 3;
  const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

  function get() {
    return new Promise((resolve) =>
      chrome.storage.local.get(DEFAULTS, (v) => resolve(v))
    );
  }

  function set(patch) {
    return new Promise((resolve) => chrome.storage.local.set(patch, resolve));
  }

  async function canAttempt() {
    const { attempts } = await get();
    const now = Date.now();
    return attempts.filter((t) => now - t < ATTEMPT_WINDOW_MS).length < MAX_ATTEMPTS;
  }

  async function recordAttempt() {
    const { attempts } = await get();
    const now = Date.now();
    const recent = attempts.filter((t) => now - t < ATTEMPT_WINDOW_MS);
    recent.push(now);
    await set({ attempts: recent });
  }

  function log(...args) {
    console.debug("[Plus4U Auto Login]", ...args);
  }

  return { DEFAULTS, get, set, canAttempt, recordAttempt, log };
})();
