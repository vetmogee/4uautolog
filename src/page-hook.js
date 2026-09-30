// Runs in the page's own JS world (MAIN) on *.plus4u.net portal pages.
// The portal's sign-in button opens the login page with window.open(). When the extension
// clicks it, Chrome's popup blocker stops that (a script click is not a user gesture), so
// report the blocked URL to content.js, which asks the background to open it instead.
(function () {
  "use strict";
  const open = window.open;
  window.open = function (url, ...rest) {
    const w = open.call(this, url, ...rest);
    if (!w && url) {
      try {
        window.postMessage({ source: "p4u-autologin", type: "popup-blocked", url: new URL(url, location.href).href }, location.origin);
      } catch (e) {
        /* invalid URL */
      }
    }
    return w;
  };
})();
