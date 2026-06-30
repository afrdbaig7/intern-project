# Kanban AI Clipper — Chrome Extension (Manifest V3)

A loadable dev extension that clips any webpage or selected text into a Kanban AI
board task. Posts to the running Kanban AI app's `/api/clip` endpoint, which then
broadcasts the new card over Socket.IO so the board updates in real time.

## Files

```
public/extension/
├── manifest.json      MV3 manifest
├── background.js      service worker — context menu + pendingClip stash
├── content.js         active-tab selection + page-info grabber
├── popup.html         380px-wide popup UI
├── popup.css          dark-theme styling (matches the web app)
├── popup.js           popup logic — fetches boards/users, POSTs /api/clip
├── README.md          this file
└── icons/
    ├── generate.js    regenerates the PNGs (bun/node + sharp)
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

The extension lives under `public/extension/` so Next.js serves it at
`/extension/...`. To get the files onto disk for loading into Chrome, either
load the folder directly from your checkout, or download from the dev server.

## Load it in Chrome

1. Run the Kanban AI app (`bun run dev` → http://localhost:3000).
2. Open `chrome://extensions`.
3. Toggle **Developer mode** (top-right).
4. Click **Load unpacked**.
5. Select this `public/extension/` folder.
6. The Kanban AI icon (emerald square with a white K) appears in your toolbar.
   Pin it for easy access.

## Set the app URL (settings)

The popup runs in the `chrome-extension://` origin, so it cannot use relative
URLs. By default it points at `http://localhost:3000`. To point it at a deployed
instance (Railway / Vercel / your own host):

1. Click the extension icon to open the popup.
2. Click the ⚙ gear in the top-right.
3. Paste your Kanban AI URL (e.g. `https://kanban.example.com`).
4. Click outside the field (or press Enter). The value is saved to
   `chrome.storage.local` and used for all subsequent API calls.

## How to clip

There are two ways:

- **Whole page**: Click the toolbar icon. Title is the page `<title>`, the
  description is the page's meta description, and the source URL is the page
  URL. Edit any field, pick a board + column + creator, then **Create task**.
- **Selection**: Select some text on any page, then either click the toolbar
  icon (the selected text becomes the description) or right-click and pick
  **Clip to Kanban AI** (the context-menu path opens the popup pre-filled
  with the selection).

In all cases the new card lands at the bottom of the chosen column and the
board updates in real time (via the Socket.IO service).

## What the popup remembers

Last-used **board**, **column**, and **clip-as** creator are persisted to
`chrome.storage.local` and re-selected on the next open. The app URL is also
remembered there.

## CORS note

The popup calls the Kanban AI app cross-origin (`chrome-extension://<id>` →
`http://localhost:3000`). The `/api/clip`, `/api/boards`, and `/api/auth/users`
endpoints must respond with `Access-Control-Allow-Origin` reflecting the
request's `Origin` header (or `*`), and `Access-Control-Allow-Credentials: true`
because the popup sends `credentials: "include"`. If the popup shows a CORS /
network error, check the app's response headers.

## Regenerate the icons

```bash
bun public/extension/icons/generate.js
# or
node public/extension/icons/generate.js
```

Re-runs `sharp` over the embedded SVG and writes `icon16/48/128.png` next to
the script.

## Troubleshooting

- **Popup says "Could not reach the Kanban app…"** — make sure the app is
  running and the settings URL is correct.
- **Context menu doesn't appear** — reload the extension on
  `chrome://extensions` (the menu is created on `onInstalled`).
- **Nothing happens on `chrome://` pages or the Web Store** — content scripts
  can't run there. The popup falls back to the tab's title + URL.
- **`openPopup()` doesn't fire after right-clicking** — Chrome only allows
  programmatic popup-open in certain contexts. If it doesn't fire, the
  extension sets a "!" badge on its icon — just click the icon to open the
  popup and the pending clip will load.
