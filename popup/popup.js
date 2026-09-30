/* global chrome, P4U */
const $ = (id) => document.getElementById(id);

async function render() {
  const s = await P4U.get();
  $("enabled").checked = s.enabled;
  $("rememberCodes").checked = s.rememberCodes;
  $("method").textContent = s.lastMethod ? s.lastMethod.label : "none yet";
  const status = [];
  if (!s.lastMethod) status.push("Log in once manually so the extension can learn your method.");
  if (s.lastMethod && s.lastMethod.kind === "access-codes" && !s.codes) status.push("Access codes not saved – you'll be asked to type them.");
  if (!(await P4U.canAttempt())) status.push("Paused: too many attempts in the last 5 minutes.");
  if (s.pausedUntil > Date.now()) status.push("Paused after manual logout.");
  $("status").textContent = status.join(" ");
}

$("enabled").addEventListener("change", (e) => P4U.set({ enabled: e.target.checked, attempts: [], pausedUntil: 0 }).then(render));
$("rememberCodes").addEventListener("change", (e) => {
  const patch = { rememberCodes: e.target.checked };
  if (!e.target.checked) patch.codes = null;
  P4U.set(patch).then(render);
});
$("forget").addEventListener("click", () => P4U.set({ lastMethod: null, codes: null, attempts: [] }).then(render));
$("open").addEventListener("click", () => chrome.tabs.create({ url: "https://plus4u.net/" }));

render();
