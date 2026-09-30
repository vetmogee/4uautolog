# Plus4U Auto Login (Unicorn University)

A Chrome extension (Manifest V3) that keeps you signed in to the **Plus4U** portal used by Unicorn University.

On every `*.plus4u.net` page it:

1. **Checks whether you are signed in.** If the portal shows a *Přihlásit se / Log in / Sign in* button, you are signed out, so the extension clicks it.
2. **Signs you in with the method you used last.** On the Plus4U login (OIDC) page it replays the method it saw you use most recently:
   - **Access codes** (Access code 1 + Access code 2): fills both codes and submits. The codes are only saved if you turn on *Remember access codes* in the popup.
   - **Google / Microsoft / Apple / Facebook / GitHub / LinkedIn / Bank ID / mobile app**: clicks the same button again. If you are already signed in to that provider in Chrome, it finishes without any input from you.

The extension learns your method by watching your own (real) clicks on the login page, so **sign in manually once** after you install it.

## Install

1. Download or clone this repo.
2. Open `chrome://extensions`, then turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Click the extension icon. If you sign in with access codes, turn on *Remember access codes*.
5. Go to https://plus4u.net/ and sign in once as usual.

## Safety features

- **Loop guard:** after 3 automatic attempts in 5 minutes it stops and shows a red `!` badge (for example, when your codes have changed).
- **Manual logout:** after you click *Odhlásit / Log out* yourself, auto login pauses for 10 minutes.
- Only the extension's own automated clicks are ignored when it learns your method. It learns only from real clicks.
- The popup lets you turn the extension off and forget the saved method and codes.

**About saved access codes:** they are stored **unencrypted** in `chrome.storage.local`, in your Chrome profile. Anyone with access to your profile could read them. If that is a concern, leave *Remember access codes* off. The extension will then open the form and focus it, so you can type the codes or let Chrome's password manager fill them. Google and Microsoft sign-in never need stored secrets.

## Badge

| Badge | Meaning |
|---|---|
| `…` | Signing in |
| `?` | Access codes needed (not saved) |
| `!` | Paused: too many attempts |

## Development

```
npm install
npm test   # loads the extension in Chromium against mocked Plus4U pages
```

Plus4U's markup can change. Buttons and fields are found by visible text (Czech, Slovak, and English), `id`/`name`, and input type, not by fixed CSS classes. If something stops working, open DevTools and look for `[Plus4U Auto Login]` messages in the console.
