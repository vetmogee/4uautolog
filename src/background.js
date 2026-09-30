/* global chrome */
// Shows a badge so you can see what the extension is doing.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "badge") {
    const tabId = sender.tab && sender.tab.id;
    chrome.action.setBadgeText({ text: msg.text || "", tabId });
    chrome.action.setBadgeBackgroundColor({ color: msg.color || "#1976d2", tabId });
  }
});
