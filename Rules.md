# Engineering Rules & Guidelines — InterviewPad

This document defines the strict engineering constraints, architectural rules, and coding conventions for maintaining and expanding the **InterviewPad** codebase.

---

## 1. Core Architectural Constraints

### 1.1 Dual-Storage Abstraction Integrity
* **Rule**: ALL room storage operations (reads, writes, updates, user additions/removals, and message posts) **MUST** be performed via `backend/src/store/roomStore.js`.
* **Constraint**: Direct calls to `RoomModel` from Express routes (`routes/api.js`, `routes/auth.js`) or Socket.IO handlers (`server.js`) are **STRICTLY PROHIBITED**.
* **Rationale**: `roomStore.js` dynamically routes requests between MongoDB and the in-memory fallback store (`memoryRooms`) based on `isDBConnected()`. Bypassing this layer breaks offline/degraded mode.

### 1.2 Single Source of Truth for Live Code
* **Rule**: While a room is active, the **Yjs `Y.Doc` instance (`yjsDocs.get(roomId)`) is the authoritative source of truth for code state**.
* **Constraint**: 
  * Do NOT overwrite code in the active Yjs document using arbitrary database queries.
  * When code execution (`run-code`) is triggered, read the active code directly from `doc.getText("code").toString()`.
  * Periodic MongoDB snapshots execute every 10 seconds to sync Yjs text to MongoDB without blocking user typing.

### 1.3 Atomic Database Operations
* **Rule**: When MongoDB is connected, all mutation methods in `roomStore.js` MUST use atomic update operators (`$addToSet`, `$pull`, `$push`, `$inc`).
* **Rationale**: Prevents Time-of-Check to Time-of-Use (TOCTOU) race conditions when REST API calls (`POST /room/join`) and Socket.IO connection handlers (`join-room`) execute concurrently.

---

## 2. Frontend State & Binding Rules

### 2.1 Single Component Orchestration (`App.jsx`)
* **Rule**: Socket event listeners, Yjs binding lifecycles, and top-level room states are central to `App.jsx`.
* **Constraint**: Child components (`EditorPanel.jsx`, `Sidebar.jsx`, `ChatPanel.jsx`) MUST remain presentational/slot-based components receiving props and callbacks.
* **Binding Lifecycle Rule**: `setupMonacoBinding()` MUST only execute when **BOTH** conditions are met:
  1. Monaco Editor is fully mounted (`editorMounted === true` via `onEditorMount`).
  2. Yjs initial document sync is complete (`isSynced === true` via `yjs-sync-full`).

### 2.2 Local vs Remote Update Filtering
* **Rule**: Any observer attached to `Y.Doc` updates or `Awareness` updates MUST check origin tags:
  ```javascript
  obs = (update, origin) => {
    if (origin === "server-update") return; // Do not re-emit remote updates
    socket.emit("yjs-update", { roomId: rid, update: uint8ToBase64(update) });
  };
  ```
* **Rationale**: Prevents infinite update echo loops between client and server sockets.

---

## 3. Security & Environment Rules

### 3.1 CORS & Origin Safeguards
* **Rule**: `FRONTEND_ORIGIN` must be enforced across both Express app `cors()` middleware and Socket.IO `Server` CORS configuration in `server.js`.
* **Constraint**: Localhost dev origins (`http://localhost:*`) are permitted in non-production modes, but explicit allowed origin lists must be parsed cleanly via `isAllowedOrigin()`.

### 3.2 Authentication & Guest Permissibility
* **Rule**: The system MUST support guest execution. Socket connections do not force instant disconnect if `auth.token` is absent or invalid (`socket.data.authenticated = false`).
* **Constraint**: Host-only operations (e.g., editing interview questions via `question-change`) MUST verify host matching: `normalizedHost === normalizedUser`.

### 3.3 Execution Rate Limiting
* **Rule**: All REST code execution endpoints (`POST /api/code/run`) MUST pass through `codeRunLimiter` middleware.
* **Constraint**: Maximum 10 requests per 60-second window per IP.

---

## 4. Code Style & Formatting Guidelines

1. **Module System**: Standard Node.js ES Modules (`import/export`). Never use `require()` in backend src files (except legacy test `.cjs` scripts if necessary).
2. **Error Handling**: Socket events must capture errors within `try/catch` blocks and emit formatted error payloads (`socket.emit("error-message", error.message)`).
3. **Clean Disconnect Cleanup**: Disconnect timers (`GRACE_PERIOD_MS = 60_000`) must be tracked in `disconnectTimers: Map<graceKey, timeoutId>` to allow seamless re-joins on page refresh.
