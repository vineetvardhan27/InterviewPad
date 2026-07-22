# InterviewPad — Project Overview

> **Purpose of this document**: Provide a complete technical reference so that any AI agent (or developer) can understand the project's architecture, data flow, and every file's role without reading the source code.

---

## 1. What Is This Project?

**InterviewPad** is a real-time collaborative coding platform designed for technical interviews. An **interviewer** creates a room, pastes a coding question, and shares an invite link. A **candidate** joins the room and solves the problem live in a shared Monaco code editor. Both participants see each other's cursors, can chat in real-time, and the candidate can execute code against Judge0.

---

## 2. Tech Stack

| Layer | Technology | Version / Notes |
|---|---|---|
| **Frontend framework** | React 18 | Single-page app, no router |
| **Build tool** | Vite 6 | Dev server on `localhost:5173` |
| **Code editor** | Monaco Editor (`@monaco-editor/react` v4.6) | Same engine as VS Code |
| **Real-time (client)** | `socket.io-client` v4.8 | WebSocket transport only |
| **HTTP client** | Axios v1.8 | For REST calls |
| **Backend runtime** | Node.js (ES Modules) | `"type": "module"` in package.json |
| **HTTP framework** | Express v4.21 | JSON body parser, CORS |
| **Real-time (server)** | Socket.io v4.8 | Attached to the HTTP server |
| **Database** | MongoDB via Mongoose v9.6 | Optional — falls back to in-memory `Map` |
| **Authentication** | JWT (`jsonwebtoken` v9) + bcryptjs v3 | 7-day token expiry |
| **Code execution** | Judge0 CE API | Polling-based submission model |
| **Monorepo** | npm workspaces | Root `package.json` defines `["frontend", "backend"]` |
| **Deployment** | Netlify (frontend) + Render (backend) | `Procfile` included |

---

## 3. Monorepo Structure

```
Coding_Place/                    ← Root (npm workspace)
├── package.json                 ← Workspace config, concurrently scripts
├── Procfile                     ← Render deployment: `web: npm run start --workspace backend`
├── README.md                    ← Setup & deployment docs
├── scripts/                     ← (empty, reserved)
│
├── backend/
│   ├── package.json             ← Backend deps, `node --watch src/server.js`
│   ├── .env / .env.example      ← Environment variables
│   └── src/
│       ├── server.js            ← ★ Entry point: Express + Socket.io + all event handlers
│       ├── config/
│       │   ├── db.js            ← MongoDB connection with graceful fallback
│       │   └── languages.js     ← Supported language registry (cpp, java, python)
│       ├── models/
│       │   ├── User.js          ← Mongoose User schema (username, email, passwordHash)
│       │   ├── Room.js          ← Mongoose Room schema (code, language, users, messages)
│       │   └── Problem.js       ← Mongoose Problem schema (placeholder, not used)
│       ├── routes/
│       │   ├── auth.js          ← POST /register, /login, GET /me
│       │   └── api.js           ← POST /room/create, /room/join, /room/reset, /room/question, /code/run
│       ├── middleware/
│       │   ├── auth.js          ← JWT sign/verify, requireAuth, optionalAuth middleware
│       │   └── rateLimit.js     ← In-memory sliding-window rate limiter
│       ├── services/
│       │   └── judge0.js        ← Judge0 API integration (submit + poll)
│       ├── store/
│       │   └── roomStore.js     ← ★ Dual-storage abstraction (MongoDB or in-memory Map)
│       └── data/                ← (empty, reserved)
│
└── frontend/
    ├── package.json             ← Frontend deps, Vite scripts
    ├── vite.config.js           ← Minimal: `plugins: [react()]`
    ├── index.html               ← SPA entry
    └── src/
        ├── main.jsx             ← ReactDOM render
        ├── App.jsx              ← ★ Entire UI in one component (auth, room, editor, chat)
        ├── styles.css           ← All CSS (~20KB, supports light/dark themes)
        ├── constants/
        │   └── languages.js     ← `[{ key: "cpp", label: "C++" }, ...]`
        └── lib/
            └── socket.js        ← Socket.io client init, API_BASE_URL, auth helpers
```

