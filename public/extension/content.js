// content.js — runs on every page at document_idle.
// Listens for messages from the popup and returns the current selection
// or page metadata. All handlers are defensive — some pages block content
// scripts and any single throw should not break the listener.

function safeMetaDescription() {
  try {
    const meta =
      document.querySelector('meta[name="description"]') ||
      document.querySelector('meta[property="og:description"]');
    return (meta && meta.content) || "";
  } catch {
    return "";
  }
}

function getSelection() {
  try {
    return (window.getSelection && window.getSelection().toString().trim()) || "";
  } catch {
    return "";
  }
}

function getPageInfo() {
  return {
    title: document.title || location.href,
    url: location.href,
    description: safeMetaDescription(),
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  try {
    if (!msg || typeof msg.type !== "string") {
      sendResponse({ ok: false, error: "bad message" });
      return false;
    }
    if (msg.type === "GET_SELECTION") {
      const sel = getSelection();
      sendResponse({
        ok: true,
        selection: sel,
        url: location.href,
        title: document.title || location.href,
      });
      return false;
    }
    if (msg.type === "GET_PAGE_INFO") {
      sendResponse({ ok: true, ...getPageInfo() });
      return false;
    }
    sendResponse({ ok: false, error: "unknown type: " + msg.type });
    return false;
  } catch (e) {
    sendResponse({ ok: false, error: String(e && e.message || e) });
    return false;
  }
});
