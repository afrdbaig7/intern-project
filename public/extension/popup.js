// popup.js — Kanban AI Clipper popup logic.
//
// Flow:
//  1. Load appBase from chrome.storage.local (default http://localhost:3000).
//  2. Check chrome.storage.session for a pendingClip (set by background.js
//     when the user picked "Clip to Kanban AI" from the context menu). If
//     present, prefill the form and clear it.
//  3. Otherwise, query the active tab for the current selection or page info.
//  4. Load boards + users from the app. Populate selects. Remember the
//     last-used boardId / columnId / creatorId.
//  5. On submit, POST to ${appBase}/api/clip with credentials: "include".

(() => {
  "use strict";

  const DEFAULT_APP_BASE = "http://localhost:3000";
  const LS_KEYS = {
    appBase: "appBase",
    boardId: "lastBoardId",
    columnId: "lastColumnId",
    creatorId: "lastCreatorId",
  };

  // ─── DOM helpers ──────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const els = {
    settingsToggle: $("settingsToggle"),
    settings: $("settings"),
    appBase: $("appBase"),
    form: $("clipForm"),
    title: $("title"),
    description: $("description"),
    sourceUrl: $("sourceUrl"),
    boardId: $("boardId"),
    columnId: $("columnId"),
    creatorId: $("creatorId"),
    cancelBtn: $("cancelBtn"),
    submitBtn: $("submitBtn"),
    btnLabel: $("submitBtn").querySelector(".btn-label"),
    spinner: $("submitBtn").querySelector(".spinner"),
    status: $("status"),
    sourceLabel: $("sourceLabel"),
  };

  function sessionArea() {
    return chrome.storage.session || chrome.storage.local;
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (items) => resolve(items || {}));
    });
  }
  function storageSet(obj) {
    return new Promise((resolve) => {
      chrome.storage.local.set(obj, () => resolve());
    });
  }
  function sessionGet(keys) {
    return new Promise((resolve) => {
      try {
        sessionArea().get(keys, (items) => resolve(items || {}));
      } catch {
        resolve({});
      }
    });
  }
  function sessionRemove(key) {
    return new Promise((resolve) => {
      try {
        sessionArea().remove(key, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  // ─── Status / loading UI ──────────────────────────────────────────────
  function clearStatus() {
    els.status.className = "status hidden";
    els.status.innerHTML = "";
  }
  function showStatus(kind, html) {
    els.status.className = "status " + kind;
    els.status.innerHTML = html;
  }
  function setSubmitting(on) {
    els.submitBtn.disabled = on;
    els.spinner.classList.toggle("hidden", !on);
    els.btnLabel.textContent = on ? "Creating…" : "Create task";
  }

  // ─── Fetch helper with the configurable appBase ───────────────────────
  async function apiGet(appBase, path) {
    const res = await fetch(appBase.replace(/\/$/, "") + path, {
      method: "GET",
      credentials: "include",
      mode: "cors",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await safeJson(res);
      const msg = (body && body.error) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return safeJson(res);
  }

  async function apiPost(appBase, path, payload) {
    const res = await fetch(appBase.replace(/\/$/, "") + path, {
      method: "POST",
      credentials: "include",
      mode: "cors",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await safeJson(res);
    if (!res.ok) {
      const msg = (body && body.error) || `HTTP ${res.status}`;
      const e = new Error(msg);
      e.status = res.status;
      e.body = body;
      throw e;
    }
    return body;
  }

  async function safeJson(res) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  // ─── Active tab messaging ─────────────────────────────────────────────
  function getActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
        resolve(tabs && tabs[0]),
      );
    });
  }

  function sendToTab(tabId, msg) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, msg, (resp) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            error: chrome.runtime.lastError.message || "tab unreachable",
          });
        } else {
          resolve(resp || { ok: false, error: "no response" });
        }
      });
    });
  }

  // ─── Select population ────────────────────────────────────────────────
  function resetSelect(el, placeholder) {
    el.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function populateBoards(boards, lastBoardId) {
    if (!boards || boards.length === 0) {
      resetSelect(els.boardId, "No boards yet — create one in the app");
      resetSelect(els.columnId, "Pick a board first");
      return null;
    }
    els.boardId.innerHTML = boards
      .map(
        (b) =>
          `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`,
      )
      .join("");
    const chosen =
      boards.find((b) => b.id === lastBoardId) || boards[0];
    els.boardId.value = chosen.id;
    return chosen;
  }

  // Non-done columns first (sorted by order), then done columns last.
  function sortedColumns(board) {
    if (!board || !board.columns) return [];
    return [...board.columns].sort((a, b) => {
      if (!!a.isDone !== !!b.isDone) return a.isDone ? 1 : -1;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }

  function populateColumns(board, lastColumnId) {
    const cols = sortedColumns(board);
    if (!cols.length) {
      resetSelect(els.columnId, "Board has no columns");
      return null;
    }
    els.columnId.innerHTML = cols
      .map(
        (c) =>
          `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}${c.isDone ? " ✓" : ""}</option>`,
      )
      .join("");
    const chosen = cols.find((c) => c.id === lastColumnId) || cols[0];
    els.columnId.value = chosen.id;
    return chosen;
  }

  function populateUsers(users, lastCreatorId) {
    if (!users || users.length === 0) {
      resetSelect(els.creatorId, "No team members yet");
      return null;
    }
    els.creatorId.innerHTML = users
      .map(
        (u) =>
          `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`,
      )
      .join("");
    const chosen = users.find((u) => u.id === lastCreatorId) || users[0];
    els.creatorId.value = chosen.id;
    return chosen;
  }

  // ─── Prefill helpers ──────────────────────────────────────────────────
  function applySelectionPrefill({ selection, url, title }) {
    if (selection) {
      els.description.value = selection;
      const t = title || selection.slice(0, 60);
      els.title.value = t;
    } else {
      els.title.value = title || "";
    }
    if (url) els.sourceUrl.value = url;
    els.sourceLabel.textContent = `Source: ${shortUrl(url)}`;
  }

  function applyPagePrefill({ title, url, description }) {
    els.title.value = title || "";
    if (description) els.description.value = description;
    if (url) els.sourceUrl.value = url;
    els.sourceLabel.textContent = `Source: ${shortUrl(url)}`;
  }

  function applyPendingClip({ selectionText, pageUrl, pageTitle }) {
    els.title.value = pageTitle || pageUrl || "Clipped page";
    if (selectionText) els.description.value = selectionText;
    if (pageUrl) els.sourceUrl.value = pageUrl;
    els.sourceLabel.textContent = `Source: ${shortUrl(pageUrl)} (via right-click)`;
  }

  function shortUrl(url) {
    if (!url) return "—";
    try {
      const u = new URL(url);
      const path = u.pathname === "/" ? "" : u.pathname;
      return (u.host + path).slice(0, 48);
    } catch {
      return url.slice(0, 48);
    }
  }

  // ─── Main bootstrap ───────────────────────────────────────────────────
  async function main() {
    // Settings toggle
    els.settingsToggle.addEventListener("click", () => {
      els.settings.classList.toggle("hidden");
    });
    els.appBase.addEventListener("blur", async () => {
      const v = els.appBase.value.trim() || DEFAULT_APP_BASE;
      await storageSet({ [LS_KEYS.appBase]: v });
    });
    els.appBase.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        els.appBase.blur();
      }
    });

    // Cancel button → close popup
    els.cancelBtn.addEventListener("click", () => window.close());

    // Load saved appBase
    const stored = await storageGet([
      LS_KEYS.appBase,
      LS_KEYS.boardId,
      LS_KEYS.columnId,
      LS_KEYS.creatorId,
    ]);
    const appBase = (stored[LS_KEYS.appBase] || DEFAULT_APP_BASE).trim();
    els.appBase.value = appBase;

    // 1. Consume any pending clip from the context menu.
    const pending = await sessionGet({ pendingClip: null });
    if (pending && pending.pendingClip) {
      applyPendingClip(pending.pendingClip);
      await sessionRemove("pendingClip");
      try {
        chrome.runtime.sendMessage({ type: "CLIP_CONSUMED" }, () => {
          // Ignore response — lastError is fine if no listener.
          void chrome.runtime.lastError;
        });
      } catch {
        /* noop */
      }
    } else {
      // 2. Query the active tab for selection / page info.
      await prefillFromActiveTab();
    }

    // 3. Load boards + users in parallel.
    await Promise.all([
      loadBoards(appBase, stored[LS_KEYS.boardId], stored[LS_KEYS.columnId]),
      loadUsers(appBase, stored[LS_KEYS.creatorId]),
    ]).catch((e) => {
      showStatus(
        "error",
        `Could not reach the Kanban app at <code>${escapeHtml(appBase)}</code>. ${escapeHtml(
          e.message || "",
        )}<br/>Open settings (⚙) and verify the URL.`,
      );
    });

    // 4. Wire form submission.
    els.form.addEventListener("submit", onSubmit);

    // 5. Persist user choices on change.
    els.boardId.addEventListener("change", () => {
      const b = currentBoards.find((x) => x.id === els.boardId.value);
      populateColumns(b, null);
      storageSet({ [LS_KEYS.boardId]: els.boardId.value });
    });
    els.columnId.addEventListener("change", () => {
      storageSet({ [LS_KEYS.columnId]: els.columnId.value });
    });
    els.creatorId.addEventListener("change", () => {
      storageSet({ [LS_KEYS.creatorId]: els.creatorId.value });
    });
  }

  // Cache of boards from the last GET /api/boards call. BoardDTO[] includes
  // columns directly so we don't need a second fetch when the board changes.
  let currentBoards = [];

  async function loadBoards(appBase, lastBoardId, lastColumnId) {
    const boards = await apiGet(appBase, "/api/boards");
    currentBoards = Array.isArray(boards) ? boards : [];
    const chosen = populateBoards(currentBoards, lastBoardId);
    if (chosen) populateColumns(chosen, lastColumnId);
  }

  async function loadUsers(appBase, lastCreatorId) {
    const users = await apiGet(appBase, "/api/auth/users");
    populateUsers(Array.isArray(users) ? users : [], lastCreatorId);
  }

  async function prefillFromActiveTab() {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      els.sourceLabel.textContent = "No active tab.";
      return;
    }
    // chrome:// pages, Web Store, etc. can't receive content scripts.
    if (!/^https?:/.test(tab.url || "")) {
      els.sourceLabel.textContent = `Tab not clipable: ${shortUrl(tab.url)}`;
      els.title.value = tab.title || "";
      els.sourceUrl.value = tab.url || "";
      return;
    }
    const sel = await sendToTab(tab.id, { type: "GET_SELECTION" });
    if (sel && sel.ok && sel.selection) {
      applySelectionPrefill({
        selection: sel.selection,
        url: sel.url,
        title: sel.title,
      });
      return;
    }
    // No selection (or content script blocked) → fall back to page info.
    const info = await sendToTab(tab.id, { type: "GET_PAGE_INFO" });
    if (info && info.ok) {
      applyPagePrefill({
        title: info.title,
        url: info.url,
        description: info.description,
      });
    } else {
      // Content script unreachable — use the tab metadata we already have.
      els.title.value = tab.title || "";
      els.sourceUrl.value = tab.url || "";
      els.sourceLabel.textContent = `Source: ${shortUrl(tab.url)}`;
    }
  }

  // ─── Submit handler ───────────────────────────────────────────────────
  async function onSubmit(e) {
    e.preventDefault();
    clearStatus();

    const title = els.title.value.trim();
    const boardId = els.boardId.value;
    const columnId = els.columnId.value;
    const creatorId = els.creatorId.value || null;

    if (!title) {
      showStatus("error", "Title is required.");
      els.title.focus();
      return;
    }
    if (!boardId) {
      showStatus("error", "Pick a board first.");
      els.boardId.focus();
      return;
    }
    if (!columnId) {
      showStatus("error", "Pick a column for the new card.");
      els.columnId.focus();
      return;
    }

    const payload = {
      title,
      description: els.description.value.trim() || null,
      sourceUrl: els.sourceUrl.value.trim() || null,
      boardId,
      columnId,
      creatorId,
    };

    // Re-read appBase in case the user just changed it.
    const stored = await storageGet([LS_KEYS.appBase]);
    const appBase = (stored[LS_KEYS.appBase] || DEFAULT_APP_BASE).trim();

    setSubmitting(true);
    try {
      const card = await apiPost(appBase, "/api/clip", payload);
      // Persist the user's choices for next time.
      await storageSet({
        [LS_KEYS.boardId]: boardId,
        [LS_KEYS.columnId]: columnId,
        ...(creatorId ? { [LS_KEYS.creatorId]: creatorId } : {}),
      });
      const openUrl = appBase.replace(/\/$/, "") + "/";
      const cardId = card && card.id ? card.id : null;
      showStatus(
        "success",
        `<strong>Task created!</strong> It's on your board now.${
          cardId ? `<br/>Card ID: <code>${escapeHtml(cardId)}</code>` : ""
        }<br/><a href="${escapeHtml(openUrl)}" target="_blank" rel="noopener">Open board ↗</a>`,
      );
      els.form.reset();
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      const isNetwork =
        e instanceof TypeError ||
        /Failed to fetch|NetworkError|CORS/i.test(msg);
      const hint = isNetwork
        ? `<br/><span class="hint">Likely a CORS or network issue. Make sure the Kanban app is running at <code>${escapeHtml(
            appBase,
          )}</code> and allows cross-origin requests from this extension.</span>`
        : "";
      showStatus("error", `Failed to create task: ${escapeHtml(msg)}${hint}`);
    } finally {
      setSubmitting(false);
    }
  }

  document.addEventListener("DOMContentLoaded", main);
})();