---

## 4. Environment Variables

Defined in `backend/.env` (see `.env.example`):

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default `4000`) |
| `FRONTEND_ORIGIN` | Yes | Comma-separated allowed CORS origins |
| `JUDGE0_URL` | Yes | Judge0 API base URL (e.g. `https://ce.judge0.com`) |
| `JUDGE0_API_KEY` | No | RapidAPI key for Judge0 (sent as `x-rapidapi-key` header) |
| `MONGO_URI` | No | MongoDB connection string. If unset, falls back to in-memory storage |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens |

Frontend env (set at build time):

| Variable | Description |
|---|---|
| `VITE_BACKEND_URL` | Backend URL (default `http://localhost:4000`). No trailing slash. |

---

## 5. Backend — File-by-File Deep Dive

### 5.1 `server.js` — Entry Point (363 lines)

**Responsibilities:**
1. Loads env vars, creates Express app + HTTP server + Socket.io server
2. Configures CORS (dynamic origin check against `FRONTEND_ORIGIN`)
3. Mounts routes: `/api/auth` → `authRouter`, `/api` → `apiRouter`
4. Serves frontend static build in production (`frontend/dist/`)
5. Health check endpoint: `GET /health` → `{ status: "ok", rooms: <count> }`
6. **All Socket.io event handlers** (see Section 7)

**Key in-memory data structures:**
- `socketMeta: Map<socketId, { roomId, username }>` — tracks which room each socket belongs to for disconnect cleanup
- `cursorPositions: Map<roomId, Map<username, { line, column, color }>>` — tracks cursor positions per room
- `CURSOR_COLORS` — 10-color palette for remote cursors, assigned round-robin

**`emitRoomState(target, room)`** — helper that sends the full room state object to a socket or room.

### 5.2 `config/db.js` — Database Connection

- `connectDB()`: Attempts MongoDB connection with 5s timeout. Returns `true`/`false`. On failure, logs warning and continues (in-memory mode).
- `isDBConnected()`: Returns boolean. Used by `roomStore.js` to decide storage backend at runtime.

### 5.3 `config/languages.js` — Language Registry

```js
SUPPORTED_LANGUAGES = {
  cpp:    { label: "C++",    judge0Id: 54 },
  java:   { label: "Java",   judge0Id: 62 },
  python: { label: "Python", judge0Id: 71 }
}
DEFAULT_LANGUAGE = "cpp"
```

Exports: `normalizeLanguage(lang)` (maps `"c++"` → `"cpp"`), `isLanguageSupported(lang)`.

### 5.4 `models/User.js` — User Schema

| Field | Type | Notes |
|---|---|---|
| `username` | String | Unique, 2-30 chars, trimmed |
| `email` | String | Unique, lowercase |
| `passwordHash` | String | bcrypt hash (12 rounds) |
| `timestamps` | Auto | `createdAt`, `updatedAt` |

**Static methods:** `User.hashPassword(plain)` → bcrypt hash
**Instance methods:** `user.comparePassword(plain)` → boolean, `user.toPublic()` → `{ id, username, email, createdAt }`

### 5.5 `models/Room.js` — Room Schema

| Field | Type | Default |
|---|---|---|
| `roomId` | String | UUID-based (first 8 chars), unique, indexed |
| `users` | [String] | `[]` — list of usernames currently in room |
| `host` | String | Username of room creator (interviewer) |
| `question` | String | `""` — the interview question text |
| `code` | String | `"# Write your solution here\n"` |
| `language` | String | `"cpp"` |
| `version` | Number | `0` — incremented on each code/reset change |
| `messages` | [MessageSchema] | `[]` — embedded chat messages |
| `timestamps` | Auto | `createdAt`, `updatedAt` |

**MessageSchema (embedded):** `{ sender: String, text: String(max 2000), timestamp: Date }`

**Instance method:** `room.toClient()` → serialized object with message IDs as strings.

### 5.6 `models/Problem.js` — Problem Schema (Placeholder)

