# Plus4U Auto Login (Unicorn University)

A Chrome extension (Manifest V3) that keeps you signed in to the **Plus4U** portal used by Unicorn University.

On every `*.plus4u.net` page it:

1. **Checks whether you are signed in.** When you are signed out, plus4u.net and uuApps show an icon-only sign-in button in the top bar (the `plus4u5-app-button-not-authenticated` button, whose aria-label is just *Navigační tlačítko*). If the extension sees it, or a text button such as *Přihlásit se / Prihlásiť sa / Log in / Sign in / Đăng nhập*, it clicks it.
2. **Signs you in with the method you used last**, on the Plus4U login page:
   `https://uuidentity.plus4u.net/uu-identitymanagement-maing01/a9b105aff2744771be4daa8361954677/login?…`
   - **+4U Access (access codes):** clicks *Continue with +4U Access*, fills *Access code 1* and *Access code 2* (`accessCode1` / `accessCode2`), and clicks *Sign in*. The codes are only saved if you turn on *Remember access codes* in the popup.
   - **Google / Microsoft / Facebook / Apple:** clicks the same *Continue with …* button again. If you are already signed in to that provider in Chrome, it finishes without any input from you.

The extension learns your method by watching your own (real) clicks on the login page, so **sign in manually once** after you install it.

### Why a login window opens

The portal opens the login page in a popup. Chrome blocks popups that a script (rather than you) triggers, so the extension notices the blocked popup and opens the same login page in its own small window. When the login finishes and returns to Plus4U, the extension closes that window and reloads your tab, and the portal picks up the new session.

## Install

1. Download or clone this repo.
2. Open `chrome://extensions`, then turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Click the extension icon. If you sign in with access codes, turn on *Remember access codes*.
5. Go to https://plus4u.net/ and sign in once as usual.

## Languages

Buttons are matched in **Czech, Slovak, English and Vietnamese**, case-insensitively, with Unicode NFC normalisation so Vietnamese diacritics match however they are encoded.

The login page follows your **browser language**, not the `uiLocales` URL parameter (the OIDC redirect drops it). It offers cs, sk, en, uk, es, it, de and ro but **no Vietnamese**, so a Vietnamese browser gets the English login page. plus4u.net itself opens in Czech. Where the pages have stable attributes, the extension uses them instead of text (`accessCode1`/`accessCode2`, the `plus4u5-app-button-not-authenticated` class), so the Ukrainian, Spanish, Italian, German and Romanian login pages should work for access codes too. The Vietnamese labels are there in case Plus4U adds a Vietnamese UI.

## Safety features

- **Loop guard:** after 3 automatic attempts in 5 minutes it stops and shows a red `!` badge (for example, when your codes have changed).
- **Manual logout:** after you click *Odhlásit / Log out / Đăng xuất* yourself, auto login pauses for 10 minutes.
- It never clicks *Forgot your access codes?* or the e-mail *Sign in* button.
- Only the extension's own automated clicks are ignored when it learns your method. It learns only from real clicks.
- The popup lets you turn the extension off and forget the saved method and codes.

**About saved access codes:** they are stored **unencrypted** in `chrome.storage.local`, in your Chrome profile. Anyone with access to your profile could read them. If that is a concern, leave *Remember access codes* off. The extension will then open the *+4U Access* form and focus it, so you can type the codes or let Chrome's password manager fill them. Google and Microsoft sign-in never need stored secrets.

## Limitations

- **reCAPTCHA:** the login page loads Google reCAPTCHA (the invisible badge). When tested, submitting access codes sent no reCAPTCHA token and triggered no challenge. If Plus4U or Google starts showing a reCAPTCHA challenge, you have to solve it yourself: the extension does not try to get around it and just stops.
- **Two-factor / higher assurance:** the login is requested with `acrValues=standard high veryHigh`. If your account asks for a second factor or extra confirmation after the codes, you have to complete that step yourself.
- **E-mail sign-in:** the *e-mail → Sign in* path isn't learned or replayed. Use +4U Access or a provider button.
- **Providers:** after the extension clicks Google, Microsoft and so on, the rest happens on the provider's site. It is automatic only if you are already signed in there and don't need to pick an account.

## Badge

| Badge | Meaning |
|---|---|
| `…` | Signing in |
| `?` | Access codes needed (not saved) |
| `!` | Paused: too many attempts |

## Development

```
npm install
npm test   # loads the extension in Chromium against mocked Plus4U pages (cs-CZ and vi-VN)
```

The mocks in `tests/e2e.mjs` mirror the real DOM of plus4u.net and the uuidentity login page. The test keeps Chrome's popup blocker on, like a normal profile. If something stops working, open DevTools and look for `[Plus4U Auto Login]` messages in the console.
