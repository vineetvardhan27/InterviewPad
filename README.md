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

## Deployment (Vercel + Heroku)

Use a split deployment:

- Frontend on Vercel
- Backend on Heroku

### 1. Deploy backend on Heroku

- This repository includes a `Procfile` with:
   `web: npm run start --workspace backend`
- Set Heroku environment variables:
   - `PORT` (Heroku sets this automatically)
   - `JUDGE0_URL`
   - `JUDGE0_API_KEY` (optional)
   - `FRONTEND_ORIGIN` as comma-separated allowed origins, for example:
      `https://your-app.vercel.app,https://your-app-git-main-username.vercel.app`

### 2. Deploy frontend on Vercel

- This repository includes `vercel.json` to build the frontend from the monorepo.
- Set Vercel environment variable:
   - `VITE_BACKEND_URL=https://<your-heroku-app>.herokuapp.com`

### 3. Important runtime note

- Room data is in-memory. Restarting the Heroku dyno clears active rooms.
