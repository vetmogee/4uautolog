/* global chrome */
// Shows a badge so you can see what the extension is doing.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "badge") {
    const tabId = sender.tab && sender.tab.id;
    chrome.action.setBadgeText({ text: msg.text || "", tabId });
    chrome.action.setBadgeBackgroundColor({ color: msg.color || "#1976d2", tabId });
  }
  if (msg && msg.type === "open-login" && sender.tab) openLogin(msg.url, sender.tab.id);
});

// The portal opens the login page in a popup, which Chrome blocks when the extension (not you)
// clicks the button. Open the same URL in a popup window instead. Once it has signed you in and
// returned to a Plus4U page that is not the login page, close it and reload the portal tab:
// the portal then picks up the new session by itself (silent OIDC sign-in).
const LOGIN_HOST = /^(oidc|uuidentity|identity|login)\./i;

async function openLogin(url, returnTabId) {
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return;
  }
  if (u.protocol !== "https:" || !/(^|\.)plus4u\.net$/i.test(u.hostname)) return;
  const win = await chrome.windows.create({ url: u.href, type: "popup", width: 520, height: 760 });
  await chrome.storage.session.set({ loginWindow: { windowId: win.id, returnTabId } });
}

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete" || !tab.url) return;
  const { loginWindow } = await chrome.storage.session.get("loginWindow");
  if (!loginWindow || tab.windowId !== loginWindow.windowId) return;
  let host;
  try {
    host = new URL(tab.url).hostname;
  } catch (e) {
    return;
  }
  if (!/(^|\.)plus4u\.net$/i.test(host) || LOGIN_HOST.test(host)) return;
  await chrome.storage.session.remove("loginWindow");
  chrome.windows.remove(loginWindow.windowId).catch(() => {});
  chrome.tabs.reload(loginWindow.returnTabId).catch(() => {});
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const { loginWindow } = await chrome.storage.session.get("loginWindow");
  if (loginWindow && loginWindow.windowId === windowId) chrome.storage.session.remove("loginWindow");
});