Fields: `title`, `description`, `constraints`, `samples[{input, output}]`. **Not actively used** — reserved for future problem bank feature.

### 5.7 `store/roomStore.js` — Dual-Storage Abstraction (★ Core Logic)

This is the **most important backend file**. Every room operation checks `isDBConnected()` at call time and routes to either MongoDB or an in-memory `Map`.

| Export | Signature | Description |
|---|---|---|
| `createRoom` | `(username, question) → room` | Generates 8-char UUID roomId, creates room with user as host |
| `joinRoom` | `(roomId, username) → room` | Adds username to `users[]` if not already present |
| `getRoom` | `(roomId) → room or null` | Read-only lookup |
| `setRoomCode` | `(roomId, code) → room` | Updates code, increments `version` |
| `setRoomLanguage` | `(roomId, language) → room` | Validates + normalizes language first |
| `setRoomQuestion` | `(roomId, question) → room` | Updates question text |
| `resetRoom` | `(roomId) → room` | Resets code to default + language to `cpp`, increments `version` |
| `getRoomsCount` | `() → number` | Total rooms (for health check) |
| `removeUserFromRoom` | `(roomId, username) → room or null` | Removes user; **deletes room entirely** if no users remain |
| `addChatMessage` | `(roomId, sender, text) → message` | Appends message; in-memory caps at 200 messages |

**In-memory fallback:** Uses `memoryRooms: Map<roomId, object>` with helper `memGetOrThrow()` and `memToClient()`.

### 5.8 `routes/auth.js` — Authentication Routes

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/auth/register` | POST | None | Creates user account. Returns `{ token, user }`. Returns 503 if DB offline. |
| `/api/auth/login` | POST | None | Validates credentials. Returns `{ token, user }`. |
| `/api/auth/me` | GET | Bearer | Returns current user from token. Works even without DB. |

### 5.9 `routes/api.js` — Room & Code Routes

| Endpoint | Method | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `/api/room/create` | POST | Optional | No | Creates room. Body: `{ username?, question? }` |
| `/api/room/join` | POST | Optional | No | Joins room. Body: `{ roomId, username? }` |
| `/api/room/reset` | POST | None | No | Resets code/language. Body: `{ roomId }` |
| `/api/room/question` | POST | None | No | Updates question. Body: `{ roomId, question }` |
| `/api/code/run` | POST | None | **10 req/min** | Executes code. Body: `{ sourceCode, language, stdin?, roomId? }` |

### 5.10 `middleware/auth.js` — JWT Middleware

- `signToken(payload)` → JWT string (7-day expiry)
- `verifyToken(token)` → decoded payload (throws on invalid)
- `requireAuth(req, res, next)` → 401 if no valid Bearer token
- `optionalAuth(req, res, next)` → attaches `req.user` if token present, continues regardless

### 5.11 `middleware/rateLimit.js` — Rate Limiter

Custom in-memory sliding-window rate limiter. Uses `Map<"ip:path", { count, resetAt }>`. Returns 429 with `Retry-After` header when exceeded. IP extraction supports `X-Forwarded-For`.

### 5.12 `services/judge0.js` — Code Execution

**Flow:**
1. Maps language key → Judge0 language ID via `SUPPORTED_LANGUAGES`
2. POSTs to `Judge0/submissions?wait=false` (async submission)
3. Polls `GET /submissions/:token` every 250ms, up to 20 attempts (5s max)
4. Returns `{ stdout, stderr, compileOutput, status, time, memory }`
5. If `JUDGE0_API_KEY` is set, sends `x-rapidapi-key` + `x-rapidapi-host` headers

---

## 6. REST API Summary

```
POST /api/auth/register    → { token, user }
POST /api/auth/login       → { token, user }
GET  /api/auth/me          → { user }

POST /api/room/create      → { roomId, code, language, users, host, question, version, messages }
POST /api/room/join        → { roomId, code, language, users, host, question, version, messages }
POST /api/room/reset       → { roomId, code, language, users, host, question, version, messages }
POST /api/room/question    → { roomId, question }
POST /api/code/run         → { stdout, stderr, compileOutput, status, time, memory }

