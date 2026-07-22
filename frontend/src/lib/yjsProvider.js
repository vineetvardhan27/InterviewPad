import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate as applyAwareness } from "y-protocols/awareness";
import { socket } from "./socket";

let doc = null;    // Y.Doc for the current room
let rid = null;    // current room id
let obs = null;    // Y.Doc update observer
let awareness = null; // Awareness instance for the room

const CURSOR_COLORS = [
  "#e06c75", "#61afef", "#98c379", "#c678dd", "#e5c07b",
  "#56b6c2", "#be5046", "#d19a66", "#7ec699", "#c792ea"
];

function getRandomColor() {
  return CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
}

/**
 * Initialize (or re-initialize) the Yjs document for a room.
 */
export function initYDoc(roomId, seedCode = "", username = "Guest") {
  // If switching rooms, destroy old doc
  if (doc && rid !== roomId) {
    destroyYDoc();
  }

  if (!doc) {
    doc = new Y.Doc();
    rid = roomId;
    window.yjsDoc = doc;
    window.yjsText = doc.getText("code");

    // Listen for local updates → send to server
    obs = (update, origin) => {
      // Only send updates that originated locally (not from remote)
      if (origin === "server-update") return;
      // DEBUG - remove after fix [Step 3: local edit emitted]
      console.log("[DEBUG Step 3] Local edit captured by Y.Doc observer. Emitting yjs-update to roomId:", rid, "updateLen:", update.length);
      const b64 = uint8ToBase64(update);
      socket.emit("yjs-update", { roomId: rid, update: b64 });
    };
    doc.on("update", obs);

    // Setup awareness
    awareness = new Awareness(doc);
    const initialName = (username && username.trim()) ? username.trim() : "Guest";
    awareness.setLocalStateField("user", { name: initialName, color: getRandomColor() });

    awareness.on("update", ({ added, updated, removed }, origin) => {
      if (origin === "server-update") return;
      const changedClients = added.concat(updated).concat(removed);
      const update = encodeAwarenessUpdate(awareness, changedClients);
      const b64 = uint8ToBase64(update);
      socket.emit("yjs-awareness", { roomId: rid, update: b64 });
    });

  } else if (awareness) {
    // If doc already exists, just update the username if it changed
    setAwarenessUser(username);
  }

  window.yjsDoc = doc;
  window.yjsText = doc ? doc.getText("code") : null;
  return doc;
}

/**
 * Update local awareness state with the current user's identity
 */
export function setAwarenessUser(username, role = "candidate", color = null, userId = null) {
  if (!awareness) return;
  const current = awareness.getLocalState()?.user || {};
  const newName = (username && username.trim()) ? username.trim() : "Guest";
  const newColor = color || current.color || getRandomColor();
  const newRole = role || current.role || "candidate";
  const newId = userId || current.id || (socket && socket.id ? socket.id : `user-${Math.random().toString(36).slice(2)}`);

  if (
    current.name !== newName ||
    current.color !== newColor ||
    current.role !== newRole ||
    current.id !== newId
  ) {
    awareness.setLocalStateField("user", {
      ...current,
      name: newName,
      role: newRole,
      color: newColor,
      id: newId
    });
    broadcastAwareness();
  }
}

/**
 * Broadcast local awareness state to all remote clients in the room
 */
export function broadcastAwareness() {
  if (!awareness || !rid) return;
  const update = encodeAwarenessUpdate(awareness, [awareness.clientID]);
  const b64 = uint8ToBase64(update);
  socket.emit("yjs-awareness", { roomId: rid, update: b64 });
}

/**
 * Apply a full state sync from the server.
 */
export function applyFullSync(b64Update) {
  try {
    if (!doc || !b64Update) return;
    const str = typeof b64Update === "string" ? b64Update : b64Update.update;
    if (!str) return;
    const buf = base64ToUint8(str);
    Y.applyUpdate(doc, buf, "server-update");
  } catch (e) {
    console.error("[applyFullSync error]", e);
  }
}

/**
 * Apply an incremental update from a remote peer.
 */
export function applyRemoteUpdate(b64Update) {
  try {
    if (!doc || !b64Update) {
      console.log("[DEBUG applyRemoteUpdate] Error: doc or b64Update missing", { docExists: !!doc, b64Update });
      return;
    }
    const str = typeof b64Update === "string" ? b64Update : b64Update.update;
    if (!str) return;
    const buf = base64ToUint8(str);
    const beforeText = doc.getText("code").toString();
    Y.applyUpdate(doc, buf, "server-update");
    const afterText = doc.getText("code").toString();
    console.log(`[DEBUG applyRemoteUpdate] Applied update. UpdateBufLen: ${buf.length}. Before text len: ${beforeText.length}, After text len: ${afterText.length}`);
  } catch (e) {
    console.error("[applyRemoteUpdate error]", e);
  }
}

export function applyAwarenessUpdate(b64Update) {
  if (!awareness) return;
  const buf = base64ToUint8(b64Update);
  applyAwareness(awareness, buf, "server-update");
}

/**
 * Request a full re-sync from the server (e.g. on reconnect).
 */
export function requestResync() {
  if (!rid) return;
  socket.emit("yjs-sync-request", { roomId: rid });
}

/**
 * Get the Y.Text object for code binding.
 */
export function getYText() {
  if (!doc) return null;
  return doc.getText("code");
}

/**
 * Get the Y.Doc instance.
 */
export function getYDoc() {
  return doc;
}

export function getAwareness() {
  return awareness;
}

/**
 * Get the current code as a plain string.
 */
export function getCode() {
  if (!doc) return "";
  return doc.getText("code").toString();
}

/**
 * Destroy the Yjs document and clean up listeners.
 */
export function destroyYDoc() {
  if (doc) {
    if (obs) doc.off("update", obs);
    if (awareness) {
      awareness.destroy();
    }
    doc.destroy();
    doc = null;
    obs = null;
    rid = null;
    awareness = null;
  }
}

/* ---- Base64 ↔ Uint8Array helpers ---- */
function uint8ToBase64(uint8) {
  let s = "";
  for (let i = 0; i < uint8.length; i++) {
    s += String.fromCharCode(uint8[i]);
  }
  return btoa(s);
}

function base64ToUint8(b64) {
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}
