# Collaborative Coding Platform

A full-stack collaborative coding platform for interview practice and pair problem solving with an interview-first room flow.

## Stack

- Frontend: React + Vite + Monaco Editor + Socket.io client
- Backend: Node.js + Express + Socket.io
- Execution: Judge0 API
- Data: In-memory room state (MVP), MongoDB-ready model placeholders

## Features

- Real-time room-based collaborative editing
- Interviewer-authored question tab (no hardcoded prompts)
- One-click room creation and invite-link sharing
- Code reset support for restarting the coding area quickly
- Multi-language editor (C++, Java, Python)
- Run code with custom input through Judge0
- Input/output console with stdout and stderr

## Project Structure

- frontend: React application
- backend: Express + Socket.io server

## Setup

1. Install dependencies:
   npm install

2. Configure backend environment:
   - Copy backend/.env.example to backend/.env
   - Set JUDGE0_URL and optional JUDGE0_API_KEY

3. Start both frontend and backend:
   npm run dev

4. Open frontend in browser:
   http://localhost:5173

## Backend API

- POST /api/room/create
- POST /api/room/join
- POST /api/room/reset
- POST /api/room/question
- POST /api/code/run

## Socket Events

- join-room
- code-change
- code-update
- question-change
- question-update
- set-language
- reset-room
- run-code
- run-result

## Notes

- Room state is kept in memory for MVP speed.
- Judge0 is used for sandboxed code execution.
- MongoDB model files are included as placeholders for persistence.

## Deployment

This project is set up for Netlify on the frontend and Render on the backend.

**A. Deploy frontend to Netlify**

- Create a new Netlify site from this GitHub repo.
- Set the base directory to `frontend` if Netlify asks for one.
- Set the build command to:
   - `npm run build`
- Set the publish directory to:
   - `dist`
- Add the environment variable:
   - `VITE_BACKEND_URL` = `https://<your-render-backend-url>`
- Redeploy after saving the settings.

**B. Deploy backend to Render**

- Create a new Web Service on Render (recommended).
- Connect the GitHub repo and set the Build Command to:
   - `npm install --prefix backend && npm run build --prefix backend` (backend has no build step by default; install is sufficient)
- Set the Start Command to:
   - `npm run start --workspace backend`
- Environment variables required:
   - `JUDGE0_URL` (e.g., `https://ce.judge0.com` or your Judge0 instance)
   - `JUDGE0_API_KEY` (optional)
   - `FRONTEND_ORIGIN` (comma-separated allowed origins, e.g. `https://your-frontend.netlify.app`)
- For Socket.IO to work in production, make sure `FRONTEND_ORIGIN` contains your deployed Netlify URL exactly, and the frontend points `VITE_BACKEND_URL` to the Render backend URL.
- Render will provide a `PORT` environment variable automatically.

**C. Quick local sanity checks**

- Install dependencies for the whole workspace:

```bash
npm install
```

- Start locally (concurrently runs frontend + backend):

```bash
npm run dev
```

- Build frontend only:

```bash
npm run build --workspace frontend
```

**C. Notes & troubleshooting**

- Make sure `VITE_BACKEND_URL` does not end with a trailing slash. The frontend now normalizes it automatically, but it is still best to set it as `https://<your-render-backend-url>`.
- The backend will throw at runtime if `JUDGE0_URL` is not configured; set it before starting.

