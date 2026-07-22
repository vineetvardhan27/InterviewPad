# InterviewPad — Complete Technical Reference

> **Audience**: Any AI coding agent or developer who needs to understand, modify, or extend this project.  
> **Last updated**: June 2026

---

## Table of Contents

1. [Project Purpose](#1-project-purpose)
2. [Tech Stack & Dependencies](#2-tech-stack--dependencies)
3. [Complete File Structure](#3-complete-file-structure)
4. [Environment Variables](#4-environment-variables)
5. [Backend — File-by-File Reference](#5-backend--file-by-file-reference)
6. [Frontend — File-by-File Reference](#6-frontend--file-by-file-reference)
7. [REST API Endpoints](#7-rest-api-endpoints)
8. [Socket.io Events — Complete Reference](#8-socketio-events--complete-reference)
9. [Data Models & Schemas](#9-data-models--schemas)
10. [Core Business Logic](#10-core-business-logic)
11. [Authentication System](#11-authentication-system)
12. [Data Flow Diagrams](#12-data-flow-diagrams)
13. [State Management (Frontend)](#13-state-management-frontend)
14. [CSS Architecture & Theming](#14-css-architecture--theming)
15. [Design Patterns & Conventions](#15-design-patterns--conventions)
16. [Deployment Configuration](#16-deployment-configuration)
17. [How to Run Locally](#17-how-to-run-locally)
18. [Key Gotchas & Pitfalls](#18-key-gotchas--pitfalls)
19. [What's Unused / Reserved](#19-whats-unused--reserved)
20. [Extension Points](#20-extension-points)

---

## 1. Project Purpose

**InterviewPad** is a real-time collaborative coding platform for technical interviews. The workflow:

1. An **interviewer** creates a room and pastes a coding question
2. The interviewer shares an invite link with the **candidate**
3. The candidate joins and writes code in a shared Monaco editor
4. Both see each other's cursors, can chat live, and code can be executed via Judge0
5. The interviewer can reset the editor or change the question at any time

**Key design decisions:**
- Works fully without authentication (guest mode) — auth is optional and adds persistence
- Room state can live in MongoDB **or** an in-memory `Map` (auto-fallback)
- Frontend uses a component-based architecture: `App.jsx` is the state manager + socket orchestrator, delegating UI to `AuthScreen`, `Sidebar`, `EditorPanel`, and `ChatPanel` components
- No React Router — single-page app with URL `?room=` parameter for room linking
- Code execution is sandboxed via the Judge0 CE API

---

## 2. Tech Stack & Dependencies

### Monorepo Setup

- **Package manager**: npm workspaces (root `package.json` defines `["frontend", "backend"]`)
- **Concurrent dev**: `concurrently` runs both frontend + backend via `npm run dev`

### Backend (`backend/package.json`)

| Package | Version | Purpose |
|---|---|---|
| `express` | ^4.21.2 | HTTP framework, JSON body parser, CORS |
| `socket.io` | ^4.8.1 | Real-time WebSocket server |
| `mongoose` | ^9.6.2 | MongoDB ODM (optional — falls back to in-memory) |
| `jsonwebtoken` | ^9.0.3 | JWT token signing/verification |
| `bcryptjs` | ^3.0.3 | Password hashing (12 salt rounds) |
| `axios` | ^1.8.2 | HTTP client for Judge0 API calls |
| `dotenv` | ^16.4.7 | Environment variable loading |
| `cors` | ^2.8.5 | CORS middleware |

- **Runtime**: Node.js with ES Modules (`"type": "module"`)
- **Dev command**: `node --watch src/server.js` (native Node file watcher)
- **Entry point**: `src/server.js`

### Frontend (`frontend/package.json`)

| Package | Version | Purpose |
|---|---|---|
| `react` | ^18.3.1 | UI framework |
| `react-dom` | ^18.3.1 | React DOM renderer |
| `@monaco-editor/react` | ^4.6.0 | Monaco code editor (same engine as VS Code) |
| `socket.io-client` | ^4.8.1 | WebSocket client |
| `axios` | ^1.8.2 | HTTP client for REST API calls |
| `vite` | ^6.2.0 | Build tool + dev server (port 5173) |
| `@vitejs/plugin-react` | ^4.3.4 | Vite React plugin |

- **Build tool**: Vite 6
- **Dev server**: `localhost:5173`
- **No router**: Single-page, single-component app

---

## 3. Complete File Structure

```
Coding_Place/                         ← Root (npm workspace)
│
├── package.json                      ← Workspace config: workspaces=["frontend","backend"], concurrently scripts
├── package-lock.json                 ← Lockfile
├── Procfile                          ← Render deploy: `web: npm run start --workspace backend`
├── README.md                         ← Setup & deployment docs
├── Info.md                           ← THIS FILE — complete technical reference
├── overview.md                       ← Project overview (earlier version of docs)
├── .gitignore                        ← Ignores: node_modules, .env, frontend/dist, etc.
│
├── .github/
│   └── copilot-instructions.md       ← Development checklist
│
├── scripts/                          ← Empty, reserved for future build/utility scripts
│
├── backend/
│   ├── package.json                  ← Backend deps, scripts: dev="node --watch src/server.js", start="node src/server.js"
│   ├── .env                          ← ACTUAL env vars (gitignored)
│   ├── .env.example                  ← Template: PORT, FRONTEND_ORIGIN, JUDGE0_URL, JUDGE0_API_KEY, MONGO_URI, JWT_SECRET
│   │
│   └── src/
│       ├── server.js                 ★ ENTRY POINT (395 lines)
│       │                               - Creates Express app + HTTP server + Socket.io server
│       │                               - Configures CORS with dynamic origin check
│       │                               - Mounts routes: /api/auth → authRouter, /api → apiRouter
│       │                               - Serves frontend/dist/ in production (SPA fallback)
│       │                               - Health check: GET /health → { status: "ok", rooms: <count> }
│       │                               - ALL Socket.io event handlers (join, code, question, chat, cursors, disconnect)
│       │                               - In-memory maps: socketMeta, cursorPositions
│       │
│       ├── config/
│       │   ├── db.js                   MongoDB connection with graceful fallback
│       │   │                           Exports: connectDB(), isDBConnected()
│       │   │
│       │   └── languages.js            Language registry: cpp(54), java(62), python(71)
│       │                               Exports: SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, normalizeLanguage(), isLanguageSupported()
│       │
│       ├── models/
│       │   ├── User.js                 Mongoose User schema (username, email, passwordHash)
│       │   │                           Statics: hashPassword(). Methods: comparePassword(), toPublic()
│       │   │
│       │   ├── Room.js                 Mongoose Room schema (roomId, users[], host, question, code, language, version, messages[])
│       │   │                           Embedded MessageSchema: { sender, text, timestamp }
│       │   │                           Methods: toClient()
│       │   │
│       │   └── Problem.js              ⚠ PLACEHOLDER — NOT USED. Future problem bank schema.
│       │
│       ├── routes/
│       │   ├── auth.js                 POST /register, POST /login, GET /me
│       │   │                           Returns 503 if DB offline (guest mode only)
│       │   │
│       │   └── api.js                  POST /room/create, /room/join, /room/reset, /room/question
│       │                               POST /code/run (rate limited: 10 req/min)
│       │
│       ├── middleware/
│       │   ├── auth.js                 JWT middleware: signToken(), verifyToken(), requireAuth(), optionalAuth()
│       │   │                           Secret: JWT_SECRET env var (7-day expiry)
│       │   │
│       │   └── rateLimit.js            In-memory sliding-window rate limiter
│       │                               createRateLimiter({ windowMs, maxRequests, message })
│       │                               IP extraction: X-Forwarded-For → req.ip → socket.remoteAddress
│       │
│       ├── services/
│       │   └── judge0.js               Judge0 API integration
│       │                               runCode({ sourceCode, language, stdin })
│       │                               Submit → Poll (250ms × 20 attempts = 5s max)
│       │                               Returns: { stdout, stderr, compileOutput, status, time, memory }
│       │
│       ├── store/
│       │   └── roomStore.js            ★ CORE DATA LAYER (252 lines)
│       │                               Dual-storage: MongoDB or in-memory Map (auto-detects via isDBConnected())
│       │                               Exports: createRoom, joinRoom, getRoom, setRoomCode, setRoomLanguage,
│       │                                        setRoomQuestion, resetRoom, getRoomsCount, removeUserFromRoom, addChatMessage
│       │
│       └── data/                       Empty, reserved for future data files
│
└── frontend/
    ├── package.json                    Frontend deps, scripts: dev="vite", build="vite build", preview="vite preview"
    ├── vite.config.js                  Minimal: plugins: [react()]
    ├── index.html                      SPA entry point: <div id="root">, <script src="/src/main.jsx">
    ├── test-chat.js                    Manual test script: creates room, connects 2 sockets, sends chat, verifies delivery
    │
    ├── dist/                           Build output (gitignored), served by backend in production
    │
    └── src/
        ├── main.jsx                    ReactDOM.createRoot → <App /> in StrictMode, imports styles.css
        │
        ├── App.jsx                     ★ STATE MANAGER + SOCKET ORCHESTRATOR (~340 lines)
        │                               Owns all state (useState), refs, effects, and handler functions
        │                               Delegates UI to AuthScreen, Sidebar, EditorPanel, ChatPanel
        │                               Navbar rendered inline (~15 lines JSX)
        │
        ├── styles.css                  All CSS (~700 lines, ~14KB) — minimal, typography-focused
        │                               Light/dark theme via [data-theme] attribute
        │                               Fonts: Inter (UI), IBM Plex Mono (code)
        │                               Flat design: no gradients, no blur, no shadows
        │                               Responsive breakpoints: 1180px, 760px
        │
        ├── components/
        │   ├── AuthScreen.jsx           Login / Register / Guest-continue UI (~110 lines)
        │   │                           Props: theme, authMode, authForm, authError, username, onAuth, etc.
        │   │                           Pure presentational — no socket logic
        │   │
        │   ├── Sidebar.jsx             Room setup, session info, participants, question editor (~130 lines)
        │   │                           Props: authUser, username, roomId, users, question, isHost, etc.
        │   │                           Pure presentational — no socket logic
        │   │
        │   ├── EditorPanel.jsx         Monaco editor, toolbar, console I/O (~150 lines)
        │   │                           Props: theme, language, code, status, stdin/stdout/stderr, etc.
        │   │                           onEditorMount callback passes refs up to App.jsx
        │   │                           ChatPanel rendered via children prop slot
        │   │
        │   └── ChatPanel.jsx           Chat messages, input bar, typing indicator (~80 lines)
        │                               Props: messages, username, chatInput, typingUsers, onSendChat, etc.
        │                               Pure presentational — no socket logic
        │
        ├── constants/
        │   └── languages.js            LANGUAGES = [{ key: "cpp", label: "C++" }, { key: "java", label: "Java" }, { key: "python", label: "Python" }]
        │
        └── lib/
            └── socket.js               Socket.io client singleton
                                        Connects to VITE_BACKEND_URL (default: localhost:4000), WebSocket-only transport
                                        Exports: socket, API_BASE_URL, getAuthHeaders(), reconnectSocket()
                                        Auth token from localStorage passed via socket.handshake.auth (lazy getter)
```

---

## 4. Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `4000` | Server port |
| `FRONTEND_ORIGIN` | Yes | `http://localhost:5173` | Comma-separated CORS allowed origins |
| `JUDGE0_URL` | Yes | `https://ce.judge0.com` | Judge0 API base URL |
| `JUDGE0_API_KEY` | No | _(empty)_ | RapidAPI key for Judge0 (sent as `x-rapidapi-key` header) |
| `MONGO_URI` | No | _(empty)_ | MongoDB connection string. If unset → in-memory storage |
| `JWT_SECRET` | Yes | `interviewpad-dev-secret-change-in-production` | Secret for signing JWT tokens |

### Frontend (set at build time via Vite)

| Variable | Default | Description |
|---|---|---|
| `VITE_BACKEND_URL` | `http://localhost:4000` | Backend URL. No trailing slash (auto-stripped). |

### `.env.example` (template)
```env
PORT=4000
FRONTEND_ORIGIN=http://localhost:5173
JUDGE0_URL=https://ce.judge0.com
JUDGE0_API_KEY=
MONGO_URI=
JWT_SECRET=
```

---

## 5. Backend — File-by-File Reference

### 5.1 `server.js` — Entry Point (395 lines)

**Responsibilities:**
1. Loads `dotenv/config`, creates Express app + HTTP server + Socket.io server
2. Configures CORS — dynamic `origin` callback checks against `FRONTEND_ORIGIN` (comma-split) + allows all `localhost` origins and HTTPS origins
3. Mounts routes: `/api/auth` → `authRouter`, `/api` → `apiRouter`
4. Serves `frontend/dist/` static files in production (SPA catch-all with `*` route)
5. Health check: `GET /health` → `{ status: "ok", rooms: <count> }`
6. **All Socket.io event handlers** (see Section 8)
7. Calls `connectDB()` on startup, then listens on `PORT`

**Key in-memory data structures:**
```js
socketMeta: Map<socketId, { roomId, username }>  // tracks which room each socket belongs to
cursorPositions: Map<roomId, Map<username, { line, column, color }>>  // cursor positions per room
CURSOR_COLORS: string[10]  // color palette for remote cursors, assigned round-robin
```

**Key helper functions:**
- `isAllowedOrigin(origin)` — returns `true` if origin is in `ALLOWED_ORIGINS` or starts with `http://localhost:` or `https://`
- `getCursorColor(roomId, username)` — assigns cursor color based on room cursor count modulo 10
- `emitRoomState(target, room)` — emits full room state to a socket or room broadcast

**Express middleware chain:**
1. `cors()` with dynamic origin
2. `trust proxy = 1` (for rate limiting behind Render proxy)
3. `express.json({ limit: "200kb" })` — body parser with 200KB limit

---

### 5.2 `config/db.js` — MongoDB Connection (33 lines)

```js
connectDB()     // Attempts MongoDB connection with 5s timeout. Returns true/false.
                // On failure: logs warning, app continues in in-memory mode.

isDBConnected() // Returns boolean. Used by roomStore.js at runtime.
```

**Key behavior:** The connection uses `serverSelectionTimeoutMS: 5000` and `connectTimeoutMS: 5000`. If `MONGO_URI` is not set, it immediately returns `false` without attempting connection.

---

### 5.3 `config/languages.js` — Language Registry (20 lines)

```js
SUPPORTED_LANGUAGES = {
  cpp:    { label: "C++",    judge0Id: 54 },
  java:   { label: "Java",   judge0Id: 62 },
  python: { label: "Python", judge0Id: 71 }
}

DEFAULT_LANGUAGE = "cpp"

normalizeLanguage(lang)    // Maps "c++" → "cpp", passes through everything else
isLanguageSupported(lang)  // Normalizes first, then checks SUPPORTED_LANGUAGES
```

---

### 5.4 `models/User.js` — User Schema (48 lines)

| Field | Type | Constraints |
|---|---|---|
| `username` | String | Required, unique, trim, 2-30 chars |
| `email` | String | Required, unique, trim, lowercase |
| `passwordHash` | String | Required |
| `createdAt` | Date | Auto (timestamps) |
| `updatedAt` | Date | Auto (timestamps) |

**Static methods:**
- `User.hashPassword(plain)` → bcrypt hash with 12 salt rounds

**Instance methods:**
- `user.comparePassword(plain)` → boolean (bcrypt compare)
- `user.toPublic()` → `{ id, username, email, createdAt }` (strips passwordHash)

---

### 5.5 `models/Room.js` — Room Schema (72 lines)

| Field | Type | Default | Notes |
|---|---|---|---|
| `roomId` | String | _(required)_ | UUID first 8 chars, unique, indexed |
| `users` | [String] | `[]` | Usernames currently in room |
| `host` | String | _(required)_ | Username of room creator (interviewer) |
| `question` | String | `""` | Interview question text |
| `code` | String | `"# Write your solution here\n"` | Editor content |
| `language` | String | `"cpp"` | Current language |
| `version` | Number | `0` | Incremented on each code/reset change |
| `messages` | [MessageSchema] | `[]` | Embedded chat messages |
| `createdAt` | Date | Auto | Mongoose timestamps |
| `updatedAt` | Date | Auto | Mongoose timestamps |

**Embedded MessageSchema:**
| Field | Type | Notes |
|---|---|---|
| `sender` | String | Required |
| `text` | String | Required, maxlength 2000 |
| `timestamp` | Date | Default: `Date.now` |
| `_id` | ObjectId | Auto-generated (used as message ID) |

**Instance method:**
- `room.toClient()` → serialized object with message `_id` converted to string

---

### 5.6 `models/Problem.js` — Problem Schema (20 lines)

> ⚠ **NOT USED** — Placeholder for a future problem bank feature.

| Field | Type |
|---|---|
| `title` | String (required) |
| `description` | String (required) |
| `constraints` | String (default: "") |
| `samples` | `[{ input: String, output: String }]` |

---

### 5.7 `store/roomStore.js` — Dual-Storage Abstraction (252 lines)

**This is the most critical backend file.** Every function checks `isDBConnected()` at call time and routes to either MongoDB (via `RoomModel`) or an in-memory `Map`.

| Function | Signature | Description |
|---|---|---|
| `createRoom` | `(username="guest", question="") → room` | Generates 8-char UUID `roomId`, creates room with user as host and first member |
| `joinRoom` | `(roomId, username="guest") → room` | Adds username to `users[]` via `$addToSet` (Mongo) or `push` (memory). Idempotent. |
| `getRoom` | `(roomId) → room \| null` | Read-only lookup. Returns `null` if not found. |
| `setRoomCode` | `(roomId, code, expectedVersion=null) → { conflict, room }` | Updates code, increments `version`. If `expectedVersion` is given and doesn't match, returns `{ conflict: true, room: currentState }` |
| `setRoomLanguage` | `(roomId, language) → room` | Validates + normalizes language, then updates. Throws if unsupported. |
| `setRoomQuestion` | `(roomId, question) → room` | Updates question text |
| `resetRoom` | `(roomId) → room` | Resets code to `"# Write your solution here\n"` + language to `"cpp"`, increments `version` |
| `getRoomsCount` | `() → number` | Total room count (for health check) |
| `removeUserFromRoom` | `(roomId, username) → room \| null` | Removes user from `users[]`. Returns `null` if room not found. (**Note:** unlike overview.md suggests, rooms are NOT auto-deleted when empty in current code.) |
| `addChatMessage` | `(roomId, sender, text) → message` | Appends message. In-memory mode caps at 200 messages (trims oldest). Returns `{ id, sender, text, timestamp }`. |

**In-memory internals:**
- `memoryRooms: Map<roomId, object>` — plain JS objects
- `memGetOrThrow(roomId)` — throws `"Room not found"` if missing
- `memToClient(room)` — normalizes room object for client consumption

**Version conflict resolution (OCC — Optimistic Concurrency Control):**
- `setRoomCode` accepts an optional `expectedVersion`
- In MongoDB: uses `{ roomId, version: expectedVersion }` as query filter — if no doc matches, it's a conflict
- In memory: compares `room.version !== expectedVersion`
- On conflict: returns `{ conflict: true, room: currentState }` so the caller can rebase

---

### 5.8 `routes/auth.js` — Authentication Routes (98 lines)

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `/api/auth/register` | POST | None | Creates user account. Body: `{ username, email, password }`. Returns `{ token, user }`. Returns 503 if DB offline. |
| `/api/auth/login` | POST | None | Validates credentials. Body: `{ email, password }`. Returns `{ token, user }`. Returns 503 if DB offline. |
| `/api/auth/me` | GET | Bearer token | Returns current user from token. Works even without DB (returns decoded token data). |

**Validation rules:**
- Register: password ≥ 6 chars, username 2-30 chars, checks for duplicate email/username
- Login: looks up by email (lowercase), compares password via bcrypt

---

### 5.9 `routes/api.js` — Room & Code Routes (108 lines)

| Endpoint | Method | Auth | Rate Limit | Request Body | Response |
|---|---|---|---|---|---|
| `/api/room/create` | POST | Optional | No | `{ username?, question? }` | `{ roomId, code, language, users, host, question, version, messages }` (201) |
| `/api/room/join` | POST | Optional | No | `{ roomId, username? }` | Same as create (200) |
| `/api/room/reset` | POST | None | No | `{ roomId }` | Same room shape (200) |
| `/api/room/question` | POST | None | No | `{ roomId, question }` | `{ roomId, question }` (200) |
| `/api/code/run` | POST | None | **10 req/min** per IP | `{ sourceCode, language, stdin?, roomId? }` | `{ stdout, stderr, compileOutput, status, time, memory }` (200) |

**Key behaviors:**
- `room/create` and `room/join` use `optionalAuth` middleware — if a valid Bearer token is present, `req.user.username` overrides `req.body.username`
- `code/run` optionally syncs code/language to the room (if `roomId` provided) before executing
- `code/run` is the only rate-limited endpoint: 10 requests per minute per IP per path

---

### 5.10 `middleware/auth.js` — JWT Middleware (50 lines)

```js
signToken(payload)        // Returns JWT string, 7-day expiry, signed with JWT_SECRET
verifyToken(token)        // Returns decoded payload, throws on invalid/expired
requireAuth(req, res, next)  // 401 if no valid Bearer token. Sets req.user = { id, username, email }
optionalAuth(req, res, next) // Attaches req.user if token present, continues as guest if not
```

**JWT payload shape**: `{ id, username, email, iat, exp }`  
**Default secret**: `"interviewpad-dev-secret-change-in-production"` (MUST change in production)

---

### 5.11 `middleware/rateLimit.js` — Rate Limiter (39 lines)

```js
createRateLimiter({ windowMs, maxRequests, message }) → Express middleware
```

**Algorithm:** In-memory sliding-window bucket.
- Key: `"ip:basePath+path"` (e.g., `"192.168.1.1:/api/code/run"`)
- Uses `Map<key, { count, resetAt }>` — bucket resets when `resetAt` expires
- Returns 429 with `Retry-After` header and `{ message, retryAfterMs }` body

**IP extraction priority:** `X-Forwarded-For` header (first IP) → `req.ip` → `req.socket.remoteAddress` → `"anonymous"`

---

### 5.12 `services/judge0.js` — Code Execution (67 lines)

```js
runCode({ sourceCode, language, stdin="" }) → { stdout, stderr, compileOutput, status, time, memory }
```

**Execution flow:**
1. Normalizes language → looks up `judge0Id` from `SUPPORTED_LANGUAGES`
2. `POST ${JUDGE0_URL}/submissions?base64_encoded=false&wait=false` with `{ source_code, language_id, stdin }`
3. Receives submission `token`
4. Polls `GET ${JUDGE0_URL}/submissions/${token}?base64_encoded=false` every **250ms**
5. Checks if `data.status.id > 2` (Judge0 status > 2 means processing complete)
6. Max **20 attempts** (5 seconds total timeout)
7. Returns result or throws `"Execution timed out"`

**Judge0 status codes reference:**
- 1 = In Queue
- 2 = Processing
- 3 = Accepted (success)
- 4 = Wrong Answer
- 5 = Time Limit Exceeded
- 6+ = Various errors

**Headers:** If `JUDGE0_API_KEY` is set, sends:
```
x-rapidapi-key: <JUDGE0_API_KEY>
x-rapidapi-host: <parsed from JUDGE0_URL>
```

---

## 6. Frontend — File-by-File Reference

### 6.1 `index.html` — SPA Entry (13 lines)

Standard Vite SPA template. Contains `<div id="root">` and loads `<script type="module" src="/src/main.jsx">`.  
Title: "Collaborative Coding Platform".

### 6.2 `vite.config.js` — Build Config (7 lines)

Minimal configuration: `plugins: [react()]`. No custom aliases, no proxy config.

### 6.3 `main.jsx` — React Entry (11 lines)

```jsx
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```
Imports `./styles.css` globally.

### 6.4 `lib/socket.js` — Socket.io Client (30 lines)

```js
BACKEND_URL = VITE_BACKEND_URL || "http://localhost:4000"  // trailing slashes stripped

socket = io(BACKEND_URL, {
  autoConnect: true,
  transports: ["websocket"],    // WebSocket-only (no HTTP long-polling fallback)
  withCredentials: false,
  auth: () => ({                // Lazy getter — reads token on each connection
    token: localStorage.getItem("auth_token")
  })
})

API_BASE_URL = `${BACKEND_URL}/api`    // Used for REST calls

getAuthHeaders()    // Returns { Authorization: "Bearer <token>" } if token exists, else {}
reconnectSocket()   // Disconnects and reconnects (called after login/logout to refresh auth)
```

### 6.5 `constants/languages.js` — Language Options (6 lines)

```js
LANGUAGES = [
  { key: "cpp", label: "C++" },
  { key: "java", label: "Java" },
  { key: "python", label: "Python" }
]
```

### 6.6 `App.jsx` — State Manager + Socket Orchestrator (~340 lines)

`App.jsx` owns **all state, refs, effects, and handler functions**. It delegates UI rendering to 4 child components via props. The navbar is rendered inline (~15 lines JSX) since it's too small to warrant its own file.

**Component tree:**
```
App.jsx
├── AuthScreen (if authLoading or authMode !== "none")
├── <header> navbar (inline)
├── Sidebar
└── EditorPanel
    └── ChatPanel (via children slot, when chatOpen && joinedRoomId)
```

#### Helper functions (module-level):
- `buildCursorDecorations(remoteCursors, monacoRef)` — creates Monaco decoration objects for remote cursors
- `normalizeLanguage(l)` — maps `"c++"` → `"cpp"`

#### Key internal functions:

| Function | Purpose |
|---|---|
| `syncRoomState(r)` | Syncs all room state from a REST response into React state |
| `handleAuth(e)` | POST to `/auth/register` or `/auth/login`, stores token, sets user, reconnects socket |
| `handleLogout()` | Clears token, resets state, reconnects socket |
| `handleGuestContinue()` | Sets `authMode="none"` if username is non-empty |
| `handleCreateRoom()` | `POST /room/create` → `syncRoomState` → `socket.emit("join-room")` → updates URL with `?room=` |
| `handleJoinRoom()` | `POST /room/join` → same flow |
| `handleCopyInvite()` | Copies invite link to clipboard |
| `handleQuestionChange(e)` | Updates local state + emits `"question-change"` (host-only, checked client-side) |
| `handleCodeChange(nextCode)` | Updates local state + emits `"code-change"` with version. Uses `isPreventEmitRef` to avoid re-emitting remote changes. |
| `handleLanguageChange(e)` | Updates local state + emits `"set-language"` |
| `handleResetCode()` | `POST /room/reset` → `syncRoomState` → emits `"reset-room"` |
| `handleRunCode()` | `POST /code/run` → displays stdout/stderr/compileOutput |
| `handleEditorMount(editor, monaco)` | Stores refs in App.jsx, sets up cursor/selection tracking |
| `handleSendChat(e)` | Emits `"chat-message"`, clears input |
| `handleChatInputChange(e)` | Emits `"chat-typing"` with 2s debounce timeout |
| `toggleChat()` | Opens/closes chat panel, resets unread count |

#### useEffect hooks:

| Hook | Trigger | Purpose |
|---|---|---|
| Ref sync (×3) | `[chatOpen]`, `[joinedRoomId]`, `[username]` | Keeps refs in sync with state for socket callbacks |
| Theme persistence | `[theme]` | Stores in localStorage, sets `data-theme` attribute on `<html>` |
| Username persistence | `[username]` | Stores in localStorage |
| Auth check + auto-join | `[]` (mount) | Checks URL `?room=` param, validates stored token via `GET /auth/me`, auto-joins room if applicable |
| Socket listeners | `[]` (mount) | Registers all 11 socket event listeners |
| Reconnect handler | `[]` (mount) | On socket reconnect, re-emits `"join-room"` with current room/username from refs |
| Cursor decorations | `[remoteCursors]` | Updates Monaco decorations via `deltaDecorations()` |
| Chat scroll | `[messages]` | Auto-scrolls chat to bottom |

#### Ref usage:

| Ref | Owned by | Purpose |
|---|---|---|
| `chatEndRef` | App → ChatPanel | Scroll anchor for chat auto-scroll |
| `chatOpenRef` | App | Synced with `chatOpen` for socket callbacks |
| `joinedRoomIdRef` | App | Synced with `joinedRoomId` for reconnect handler |
| `usernameRef` | App | Synced with `username` for reconnect handler |
| `typingTimeoutRef` | App | Debounce timer for typing indicator |
| `isPreventEmitRef` | App | Flag to prevent re-emitting remote code changes |
| `editorRef` | App (set via onEditorMount) | Monaco editor instance |
| `monacoRef` | App (set via onEditorMount) | Monaco module reference |
| `decorationsRef` | App | Array of current decoration IDs |
| `codeVersionRef` | App | Current code version (for OCC) |

### 6.7 `components/AuthScreen.jsx` — Auth UI (~110 lines)

Pure presentational component. Renders auth loading spinner or login/register/guest forms.

**Props:**
| Prop | Type | Purpose |
|---|---|---|
| `theme` | string | For `data-theme` attribute |
| `authMode` | string | `"login"` / `"register"` |
| `setAuthMode` | function | Switch between login/register |
| `authError` | string | Error message display |
| `setAuthError` | function | Clear error on tab switch |
| `authForm` | object | `{ username, email, password }` |
| `setAuthForm` | function | Update form fields |
| `authLoading` | boolean | Show loading spinner |
| `username` | string | Guest name input |
| `setUsername` | function | Update guest name |
| `onAuth` | function | Form submit handler |
| `onGuestContinue` | function | Guest continue handler |

### 6.8 `components/Sidebar.jsx` — Room Setup + Question (~130 lines)

Pure presentational. Room creation/joining, session info, participant list, question textarea.

**Props:**
| Prop | Type | Purpose |
|---|---|---|
| `authUser` | object/null | Hide username field if logged in |
| `username, setUsername` | string, function | Name input |
| `roomId, setRoomId` | string, function | Room code input |
| `joinedRoomId` | string | Current session ID |
| `isHost` | boolean | Role indicator + question editability |
| `users` | string[] | Participant list |
| `question` | string | Question text |
| `inviteLink` | string | Invite URL |
| `canCollaborate` | boolean | Whether in a room |
| `onCreateRoom, onJoinRoom` | functions | Room action handlers |
| `onCopyInvite, onResetCode` | functions | Utility action handlers |
| `onQuestionChange` | function | Question edit handler |

### 6.9 `components/EditorPanel.jsx` — Editor + Console (~150 lines)

Contains Monaco editor, toolbar (language select, status, run button, chat toggle), and console I/O. ChatPanel is rendered via `children` prop slot.

**Props:**
| Prop | Type | Purpose |
|---|---|---|
| `theme` | string | Monaco theme (`"vs"` / `"vs-dark"`) |
| `language` | string | Editor language |
| `code` | string | Used as `defaultValue` (not controlled) |
| `status, statusClass` | string | Execution status display |
| `isRunning` | boolean | Run button disabled state |
| `stdin, setStdin` | string, function | Input textarea |
| `stdout, stderr, compileOutput` | string | Output display |
| `sessionMessage` | string | Notice bar text |
| `joinedRoomId` | string | Chat button visibility |
| `chatOpen` | boolean | Layout class for grid |
| `unreadCount` | number | Chat badge number |
| `onCodeChange` | function | Code edit handler |
| `onLanguageChange` | function | Language select handler |
| `onRunCode` | function | Run button handler |
| `onToggleChat` | function | Chat toggle handler |
| `onEditorMount` | function | Passes editor+monaco refs up to App |
| `children` | ReactNode | ChatPanel slot |

**Key design decision:** Editor refs (`editorRef`, `monacoRef`, `decorationsRef`, `codeVersionRef`) stay in `App.jsx`. Socket event handlers need direct access to `editorRef.current` for programmatic updates (`setValue`, `executeEdits`). The `onEditorMount` callback passes the instances up to App on mount.

### 6.10 `components/ChatPanel.jsx` — Chat Interface (~80 lines)

Pure presentational. Messages list, typing indicator, input bar.

**Props:**
| Prop | Type | Purpose |
|---|---|---|
| `messages` | array | Chat history |
| `username` | string | For "own" message styling |
| `chatInput` | string | Input value |
| `setChatInput` | function | Update input |
| `typingUsers` | string[] | Typing indicator |
| `chatEndRef` | ref | Scroll anchor (passed from App) |
| `onSendChat` | function | Form submit handler |
| `onChatInputChange` | function | Input change (triggers typing) |
| `onClose` | function | Close button handler |

### 6.11 `styles.css` — All CSS (~700 lines)

See Section 14 for detailed breakdown.

### 6.8 `test-chat.js` — Chat Test Script (106 lines)

Manual test that:
1. Creates a room via REST API
2. Connects 2 Socket.io clients (Interviewer + Candidate)
3. Both join the room via `"join-room"` event
4. Interviewer sends a chat message
5. Verifies both sockets received the message with correct payload shape
6. Reports pass/fail

**Run with:** `node frontend/test-chat.js` (requires backend running on localhost:4000)

---

## 7. REST API Endpoints

### Authentication

```
POST /api/auth/register
  Body: { username: string, email: string, password: string }
  Success (201): { token: string, user: { id, username, email, createdAt } }
  Errors: 400 (validation), 409 (duplicate), 503 (DB offline), 500 (server error)

POST /api/auth/login
  Body: { email: string, password: string }
  Success (200): { token: string, user: { id, username, email, createdAt } }
  Errors: 400 (missing fields), 401 (bad credentials), 503 (DB offline), 500 (server error)

GET /api/auth/me
  Headers: Authorization: Bearer <token>
  Success (200): { user: { id, username, email, createdAt } }
  Errors: 401 (no token / invalid token), 404 (user not found)
  Note: Works without DB — returns decoded token data if DB offline
```

### Room Management

```
POST /api/room/create
  Headers: Authorization: Bearer <token> (optional)
  Body: { username?: string, question?: string }
  Success (201): { roomId, code, language, users, host, question, version, messages }
  Note: If authenticated, req.user.username overrides body username

POST /api/room/join
  Headers: Authorization: Bearer <token> (optional)
  Body: { roomId: string, username?: string }
  Success (200): { roomId, code, language, users, host, question, version, messages }
  Errors: 400 (no roomId), 404 (room not found)

POST /api/room/reset
  Body: { roomId: string }
  Success (200): { roomId, code, language, users, host, question, version, messages }
  Errors: 400 (no roomId), 404 (room not found)

POST /api/room/question
  Body: { roomId: string, question: string }
  Success (200): { roomId, question }
  Errors: 400 (no roomId), 404 (room not found)
```

### Code Execution

```
POST /api/code/run
  Body: { sourceCode: string, language: string, stdin?: string, roomId?: string }
  Rate limit: 10 requests/minute per IP
  Success (200): { stdout, stderr, compileOutput, status, time, memory }
  Errors: 400 (missing fields / unsupported language), 429 (rate limit), 500 (execution error)
  Note: If roomId provided, syncs code + language to room before executing
```

### Health Check

```
GET /health
  Success (200): { status: "ok", rooms: <number> }
```

---

## 8. Socket.io Events — Complete Reference

### 8.1 Client → Server

| Event | Payload | Description | Server-side logic |
|---|---|---|---|
| `join-room` | `{ roomId, username }` | Join a room | Adds user via `joinRoom()` (idempotent), joins socket.io room, tracks in `socketMeta`, initializes cursor map, emits `room-state` to joiner + `users-update` to all + `cursors-sync` to joiner |
| `code-change` | `{ roomId, code, version }` | Broadcast code edits | Calls `setRoomCode()` with OCC. On conflict: sends `code-update` with `conflict: true` back to sender. On success: broadcasts `code-update` to others (not sender) |
| `set-language` | `{ roomId, language }` | Change language | Normalizes + validates, calls `setRoomLanguage()`, broadcasts `language-update` to ALL in room |
| `question-change` | `{ roomId, question }` | Update question | **Host-only** — compares `socket.data.username` with `room.host` (case-insensitive). Calls `setRoomQuestion()`, broadcasts `question-update` to ALL |
| `reset-room` | `{ roomId }` | Reset code/language | Calls `resetRoom()`, broadcasts `code-update`, `language-update`, and full `room-state` to ALL |
| `run-code` | `{ roomId, sourceCode, language, stdin }` | Execute code | Syncs code/language to room, calls `runCode()`, emits `run-result` to SENDER ONLY |
| `cursor-move` | `{ roomId, position: { line, column } }` | Broadcast cursor | Stores in `cursorPositions` map with color, broadcasts `cursor-update` to others |
| `selection-change` | `{ roomId, selection }` | Broadcast selection | Forwards `selection-update` to others |
| `chat-message` | `{ roomId, text }` | Send chat | Calls `addChatMessage()`, broadcasts `chat-update` to ALL in room |
| `chat-typing` | `{ roomId, isTyping }` | Typing indicator | Forwards `chat-typing-update` to others |

### 8.2 Server → Client

| Event | Payload | Sent to | Description |
|---|---|---|---|
| `room-state` | `{ roomId, code, language, users, host, question, version, messages }` | Joining user | Full room state on join or reset |
| `code-update` | `{ code, version, conflict? }` | Others (or sender on conflict) | Code changed |
| `language-update` | `language` (string) | All in room | Language changed |
| `question-update` | `question` (string) | All in room | Question text changed |
| `users-update` | `users` (string[]) | All in room | User list changed |
| `run-result` | `{ stdout, stderr, compileOutput, status }` | Sender only | Code execution result |
| `cursor-update` | `{ username, position: { line, column, color } }` | Others in room | Remote cursor moved |
| `cursor-remove` | `{ username }` | Others in room | User disconnected |
| `cursors-sync` | `{ [username]: { line, column, color } }` | Joining user | Full cursor state on join |
| `selection-update` | `{ username, selection }` | Others in room | Remote selection changed |
| `chat-update` | `{ id, sender, text, timestamp }` | All in room | New message (or system message) |
| `chat-typing-update` | `{ username, isTyping }` | Others in room | Typing indicator |
| `error-message` | `message` (string) | Sender only | Error notification |

### 8.3 Socket Authentication

On connection, server reads `socket.handshake.auth.token`:
- If valid JWT → sets `socket.data.username`, `socket.data.userId`, `socket.data.authenticated = true`
- If invalid/missing → `socket.data.authenticated = false`
- **Authentication is optional** — unauthenticated sockets work fully as guests

### 8.4 Disconnect Cleanup Flow

```
1. socketMeta.get(socket.id) → { roomId, username }
2. socketMeta.delete(socket.id)
3. removeUserFromRoom(roomId, username) → removes from users[]
4. cursorPositions.get(roomId).delete(username) — clean up cursor data
5. If room still has users:
   → emit "users-update" (updated user list)
   → emit "cursor-remove" ({ username })
   → emit "chat-update" (system message: "X left the room")
```

---

## 9. Data Models & Schemas

### Room State Object (as sent to client)

```json
{
  "roomId": "a1b2c3d4",
  "code": "# Write your solution here\n",
  "language": "cpp",
  "users": ["Alice", "Bob"],
  "host": "Alice",
  "question": "Implement a function that...",
  "version": 5,
  "messages": [
    {
      "id": "abc123",
      "sender": "Alice",
      "text": "Ready to start?",
      "timestamp": "2026-06-03T18:00:00.000Z"
    }
  ]
}
```

### User Object (public, as returned by auth endpoints)

```json
{
  "id": "665f...",
  "username": "alice",
  "email": "alice@example.com",
  "createdAt": "2026-06-03T18:00:00.000Z"
}
```

### Judge0 Result Object

```json
{
  "stdout": "Hello World\n",
  "stderr": "",
  "compileOutput": "",
  "status": "Accepted",
  "time": "0.012",
  "memory": 3456
}
```

---

## 10. Core Business Logic

### Room Lifecycle

1. **Create**: `POST /room/create` → `createRoom(username, question)` → generates 8-char UUID, creates room, user becomes host
2. **Join (REST)**: `POST /room/join` → `joinRoom(roomId, username)` → adds user to `users[]` (idempotent via `$addToSet`)
3. **Join (Socket)**: `socket.emit("join-room")` → server checks if user already added by REST, skips duplicate add, joins socket.io room, sends full state
4. **Collaborate**: Real-time code/question/language changes via socket events
5. **Disconnect**: Socket disconnect → removes user, cleans up cursors, notifies remaining users
6. **Room persists** as long as the in-memory `Map` or MongoDB doc exists

### Code Synchronization (OCC)

- Each code change increments `room.version`
- Frontend sends `{ code, version: currentVersion }` on `"code-change"`
- Backend compares `expectedVersion` with stored `version`
- **No conflict**: update code, increment version, broadcast to others
- **Conflict**: return current server state to sender with `conflict: true`
- **Frontend optimistic bump**: sender increments `codeVersionRef` locally after emitting (since `socket.to()` excludes sender)

### Question Editing (Host-Only)

- Server-side enforcement: compares `socket.data.username` with `room.host` (case-insensitive, trimmed)
- Client-side check: UI sets `readOnly` on textarea for non-hosts
- Both sides emit/receive `"question-change"` / `"question-update"`

### Auto-Join via URL

- Frontend checks `?room=<id>` URL parameter on mount
- If user has stored token → validates via `GET /auth/me`, then auto-joins
- If user has stored username (guest) → auto-joins with that name
- URL is updated with `?room=<id>` after creating/joining a room

---

## 11. Authentication System

### Flow

```
Register → POST /api/auth/register → bcrypt hash → store User → sign JWT → return { token, user }
Login    → POST /api/auth/login    → find by email → compare password → sign JWT → return { token, user }
Check    → GET /api/auth/me        → decode JWT → find User by id (or return decoded data if DB offline)
```

### Token Storage

- Frontend stores JWT in `localStorage` as `"auth_token"`
- Username stored separately in `localStorage` as `"username"`
- Token passed to socket via `socket.handshake.auth.token` (lazy getter)
- Token passed to REST via `Authorization: Bearer <token>` header

### Guest Mode

- No token required for any room/code operation
- Auth routes return 503 when DB is offline
- Socket connections work without authentication
- Guest username comes from manual input field

---

## 12. Data Flow Diagrams

### Room Lifecycle

```
Interviewer                    Server                     Candidate
    │                            │                            │
    │── POST /room/create ──────>│                            │
    │<── { roomId } ─────────────│                            │
    │── emit("join-room") ──────>│                            │
    │<── emit("room-state") ────│                            │
    │                            │                            │
    │── Share invite link ──────────────────────────────────>│
    │                            │                            │
    │                            │<── POST /room/join ────────│
    │                            │─── { room } ──────────────>│
    │                            │<── emit("join-room") ──────│
    │<── emit("users-update") ──│─── emit("room-state") ───>│
    │                            │                            │
    │── emit("code-change") ───>│─── emit("code-update") ──>│
    │                            │                            │
    │                            │<── emit("run-code") ──────│
    │                            │─── emit("run-result") ───>│
    │                            │                            │
    │                            │<── [disconnect] ──────────│
    │<── emit("users-update") ──│                            │
    │<── emit("cursor-remove") ─│                            │
    │<── emit("chat-update") ───│  (system: "X left")       │
```

### Code Edit Flow

```
User types in Monaco
    → onChange fires handleCodeChange(nextCode)
    → setCode(nextCode) [local state update]
    → Check isPreventEmitRef (skip if this was a remote update)
    → socket.emit("code-change", { roomId, code, version })
    → codeVersionRef += 1 (optimistic bump)
    → Server: setRoomCode(roomId, code, version)
        → If conflict: emit("code-update", { code, version, conflict: true }) to sender
        → If success: socket.to(roomId).emit("code-update", { code, version }) to others
    → Other clients: onCodeUpdate handler
        → isPreventEmitRef = true
        → editor.executeEdits("remote-update", ...) [preserves cursor position]
        → setCode(remoteCode)
        → codeVersionRef = version
```

### Authentication Flow

```
User submits login/register form
    → handleAuth(e)
    → POST /api/auth/register or /api/auth/login
    → localStorage.setItem("auth_token", token)
    → setAuthUser(user), setUsername(user.username)
    → setAuthMode("none")
    → reconnectSocket() [disconnect + reconnect with new token]
```

---

## 13. State Management (Frontend)

All state is owned by `App.jsx` via local `useState` hooks and passed down as props to child components. No context providers or external state management libraries are used. Key groups:

### Auth State
| Variable | Type | Purpose |
|---|---|---|
| `authUser` | `object \| null` | Logged-in user object `{ id, username, email }` |
| `authMode` | `"login" \| "register" \| "none"` | Current auth screen |
| `authForm` | `{ username, email, password }` | Form input values |
| `authError` | `string` | Auth error message |
| `authLoading` | `boolean` | True while checking token on mount |

### Room State
| Variable | Type | Purpose |
|---|---|---|
| `username` | `string` | Current user's display name (persisted in localStorage) |
| `roomId` | `string` | Room code input field value |
| `joinedRoomId` | `string` | Currently joined room ID (empty if not in room) |
| `roomHost` | `string` | Host username of current room |
| `users` | `string[]` | List of usernames in room |
| `question` | `string` | Interview question text |

### Editor State
| Variable | Type | Purpose |
|---|---|---|
| `language` | `string` | Current language (e.g., `"cpp"`) |
| `code` | `string` | Editor content |
| `stdin` | `string` | Input for code execution |
| `stdout` | `string` | Code output |
| `stderr` | `string` | Error output |
| `compileOutput` | `string` | Compilation output |
| `status` | `string` | Execution status (e.g., `"Ready"`, `"Running..."`, `"Accepted"`) |
| `isRunning` | `boolean` | True while code is executing |
| `sessionMessage` | `string` | Session notification message |

### Chat State
| Variable | Type | Purpose |
|---|---|---|
| `messages` | `array` | Chat message history `[{ id, sender, text, timestamp }]` |
| `chatInput` | `string` | Chat input field value |
| `chatOpen` | `boolean` | Chat panel visibility |
| `unreadCount` | `number` | Unread message count (increments when chat is closed) |
| `typingUsers` | `string[]` | Users currently typing |

### Cursor State
| Variable | Type | Purpose |
|---|---|---|
| `remoteCursors` | `object` | `{ [username]: { line, column, color } }` |

### Computed Values (useMemo)
| Variable | Derivation |
|---|---|
| `canCollaborate` | `Boolean(joinedRoomId)` |
| `isHost` | `canCollaborate && roomHost === username` (case-insensitive) |
| `inviteLink` | `${origin}${pathname}?room=${joinedRoomId}` |
| `statusClass` | Lowercase, non-alpha chars replaced with `-` (for CSS class) |

---

## 14. CSS Architecture & Theming

### File: `frontend/src/styles.css` (~700 lines, ~14KB)

### Design Philosophy
**Minimal, typography-focused, premium.** Clean solid backgrounds, highly legible type hierarchies, ample whitespace. No gradients, no blur effects, no drop shadows. All visual structure comes from 1px borders and subtle contrast.

### Fonts
- **UI text**: `Inter` (Google Fonts, weights: 400, 500, 600, 700)
- **Code/monospace**: `IBM Plex Mono` (Google Fonts, weights: 400, 500, 600)
- **Editor font**: `Fira Code` / `IBM Plex Mono` (set in Monaco options)

### Theme System
Themes via `[data-theme="light"]` / `[data-theme="dark"]` CSS attribute selectors on `<html>`:

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#fafafa` | `#0e0e0e` |
| `--surface` | `#ffffff` | `#1a1a1a` |
| `--surface-alt` | `#f5f5f5` | `#141414` |
| `--border` | `#e5e5e5` | `#2a2a2a` |
| `--border-focus` | `#c0c0c0` | `#444444` |
| `--text` | `#1a1a1a` | `#ebebeb` |
| `--text-secondary` | `#636363` | `#a0a0a0` |
| `--text-tertiary` | `#999999` | `#666666` |
| `--input-bg` | `#ffffff` | `#1a1a1a` |
| `--console-bg` | `#f8f8f8` | `#111111` |

### Shared design tokens (`:root`)
| Token | Value |
|---|---|
| `--accent` | `#d4654b` (desaturated coral) |
| `--accent-hover` | `#c05a42` |
| `--accent-soft` | `rgba(212,101,75,0.1)` |
| `--success` | `#2b9a77` (green) |
| `--warning` | `#b8860b` (dark goldenrod) |
| `--error` | `#c44040` (red) |
| `--radius` | `10px` |
| `--radius-sm` | `6px` |
| `--transition` | `160ms ease` |

### Design characteristics
- **Background**: Clean solid color (`--bg`), no gradients or patterns
- **Cards**: 1px solid border, no shadow, no blur
- **Buttons**: Flat design, `border-radius: 8px`, subtle hover (opacity/background change)
- **Focus states**: Border color change only (no glow/box-shadow rings)
- **Typography**: `-webkit-font-smoothing: antialiased` for crisp rendering

### Responsive breakpoints
- **≤1180px**: Single-column layout, sidebar moves below editor
- **≤760px**: Mobile-friendly — stacked navbar, full-width controls, reduced min-heights

### CSS sections (in order)
1. Font imports + reset
2. Design tokens (`:root`, theme variants)
3. Base styles (html, body, .app)
4. Auth screens (loading, backdrop, card, form, tabs, divider, guest)
5. Navbar (sticky, solid background, brand, actions, user badge)
6. Buttons (primary, secondary, tertiary, run, chat, theme toggle)
7. Layout (container grid, sidebar, cards)
8. Form elements (inputs, labels, button groups)
9. Session info (info rows, participant badges, invite link)
10. Question textarea
11. Editor workspace (toolbar, status indicator)
12. Workspace grid (editor panel, console section)
13. Console (tabs, input, output areas)
14. Notice bar
15. Chat panel (header, messages, typing indicator, input bar)
16. Cursor presence (remote cursor decorations)
17. Responsive media queries

---

## 15. Design Patterns & Conventions

| Pattern | Where | Details |
|---|---|---|
| **Dual storage** | `roomStore.js` | Every function checks `isDBConnected()` and branches to Mongo or in-memory `Map`. This is the ONLY data access layer — never call `RoomModel` directly from routes or socket handlers. |
| **Props-down, callbacks-up** | Frontend components | `App.jsx` owns all state and passes data down as props. Child components call handler functions (e.g., `onCreateRoom`, `onCodeChange`) to trigger state changes and socket emissions. |
| **Optimistic UI** | `App.jsx` | Code/question changes update local state immediately, then emit to socket. Version is optimistically bumped on the sender side. |
| **Optional auth** | Routes + Socket | Platform works fully without login (guest mode). Auth adds identity persistence. |
| **Room auto-join** | `App.jsx` mount effect | If URL has `?room=` param, auto-joins after auth check. |
| **Version counter (OCC)** | `room.version` | Incremented on code changes. Used for conflict detection in `setRoomCode()`. |
| **Normalized languages** | Both frontend & backend | `"c++"` always normalized to `"cpp"` before any logic. |
| **Event-driven architecture** | Socket.io | All real-time updates flow through socket events. REST is used only for initial room creation/joining and code execution. |
| **Ref-based stale closure prevention** | `App.jsx` | `joinedRoomIdRef`, `usernameRef`, `chatOpenRef` are synced with their state counterparts and used inside socket callbacks to avoid stale closures. |
| **Prevent echo emit** | `App.jsx` | `isPreventEmitRef` is set to `true` before programmatic editor updates to prevent `handleCodeChange` from re-emitting the remote change back to the server. |
| **Refs stay in App, not components** | `App.jsx` + `EditorPanel` | Editor refs (`editorRef`, `monacoRef`) are owned by App.jsx because socket event handlers need direct access. `EditorPanel` receives an `onEditorMount` callback to pass refs up. |
| **Children slot for chat** | `EditorPanel` | `ChatPanel` is rendered as `children` of `EditorPanel` to keep it inside the workspace grid layout without EditorPanel needing to know about chat internals. |
| **Idempotent join** | `server.js` `join-room` | Checks if user is already in `room.users` before calling `joinRoom()` to handle the case where REST route already added the user. |

---

## 16. Deployment Configuration

### Frontend → Netlify

- **Base directory**: `frontend`
- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Environment variable**: `VITE_BACKEND_URL` = `https://<your-render-backend-url>`

### Backend → Render

- **Build command**: `npm install --prefix backend`
- **Start command**: `npm run start --workspace backend`
- **Procfile**: `web: npm run start --workspace backend`
- **Environment variables**:
  - `JUDGE0_URL` (required)
  - `JUDGE0_API_KEY` (optional)
  - `FRONTEND_ORIGIN` (comma-separated, e.g., `https://your-frontend.netlify.app`)
  - `JWT_SECRET` (required for production)
  - `MONGO_URI` (optional)
  - `PORT` (provided automatically by Render)

### Production static serving

In `server.js`, if `NODE_ENV === "production"` or `frontend/dist/` exists:
- `express.static(frontendDist)` serves built files
- Catch-all `*` route returns `index.html` (SPA fallback)

---

## 17. How to Run Locally

```bash
# 1. Install all workspace dependencies
npm install

# 2. Configure backend environment
cp backend/.env.example backend/.env
# Edit backend/.env:
#   - Set JUDGE0_URL (required)
#   - Set JWT_SECRET (required)
#   - Optionally set MONGO_URI for persistence

# 3. Start both frontend (Vite :5173) and backend (Express :4000)
npm run dev

# Or run individually:
npm run dev:backend    # Backend only on :4000
npm run dev:frontend   # Frontend only on :5173

# 4. Open in browser
# http://localhost:5173

# 5. Build frontend for production
npm run build

# 6. Start production server (serves frontend/dist + API)
npm run start
```

---

## 18. Key Gotchas & Pitfalls

1. **`Problem.js` model is unused** — It's a placeholder for a future problem bank. Don't try to query it or integrate it.

2. **`roomStore.js` IS the data layer** — Never call `RoomModel` directly from routes or socket handlers. Always go through `roomStore.js` exported functions.

3. **Frontend component architecture** — `App.jsx` (~340 lines) is the state manager + socket orchestrator. UI is split into `AuthScreen`, `Sidebar`, `EditorPanel`, and `ChatPanel` in `components/`. All state lives in App.jsx — components are pure presentational and receive data via props.

4. **Socket auth is optional** — The server doesn't reject unauthenticated sockets. `socket.data.authenticated` may be `false`. Guest users work fully.

5. **Rate limiting is in-memory only** — Resets on server restart, doesn't work across multiple server instances. Not suitable for horizontal scaling.

6. **Judge0 polling timeout** — Max 20 attempts × 250ms = 5 seconds. Long-running code (e.g., infinite loops) will timeout and throw.

7. **Chat messages capped at 200** in memory mode (FIFO eviction). No limit in MongoDB mode.

8. **Room IDs are first 8 chars of UUID** — Not globally unique in theory, but collisions are extremely unlikely for the use case.

9. **`trust proxy` is set to `1`** — Express trusts the first proxy for IP extraction. Important for rate limiting behind Render's proxy.

10. **Frontend normalizes `VITE_BACKEND_URL`** — Strips trailing slashes automatically via `.replace(/\/+$/, "")`.

11. **`isPreventEmitRef` pattern** — When the editor receives a remote code update, this ref is set to `true` before calling `editor.executeEdits()`. The subsequent `onChange` callback checks this ref and skips emitting back to the server. Forgetting this causes infinite echo loops.

12. **Cursor color assignment** — Colors are assigned based on `roomCursors.size % 10`, not based on username. This means a user can get different colors if they reconnect.

13. **No room cleanup** — Rooms in the in-memory store are never deleted (even when empty). In MongoDB, rooms persist until manually deleted. The `removeUserFromRoom` function removes users but doesn't delete the room document.

14. **CORS is permissive in dev** — `isAllowedOrigin()` allows ALL `localhost` origins and ALL HTTPS origins. This is fine for development but should be tightened for production.

15. **JWT secret has a default** — `"interviewpad-dev-secret-change-in-production"`. Must be changed for production deployment.

16. **Socket.io transport** — Frontend uses `transports: ["websocket"]` only (no HTTP long-polling fallback). This is faster but may not work behind some corporate firewalls.

17. **Version bump is optimistic on sender** — The frontend increments `codeVersionRef` after emitting `"code-change"` because the sender never receives their own `"code-update"` back (due to `socket.to()`). If a conflict occurs, the server sends back the current state to rebase.

---

## 19. What's Unused / Reserved

| Item | Status | Notes |
|---|---|---|
| `models/Problem.js` | Placeholder | Future problem bank feature |
| `scripts/` directory | Empty | Reserved for build/utility scripts |
| `backend/src/data/` directory | Empty | Reserved for data files |
| `selection-change` / `selection-update` events | Wired but no UI | Events flow through sockets but no visual rendering of remote selections exists |

---

## 20. Extension Points

If you need to extend this project, here are the most natural places to add features:

| Feature | Where to modify |
|---|---|
| **Add a new language** | `backend/src/config/languages.js` (add entry with Judge0 ID), `frontend/src/constants/languages.js` (add UI option) |
| **Add persistence** | Set `MONGO_URI` env var — `roomStore.js` automatically switches to MongoDB |
| **Extract ConsolePanel** | Break the console I/O section out of `EditorPanel.jsx` into its own `ConsolePanel.jsx` component |
| **Add routing** | Install `react-router-dom`, create routes for `/room/:id`, `/auth`, etc. |
| **Add problem bank** | Activate `models/Problem.js`, create CRUD routes, add problem selection UI |
| **Add code history** | Add a `codeHistory[]` field to Room schema, store snapshots on version bumps |
| **Add file tabs** | Extend room schema with `files: [{ name, code, language }]`, update editor to support multiple files |
| **Scale rate limiter** | Replace in-memory `Map` with Redis (`ioredis`) for multi-instance support |
| **Add WebRTC** | For voice/video communication between interviewer and candidate |
| **Add test execution** | Extend Judge0 integration to run against test cases from Problem schema |
