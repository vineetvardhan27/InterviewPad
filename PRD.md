# Product Requirements Document (PRD) — InterviewPad

## 1. Executive Summary

**InterviewPad** is a real-time, low-latency collaborative code editing platform built specifically for technical interviews (DSA and system coding). It enables interviewers to set up live coding sessions, share problem statements, observe candidate logic in real time via shared Monaco Editor canvases, run code across multiple languages using sandboxed Judge0 execution, and communicate via integrated text chat.

---

## 2. Target Personas & Use Cases

### 2.1 Personas
* **Interviewer (Host)**: Technical recruiters, engineering managers, or senior developers evaluating candidates. Requires room management capabilities, question control, code reset permissions, and candidate monitoring.
* **Candidate (Guest/User)**: Job applicants taking live coding assessments. Requires seamless low-friction access (guest mode or registered account), intuitive editor UX, language selection, code execution, and chat access.
* **Panelist / Observer**: Additional team members joining to watch the interview live without interrupting the active candidate.

### 2.2 Core Use Cases
1. **Instant Session Setup**: Interviewer logs in, clicks "Create New Room", and shares an auto-generated invite link with the candidate.
2. **Low-Friction Candidate Join**: Candidate opens the link and joins instantly by entering their name (Guest Mode) or signing in.
3. **Live Collaborative Coding**: Candidate types code while the interviewer sees real-time remote cursor highlights, text edits, and selections without desync or lag.
4. **Question Delivery**: Interviewer inputs or modifies the problem statement, which updates live on the candidate's sidebar.
5. **Sandboxed Execution**: Candidate or interviewer runs code against sample inputs (`stdin`) and receives clean, structured output (`stdout`, `stderr`, and compilation logs) for C++, Java, and Python.
6. **In-App Communication**: Text chat system with typing indicators and catch-up capabilities for lost connection recovery.

---

## 3. Product Features & Functional Requirements

### 3.1 Authentication & User Access
| Feature ID | Requirement | Description |
|---|---|---|
| **AUTH-01** | JWT Authentication | Interviewers register/login with username, email, and password. JWT tokens are stored securely in `localStorage`. |
| **AUTH-02** | Guest Access | Candidates can join any valid room token without creating an account by providing a display name. |
| **AUTH-03** | Role Differentiation | Interviewers hold Host permissions (create room, set question); Candidates operate as peer coders. |

### 3.2 Real-Time Collaboration Engine
| Feature ID | Requirement | Description |
|---|---|---|
| **SYNC-01** | CRDT Editor Sync | Concurrent edits use Yjs (Y-CRDT) to guarantee convergence without merge conflicts or lost keystrokes. |
| **SYNC-02** | Remote Cursors & Selection | Remote peer cursors are rendered in Monaco Editor with custom colored badges showing user names. |
| **SYNC-03** | Graceful Disconnect Window | When a socket disconnects, a 60-second grace window prevents immediate removal, preserving room state on accidental refresh. |
| **SYNC-04** | Catchup & Resync | Reconnecting clients automatically request a full Yjs state vector update (`yjs-sync-request`) and missed chat logs (`chat-catchup`). |

### 3.3 Code Execution Engine
| Feature ID | Requirement | Description |
|---|---|---|
| **EXEC-01** | Multi-Language Support | Official support for C++ (GCC 9.2), Java (OpenJDK 13), and Python (3.8). |
| **EXEC-02** | Sandboxed Runner | Execution delegated to Judge0 CE REST API with configurable timeout limits. |
| **EXEC-03** | Structured Feedback | Separate UI panels for `stdout`, `stderr` (runtime errors), and `compileOutput` (build failures). |
| **EXEC-04** | Rate Limiting | In-memory sliding-window rate limiter (10 executions per minute per client IP) to prevent API abuse. |

### 3.4 In-App Chat & Presence
| Feature ID | Requirement | Description |
|---|---|---|
| **CHAT-01** | Integrated Room Chat | Real-time text messaging per room with timestamp and sender tags. |
| **CHAT-02** | Typing Indicators | Shows dynamic "X is typing..." alerts when peers type in the chat input. |
| **CHAT-03** | Unread Notifications | Badge counter on the chat toggle button when new messages arrive while the chat panel is closed. |

---

## 4. Non-Functional Requirements (NFRs)

* **Performance & Latency**: Text update synchronization latency must remain below **100ms** over regional WebSocket connections.
* **Availability & Degradation**: Database layer must support **graceful fallback** — if MongoDB is unreachable, the system automatically falls back to in-memory state storage without throwing fatal server crashes.
* **Security**: Untrusted code MUST be isolated within sandboxed environments (Judge0 execution containers). All API routes must enforce origin validation and JWT verification where required.
* **Usability & UX**: Fully responsive single-page interface supporting both **Dark** and **Light** themes.

---

## 5. Success Metrics & Key Performance Indicators (KPIs)

1. **State Convergence Rate**: 100% document consistency across concurrent sessions without desync failures.
2. **Execution Response Time**: Sub-3-second round-trip time for code submission to result rendering.
3. **Session Uptime**: Zero session termination during 60-second transient network reconnections.
