Product Feature Plan: DSA Interview SaaS

This document serves as the master roadmap for developing the technical interview platform. It is broken down into four distinct phases, prioritizing the core minimum viable product (MVP) before expanding into enterprise features.

Phase 1: Core MVP (The Foundation)

1. Authentication & Role Management

Objective: Securely manage access for two distinct user types: Interviewers and Candidates.

Technical Approach: Use JWT (JSON Web Tokens) or a managed auth service (like Clerk, Supabase, or Auth0) to handle sessions. Generate unique, time-limited interview link tokens.

User Stories:

As an Interviewer, I want to create an account, log in, and generate a unique interview link to share with candidates.

As a Candidate, I want to click an invite link and join the session using a guest profile (just entering my name) without needing a full account.

Acceptance Criteria:

Interviewer can generate a unique URL.

URL expires after a set duration (e.g., 24 hours).

Role-based UI renders correctly (e.g., Candidates don't see settings or invite buttons).

2. Real-Time Collaborative Editor

Objective: Provide a low-latency, Google Docs-style code editing experience.

Technical Approach: Use a rich text editor framework like Monaco Editor (powers VS Code) or CodeMirror. Implement WebSockets combined with CRDTs (Conflict-free Replicated Data Types) via Yjs to handle concurrent edits without merge conflicts.

User Stories:

As an Interviewer/Candidate, I want to see the other person's cursor and code changes in real-time.

Acceptance Criteria:

Sub-100ms latency on text updates.

Multiple cursors with name tags are visible.

Syntax highlighting for at least 3 major languages (Python, Java, JavaScript/C++).

3. Integrated Text Chat

Objective: Allow in-platform text communication in case of audio/video drops or for sharing quick links/prompts.

Technical Approach: Utilize the existing WebSocket connection used for the code editor to emit and broadcast chat messages.

User Stories:

As a user, I want to send and receive text messages within the interview room.

Acceptance Criteria:

Messages appear instantly.

Timestamp and sender name attached to each message.

Chat history persists for the duration of the interview session.

Phase 2: Interviewer Superpowers (Differentiation)

1. Private Question Banks & Test Cases

Objective: Allow interviewers to load pre-defined problems and automatically test the candidate's code.

Technical Approach: Create a database schema for Questions linked to an Organization. Include fields for description, boilerplate code, public test cases, and hidden test cases.

User Stories:

As an Interviewer, I want to select a question from my library and have the problem statement load into the candidate's view.

As an Interviewer, I want to click "Run Tests" to execute the candidate's code against hidden inputs and see pass/fail results.

Acceptance Criteria:

Questions can be tagged by difficulty and topic.

Hidden tests run securely without exposing the inputs to the candidate's browser console.

2. Integrated Whiteboard

Objective: Facilitate system design or algorithm visualization before coding.

Technical Approach: Embed a lightweight collaborative canvas like Excalidraw or Tldraw using their React packages.

User Stories:

As a user, I want to toggle between the code editor and a whiteboard to draw diagrams.

Acceptance Criteria:

Real-time drawing synchronization.

Basic tools (pen, shapes, text, eraser).

3. Private Notes Panel

Objective: Give the interviewer a dedicated space to write feedback during the call.

Technical Approach: A simple, un-synced Markdown text area on the interviewer's view. Auto-save contents to localStorage or the database every few seconds to prevent data loss.

User Stories:

As an Interviewer, I want a private text box to take notes that the candidate cannot see.

Acceptance Criteria:

Notes are completely invisible to the candidate.

Notes are saved automatically and attached to the final interview report.

Phase 3: Technical Execution & UX

1. Secure Code Execution

Objective: Safely compile and run untrusted code submitted by candidates.

Technical Approach:

Option A (Serverless): Send code to a sandboxed Docker container on AWS Lambda or Fly.io. Kill processes that exceed time limits.

Option B (Client-Side Wasm): Use WebAssembly (e.g., Pyodide for Python) to run the code entirely within the candidate's browser for zero server costs and zero latency.

User Stories:

As a Candidate, I want to run my code and see print statements and errors in a console window.

Acceptance Criteria:

Code execution times out after 10 seconds to prevent infinite loops.

Standard Error (stderr) and Standard Out (stdout) are cleanly captured and displayed.

2. Toggleable Autocomplete

Objective: Allow strict logic testing without AI/IDE crutches.

Technical Approach: Add a toggle in the interviewer settings that dynamically updates the Monaco Editor/CodeMirror configuration to disable intellisense and bracket matching.

User Stories:

As an Interviewer, I want to disable code suggestions to test the candidate's raw syntax knowledge.

Acceptance Criteria:

Toggle immediately enables/disables autocomplete for the candidate in real-time.

Phase 4: Enterprise & B2B Monetization (The Deal-Closers)

1. Interview Replay (Keystroke Logging)

Objective: Allow hiring managers to review how a candidate writes code, not just the final result.

Technical Approach: Record the sequence of Yjs/CRDT document updates (deltas) along with timestamps. Create a custom video-player-like UI that plays back these deltas.

User Stories:

As a Hiring Manager, I want to watch a playback of the coding session to see where the candidate struggled and how they refactored.

Acceptance Criteria:

Playback includes play, pause, and speed controls (1x, 2x, 4x).

A timeline scrubber allows jumping to specific points in the interview.

2. Standardized Rubrics & Scorecards

Objective: Remove bias and standardize candidate evaluations.

Technical Approach: Build a customizable form builder. Allow admins to set a 1-5 rating scale for specific competencies (e.g., Code Quality, Big-O Analysis).

User Stories:

As an Interviewer, I want to fill out a structured scorecard immediately after the interview concludes.

Acceptance Criteria:

Scorecard requires completion before the session can be permanently closed.

Calculates an overall recommendation score (Strong Hire, Hire, No Hire).

3. Applicant Tracking System (ATS) Integrations

Objective: Make the platform an invisible part of the recruiter's workflow.

Technical Approach: Build OAuth integrations and use the APIs of Greenhouse, Lever, and Workday.

User Stories:

As a Recruiter, I want the completed scorecard, private notes, and final code snippet to automatically appear in the candidate's Greenhouse profile.

Acceptance Criteria:

Secure OAuth flow for company admins to link their ATS.

Automatic webhook dispatch when an interview concludes.