GET  /health               → { status: "ok", rooms: <number> }
```

---

## 7. Socket.io Events — Complete Reference

### 7.1 Client → Server

| Event | Payload | Description |
|---|---|---|
| `join-room` | `{ roomId, username }` | Join a room. Server responds with `room-state`. |
| `code-change` | `{ roomId, code }` | Broadcast code edits to other participants. |
| `set-language` | `{ roomId, language }` | Change editor language for all participants. |
| `question-change` | `{ roomId, question }` | Update question text (**host-only**, enforced server-side). |
| `reset-room` | `{ roomId }` | Reset code + language to defaults. |
| `run-code` | `{ roomId, sourceCode, language, stdin }` | Execute code via Judge0. |
| `cursor-move` | `{ roomId, position: { line, column } }` | Broadcast cursor position. |
| `selection-change` | `{ roomId, selection }` | Broadcast text selection. |
| `chat-message` | `{ roomId, text }` | Send chat message. |
| `chat-typing` | `{ roomId, isTyping }` | Broadcast typing indicator. |

### 7.2 Server → Client

| Event | Payload | Description |
|---|---|---|
| `room-state` | Full room object | Sent to joining user with complete room state. |
| `code-update` | `{ code, version }` | Code changed by another user. |
| `language-update` | `language` (string) | Language changed. |
| `question-update` | `question` (string) | Question text changed. |
| `users-update` | `users` (string[]) | User list changed (join/disconnect). |
| `run-result` | `{ stdout, stderr, compileOutput, status }` | Code execution result. |
| `cursor-update` | `{ username, position: { line, column, color } }` | Remote cursor moved. |
| `cursor-remove` | `{ username }` | User disconnected, remove their cursor. |
| `cursors-sync` | `{ [username]: cursorData }` | Full cursor state sent on join. |
| `selection-update` | `{ username, selection }` | Remote selection changed. |
| `chat-update` | `{ id, sender, text, timestamp }` | New chat or system message. |
| `chat-typing-update` | `{ username, isTyping }` | Typing indicator. |
| `error-message` | `message` (string) | Server-side error notification. |

### 7.3 Socket Authentication

On connection, server checks `socket.handshake.auth.token`. If valid JWT, sets `socket.data.username`, `socket.data.userId`, `socket.data.authenticated = true`. Authentication is **optional** — unauthenticated sockets work as guests.

### 7.4 Disconnect Cleanup Flow

1. `socketMeta` map looked up by `socket.id` → `{ roomId, username }`
2. Entry deleted from `socketMeta`
3. `removeUserFromRoom(roomId, username)` called → removes from `users[]`, deletes room if empty
4. Cursor data removed from `cursorPositions`
5. Remaining users notified: `users-update`, `cursor-remove`, system `chat-update` message

---

## 8. Frontend Architecture

### Single-Component App (`App.jsx` — 567 lines)

The entire UI lives in one React component with no routing. It manages three screens:

1. **Auth Screen** — Login / Register / Guest continue
2. **Loading Screen** — Spinner while checking token on mount
3. **Main UI** — Sidebar (room setup + question) + Editor workspace (Monaco + console + chat)

### State Management

All state is local `useState` hooks. Key state groups:

| Group | Variables | Purpose |
|---|---|---|
| Auth | `authUser, authMode, authForm, authError, authLoading` | Login/register/guest flow |
| Room | `roomId, joinedRoomId, roomHost, users, username, question` | Room membership & metadata |
| Editor | `code, language, stdin, stdout, stderr, compileOutput, status, isRunning` | Code editing & execution |
| Chat | `messages, chatInput, chatOpen, unreadCount, typingUsers` | Real-time chat panel |
| Cursors | `remoteCursors, editorRef, monacoRef, decorationsRef` | Collaborative cursor rendering |

### Socket Client (`lib/socket.js`)

- Connects to `VITE_BACKEND_URL` (or `localhost:4000`) via WebSocket transport
- Auth token passed via `socket.handshake.auth` (lazy getter from `localStorage`)
- `reconnectSocket()` — disconnects and reconnects (called after login/logout)
- `getAuthHeaders()` — returns `{ Authorization: "Bearer <token>" }` for REST calls

### Key UI Flows

**Create Room:** `POST /api/room/create` → `syncRoomState()` → `socket.emit("join-room")` → URL updated with `?room=<id>`

**Join Room:** URL `?room=` param auto-populates `roomId` → user clicks Join → `POST /api/room/join` → same flow

**Code Editing:** Monaco `onChange` → `setCode()` + `socket.emit("code-change")` → server broadcasts `code-update` to others

**Run Code:** `POST /api/code/run` → displays stdout/stderr/compile output in console section

**Cursor Tracking:** Monaco `onDidChangeCursorPosition` → `socket.emit("cursor-move")` → others receive `cursor-update` → rendered as Monaco decorations via `deltaDecorations()`

---

## 9. Data Flow Diagram

### Room Lifecycle

```
Interviewer                    Server                     Candidate
    |                            |                            |
    |-- POST /room/create ------>|                            |
    |<-- { roomId } -------------|                            |
    |-- emit("join-room") ------>|                            |
    |<-- emit("room-state") ----|                            |
    |                            |                            |
    |-- Share invite link ---------------------------------->|
    |                            |                            |
    |                            |<-- POST /room/join --------|
    |                            |--- { room } ------------->|
    |                            |<-- emit("join-room") ------|
    |<-- emit("users-update") --|--- emit("room-state") --->|
    |                            |                            |
    |-- emit("code-change") --->|--- emit("code-update") -->|
    |                            |                            |
    |                            |<-- emit("run-code") ------|
    |                            |--- emit("run-result") --->|
    |                            |                            |
    |                            |<-- [disconnect] ----------|
    |<-- emit("users-update") --|                            |
    |<-- emit("cursor-remove") -|                            |
    |<-- emit("chat-update") ---|  (system: "X left")        |
