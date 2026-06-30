// background.js — MV3 service worker
// - Installs a context menu "Clip to Kanban AI" (selection + page).
// - On context-menu click: stash { selectionText, pageUrl, pageTitle } into
//   chrome.storage.session under "pendingClip" and try to open the popup.
//   If chrome.action.openPopup() is unavailable (older Chrome), we set a
//   badge so the user knows to click the icon — the popup will read
//   pendingClip on next open.
// - Relays messages between content scripts and popup when needed.

const MENU_ID = "clip-to-kanban";
const BADGE_TEXT = "!";
const BADGE_COLOR = "#10b981";

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_ID,
        title: "Clip to Kanban AI",
        contexts: ["selection", "page"],
      });
    });
  } catch (e) {
    console.warn("[bg] context menu setup failed:", e);
  }
});

// Resolve a storage area that works across Chrome versions.
// chrome.storage.session requires MV3 + Chrome 102+. Fall back to local.
function sessionArea() {
  return chrome.storage.session || chrome.storage.local;
}

async function stashPendingClip(payload) {
  try {
    await sessionArea().set({ pendingClip: payload });
    await chrome.action.setBadgeText({ text: BADGE_TEXT });
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  } catch (e) {
    console.warn("[bg] failed to stash pendingClip:", e);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  const selectionText = (info.selectionText || "").trim();
  const pageUrl = info.pageUrl || (tab && tab.url) || "";
  const pageTitle = (tab && tab.title) || pageUrl || "Clipped page";

  await stashPendingClip({ selectionText, pageUrl, pageTitle, at: Date.now() });

  // Try to open the popup programmatically. Supported in Chrome 99+ when
  // the user has invoked the extension at least once in the session, but
  // may throw on some platforms. Wrap defensively.
  try {
    if (chrome.action.openPopup) {
      await chrome.action.openPopup();
    }
  } catch (e) {
    // Expected on many Chrome builds — the badge we set above nudges the
    // user to click the action icon, which reads pendingClip from storage.
    console.info("[bg] openPopup unavailable — user should click the icon:", e);
  }
});

// Clear the badge once the popup has consumed the pending clip.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "CLIP_CONSUMED") {
    Promise.all([
      chrome.action.setBadgeText({ text: "" }),
      sessionArea().remove("pendingClip"),
    ])
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true; // async
  }
  return false;
});
