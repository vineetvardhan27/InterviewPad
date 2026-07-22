# Persistent Memory & Knowledge Items — InterviewPad

This document tracks critical developer context, system gotchas, architectural patterns, and runtime constraints discovered during codebase development and auditing.

---

## 1. Critical Architectural Knowledge Items

### KI-01: Dual-Storage Abstraction Pattern
* **Location**: `backend/src/store/roomStore.js`
* **Gotcha**: Never invoke Mongoose `RoomModel` directly in Express routes or Socket.IO handlers.
* **Mechanism**: Every exported function in `roomStore.js` checks `isDBConnected()`. If MongoDB is connected, it uses Mongoose queries. If MongoDB is offline, it reads/writes to `memoryRooms: Map<roomId, roomObject>`.
* **Implication**: Any new room attributes added to MongoDB schema (`Room.js`) MUST also be initialized in `roomStore.js` memory fallback methods (`createRoom`, `memToClient`).

### KI-02: Yjs Live Document Supremacy & Snapshot Pattern
* **Location**: `backend/src/server.js` (`yjsDocs` Map) and `frontend/src/lib/yjsProvider.js`
* **Gotcha**: Database queries do NOT track live keystrokes. While a room is active, `yjsDocs.get(roomId)` holds the authoritative code state.
* **Snapshot Cycle**:
  1. A periodic `setInterval` in `server.js` flushes Yjs code to MongoDB every 10 seconds.
  2. When all room participants disconnect and the 60-second grace window expires, the Yjs document is snapshotted to MongoDB one last time, and then destroyed (`destroyYDoc(roomId)`).

### KI-03: Monaco Binding Timing Requirement
* **Location**: `frontend/src/App.jsx` (`setupMonacoBinding()`)
* **Gotcha**: Creating `MonacoBinding` before Monaco Editor mounts OR before Yjs receives initial sync results in blank editors or frozen text buffers.
* **Rule**: `setupMonacoBinding()` requires `isSynced === true` (triggered by `yjs-sync-full` socket event) AND `editorMounted === true` (triggered by `onEditorMount` callback from Monaco Editor).

---

## 2. Network & Runtime Gotchas

### KI-04: Graceful Disconnect Window
* **Location**: `backend/src/server.js` (`GRACE_PERIOD_MS = 60_000`)
* **Behavior**: When a user closes their browser or refreshes the page, their socket disconnects. Instead of immediately deleting the user from the room, `server.js` starts a 60-second timer (`disconnectTimers.set(graceKey, timer)`).
* **Reconnect**: If the user re-joins within 60 seconds (`join-room`), the timer is cleared (`clearTimeout`), the room is notified via `user-reconnected`, and the session continues smoothly.

### KI-05: Judge0 Polling Ceiling
* **Location**: `backend/src/services/judge0.js` (`runCode`)
* **Behavior**: Code submission uses an asynchronous polling model:
  * Maximum loop attempts: **20 attempts**
  * Delay between attempts: **250ms**
  * Maximum execution timeout: **5.0 seconds** (`20 * 250ms`).
* **Implication**: Code that runs longer than 5 seconds will throw an explicit timeout error (`"Execution timed out while waiting for Judge0 result"`).

### KI-06: In-Memory Chat Cap
* **Location**: `backend/src/store/roomStore.js` (`addChatMessage`)
* **Behavior**: In MongoDB mode, chat history is unbounded. In memory fallback mode, `room.messages` is capped at the **last 200 messages** (`room.messages.slice(-200)`) to prevent node memory leaks during prolonged sessions.

---

## 3. Quick Reference File Map

| Task Domain | Primary Target Files |
|---|---|
| **Socket Events & Disconnects** | [server.js](file:///c:/Users/VINEET%20VARDHAN/Desktop/InterviewPad/backend/src/server.js) |
| **Yjs Client Provider & CRDT** | [yjsProvider.js](file:///c:/Users/VINEET%20VARDHAN/Desktop/InterviewPad/frontend/src/lib/yjsProvider.js) |
| **Frontend State & UI Orchestrator** | [App.jsx](file:///c:/Users/VINEET%20VARDHAN/Desktop/InterviewPad/frontend/src/App.jsx) |
| **Dual Storage Layer** | [roomStore.js](file:///c:/Users/VINEET%20VARDHAN/Desktop/InterviewPad/backend/src/store/roomStore.js) |
| **Judge0 Code Runner** | [judge0.js](file:///c:/Users/VINEET%20VARDHAN/Desktop/InterviewPad/backend/src/services/judge0.js) |
| **Language Registry** | [languages.js](file:///c:/Users/VINEET%20VARDHAN/Desktop/InterviewPad/backend/src/config/languages.js) |
| **Monaco Component & Layout** | [EditorPanel.jsx](file:///c:/Users/VINEET%20VARDHAN/Desktop/InterviewPad/frontend/src/components/EditorPanel.jsx) |