```

---

## 10. Design Patterns & Conventions

| Pattern | Where | Details |
|---|---|---|
| **Dual storage** | `roomStore.js` | Every function checks `isDBConnected()` and branches to Mongo or in-memory `Map` |
| **Optimistic UI** | `App.jsx` | Code/question changes update local state immediately, then emit to socket |
| **Optional auth** | Routes + Socket | Platform works fully without login (guest mode). Auth adds persistence & identity. |
| **Room auto-cleanup** | `server.js` disconnect handler | Rooms are deleted when the last user disconnects |
| **Version counter** | `room.version` | Incremented on code changes to help detect stale updates |
| **Normalized languages** | Both frontend & backend | `"c++"` always normalized to `"cpp"` before any logic |

---

## 11. How to Run

```bash
# Install all workspace dependencies
npm install

# Start both frontend (Vite :5173) and backend (Express :4000) concurrently
npm run dev

# Or individually:
npm run dev:backend
npm run dev:frontend
```

---

## 12. Key Gotchas for AI Agents

1. **`Problem.js` model is unused** — it's a placeholder for a future problem bank. Don't try to query it.
2. **No ORM abstraction layer** — `roomStore.js` IS the abstraction. Always go through its exported functions, never call `RoomModel` directly from routes or socket handlers.
3. **Frontend is a single component** — `App.jsx` has no child components, no context providers, no routing. All state is co-located.
4. **Socket auth is optional** — the server doesn't reject unauthenticated sockets. `socket.data.authenticated` may be `false`.
5. **Rate limiting is in-memory only** — it resets on server restart and doesn't work across multiple server instances.
6. **Judge0 polling timeout** — max 20 attempts x 250ms = 5 seconds. Long-running code will timeout.
7. **Chat messages capped at 200** in memory mode (no limit in MongoDB mode).
8. **Room IDs are first 8 chars of UUID** — not globally unique but sufficient for the use case.
9. **`trust proxy` is set to `1`** — Express trusts the first proxy for IP extraction (important for rate limiting on Render).
10. **Frontend normalizes `VITE_BACKEND_URL`** — strips trailing slashes automatically.
