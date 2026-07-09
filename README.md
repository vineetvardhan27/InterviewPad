<div align="center">

# InterviewPad

**Real-time collaborative coding platform for interview practice and pair problem solving**

[![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat-square&logo=socket.io&logoColor=white)](https://socket.io/)
[![Judge0](https://img.shields.io/badge/Judge0-API-blue?style=flat-square)](https://judge0.com/)

[Features](#-features) · [Architecture](#-architecture) · [Getting Started](#-getting-started) · [Backend API](#-backend-api) · [Socket Events](#-socket-events) · [Deployment](#-deployment)

</div>

---

## Overview

CodeCollab is a full-stack collaborative coding platform built for technical interviews and pair problem solving. It provides an interview-first room flow — interviewers spin up a room, author their own question, and share an invite link, while both parties code together in real time with a full-featured, multi-language editor and sandboxed code execution.

**Why CodeCollab?**

- **Interview-first flow** — No hardcoded prompts. Interviewers write the question directly in the room.
- **One click to start** — Create a room and share the invite link in seconds.
- **True real-time collaboration** — Every keystroke, language switch, and question edit syncs instantly via Socket.io.
- **Sandboxed execution** — Run code with custom input across multiple languages through Judge0, with full stdout/stderr visibility.

---

## Features

### Core Platform

| Module | Description |
|---|---|
| **Real-Time Editing** | Room-based collaborative code editor powered by Monaco Editor and Socket.io, with instant sync across all participants |
| **Interviewer Question Tab** | Interviewer-authored question panel — no hardcoded prompts, fully editable per room |
| **Room Management** | One-click room creation, shareable invite links, and code reset support for restarting the coding area quickly |
| **Multi-Language Editor** | Support for C++, Java, and Python with per-room language switching |

### Execution & Console

| Module | Description |
|---|---|
| **Code Execution** | Run code with custom input via the Judge0 API |
| **I/O Console** | Dedicated console for stdout and stderr with clear separation of program output and errors |

---

## Architecture

```
codecollab/
├── frontend/                   # React application (Vite)
│   ├── src/
│   │   ├── components/         # Editor, console, room UI
│   │   ├── pages/               # Route-level views
│   │   └── lib/                 # Socket client, API client, utilities
│   └── vite.config.ts
│
└── backend/                    # Express + Socket.io server
    ├── routes/                  # REST API route definitions
    ├── controllers/             # Route handlers (room, code execution)
    ├── sockets/                  # Socket.io event handlers
    ├── models/                   # MongoDB-ready model placeholders
    └── services/
        └── judge0.service.ts     # Judge0 API integration
```

### Tech Stack

**Frontend:** React, Vite, Monaco Editor, Socket.io client

**Backend:** Node.js, Express, Socket.io

**Execution:** Judge0 API

**Data:** In-memory room state (MVP), MongoDB-ready model placeholders

---

## Getting Started

### Prerequisites

- Node.js **v18+**
- A Judge0 API instance (public endpoint or self-hosted) for code execution

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Backend Environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set `JUDGE0_URL` and optionally `JUDGE0_API_KEY`.

### 3. Start Frontend and Backend

```bash
npm run dev
```

### 4. Open the App

```
http://localhost:5173
```

---

## Backend API

The REST API handles room lifecycle and code execution.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/room/create` | Create a new room |
| `POST` | `/api/room/join` | Join an existing room |
| `POST` | `/api/room/reset` | Reset the coding area for a room |
| `POST` | `/api/room/question` | Set or update the room's question |
| `POST` | `/api/code/run` | Execute code with custom input via Judge0 |

---

## Socket Events

Real-time collaboration is driven by the following Socket.io events:

| Event | Description |
|---|---|
| `join-room` | Client joins a room's collaborative session |
| `code-change` | Emitted when a participant edits code |
| `code-update` | Broadcast to sync code changes across participants |
| `question-change` | Emitted when the interviewer edits the question |
| `question-update` | Broadcast to sync the question across participants |
| `set-language` | Emitted when the editor language is changed |
| `reset-room` | Emitted to reset the coding area |
| `run-code` | Emitted to trigger code execution |
| `run-result` | Broadcast with the execution result (stdout/stderr) |

---

## Notes

- Room state is kept in memory for MVP speed.
- Judge0 is used for sandboxed code execution.
- MongoDB model files are included as placeholders for future persistence.

---

## Deployment

This project is set up for **Netlify** on the frontend and **Render** on the backend.

### A. Deploy Frontend to Netlify

- Create a new Netlify site from this GitHub repo.
- Set the base directory to `frontend` if Netlify asks for one.
- Set the build command to:
  ```
  npm run build
  ```
- Set the publish directory to:
  ```
  dist
  ```
- Add the environment variable:
  ```
  VITE_BACKEND_URL = https://<your-render-backend-url>
  ```
- Redeploy after saving the settings.

### B. Deploy Backend to Render

- Create a new Web Service on Render (recommended).
- Connect the GitHub repo and set the Build Command to:
  ```
  npm install --prefix backend && npm run build --prefix backend
  ```
  *(backend has no build step by default; install is sufficient)*
- Set the Start Command to:
  ```
  npm run start --workspace backend
  ```
- Environment variables required:

  | Variable | Description |
  |---|---|
  | `JUDGE0_URL` | e.g. `https://ce.judge0.com` or your Judge0 instance |
  | `JUDGE0_API_KEY` | Optional |
  | `FRONTEND_ORIGIN` | Comma-separated allowed origins, e.g. `https://your-frontend.netlify.app` |

- For Socket.IO to work in production, make sure `FRONTEND_ORIGIN` contains your deployed Netlify URL exactly, and the frontend points `VITE_BACKEND_URL` to the Render backend URL.
- Render will provide a `PORT` environment variable automatically.

### C. Quick Local Sanity Checks

Install dependencies for the whole workspace:

```bash
npm install
```

Start locally (concurrently runs frontend + backend):

```bash
npm run dev
```

Build frontend only:

```bash
npm run build --workspace frontend
```

### C. Notes & Troubleshooting

- Make sure `VITE_BACKEND_URL` does not end with a trailing slash. The frontend normalizes it automatically, but it is still best to set it as `https://<your-render-backend-url>`.
- The backend will throw at runtime if `JUDGE0_URL` is not configured; set it before starting.

---

## Roadmap

- [ ] MongoDB persistence for room state
- [ ] Authentication and user accounts
- [ ] Session recording and playback
- [ ] Support for additional languages

---

## License

Distributed under the MIT License.

---

<div align="center">
  <sub>Built for developers practicing and running technical interviews.</sub>
</div>
