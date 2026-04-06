import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import axios from "axios";
import { LANGUAGES } from "./constants/languages";
import { API_BASE_URL, socket } from "./lib/socket";

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [username, setUsername] = useState(() => localStorage.getItem("username") || "");
  const [roomId, setRoomId] = useState("");
  const [joinedRoomId, setJoinedRoomId] = useState("");
  const [roomHost, setRoomHost] = useState("");
  const [users, setUsers] = useState([]);
  const [question, setQuestion] = useState("");

  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState("# Write your solution here\n");
  const [stdin, setStdin] = useState("");
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const [compileOutput, setCompileOutput] = useState("");
  const [status, setStatus] = useState("Ready");
  const [isRunning, setIsRunning] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");

  const canCollaborate = useMemo(() => Boolean(joinedRoomId), [joinedRoomId]);
  const isHost = Boolean(canCollaborate && roomHost && username && roomHost === username);
  const inviteLink = useMemo(
    () => (joinedRoomId ? `${window.location.origin}${window.location.pathname}?room=${joinedRoomId}` : ""),
    [joinedRoomId]
  );
  const statusClass = useMemo(() => status.toLowerCase().replace(/[^a-z0-9]+/g, "-"), [status]);

  useEffect(() => {
    localStorage.setItem("theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("username", username);
  }, [username]);

  useEffect(() => {
    const queryRoomId = new URLSearchParams(window.location.search).get("room");
    if (queryRoomId) {
      setRoomId(queryRoomId);
    }
  }, []);

  useEffect(() => {
    const onRoomState = (state) => {
      setJoinedRoomId(state.roomId);
      setRoomId(state.roomId);
      setRoomHost(state.host || "");
      setQuestion(state.question || "");
      setCode(state.code || "");
      setLanguage(state.language || "python");
      setUsers(state.users || []);
    };

    const onCodeUpdate = (payload) => {
      setCode(payload.code || "");
    };

    const onQuestionUpdate = (nextQuestion) => {
      setQuestion(nextQuestion || "");
    };

    const onUsersUpdate = (nextUsers) => {
      setUsers(nextUsers || []);
    };

    const onLanguageUpdate = (nextLanguage) => {
      setLanguage(nextLanguage || "python");
    };

    const onError = (message) => {
      setStatus("Error");
      setSessionMessage(message);
      setStderr(message);
      setIsRunning(false);
    };

    socket.on("room-state", onRoomState);
    socket.on("code-update", onCodeUpdate);
    socket.on("question-update", onQuestionUpdate);
    socket.on("users-update", onUsersUpdate);
    socket.on("language-update", onLanguageUpdate);
    socket.on("error-message", onError);

    return () => {
      socket.off("room-state", onRoomState);
      socket.off("code-update", onCodeUpdate);
      socket.off("question-update", onQuestionUpdate);
      socket.off("users-update", onUsersUpdate);
      socket.off("language-update", onLanguageUpdate);
      socket.off("error-message", onError);
    };
  }, []);

  function syncRoomState(nextRoom) {
    setJoinedRoomId(nextRoom.roomId);
    setRoomId(nextRoom.roomId);
    setRoomHost(nextRoom.host || "");
    setQuestion(nextRoom.question || "");
    setCode(nextRoom.code || "");
    setLanguage(nextRoom.language || "python");
    setUsers(nextRoom.users || []);
  }

  async function handleCreateRoom() {
    const trimmedUsername = username.trim() || "guest";
    setUsername(trimmedUsername);

    try {
      const response = await axios.post(`${API_BASE_URL}/room/create`, {
        username: trimmedUsername,
        question
      });
      syncRoomState(response.data);
      window.history.replaceState({}, "", `${window.location.pathname}?room=${response.data.roomId}`);
      socket.emit("join-room", { roomId: response.data.roomId, username: trimmedUsername });
      setSessionMessage(`Interview room ${response.data.roomId} is ready`);
    } catch (error) {
      setSessionMessage(error.response?.data?.message || "Failed to create interview room");
    }
  }

  async function handleJoinRoom() {
    const trimmedUsername = username.trim() || "guest";
    setUsername(trimmedUsername);
    if (!roomId.trim()) {
      setSessionMessage("Enter a room code to join");
      return;
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/room/join`, {
        roomId: roomId.trim(),
        username: trimmedUsername
      });
      syncRoomState(response.data);
      window.history.replaceState({}, "", `${window.location.pathname}?room=${response.data.roomId}`);
      socket.emit("join-room", { roomId: response.data.roomId, username: trimmedUsername });
      setSessionMessage(`Joined interview room ${response.data.roomId}`);
    } catch (error) {
      setSessionMessage(error.response?.data?.message || "Unable to join room");
    }
  }

  async function handleCopyInvite() {
    if (!inviteLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteLink);
      setSessionMessage("Invite link copied");
    } catch {
      setSessionMessage("Copy the invite link from the address bar");
    }
  }

  function handleQuestionChange(event) {
    const nextQuestion = event.target.value;
    setQuestion(nextQuestion);
    if (canCollaborate && isHost) {
      socket.emit("question-change", {
        roomId: joinedRoomId,
        question: nextQuestion
      });
    }
  }

  function handleCodeChange(nextCode) {
    const value = nextCode || "";
    setCode(value);
    if (canCollaborate) {
      socket.emit("code-change", { roomId: joinedRoomId, code: value });
    }
  }

  function handleLanguageChange(event) {
    const nextLanguage = event.target.value;
    setLanguage(nextLanguage);
    if (canCollaborate) {
      socket.emit("set-language", { roomId: joinedRoomId, language: nextLanguage });
    }
  }

  async function handleResetCode() {
    if (!joinedRoomId) {
      return;
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/room/reset`, { roomId: joinedRoomId });
      syncRoomState(response.data);
      socket.emit("reset-room", { roomId: joinedRoomId });
      setStatus("Ready");
      setStdout("");
      setStderr("");
      setCompileOutput("");
      setSessionMessage("Code editor reset");
    } catch (error) {
      setSessionMessage(error.response?.data?.message || "Unable to reset room code");
    }
  }

  async function handleRunCode() {
    setIsRunning(true);
    setStatus("Running...");
    setStdout("");
    setStderr("");
    setCompileOutput("");

    try {
      const payload = {
        sourceCode: code,
        language,
        stdin
      };
      if (joinedRoomId) {
        payload.roomId = joinedRoomId;
      }

      const response = await axios.post(`${API_BASE_URL}/code/run`, payload);
      setStatus(response.data.status || "Done");
      setStdout(response.data.stdout || "");
      setStderr(response.data.stderr || "");
      setCompileOutput(response.data.compileOutput || "");
    } catch (error) {
      setStatus("Error");
      setStderr(error.response?.data?.message || "Code execution failed");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="app" data-theme={theme}>
      <header className="navbar">
        <div className="navbar-content">
          <div>
            <h1 className="brand">Interview Pad</h1>
            <p className="brand-subtitle">Interviewer writes the question, candidate solves live.</p>
          </div>
          <button
            className="theme-btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      <main className="container">
        <aside className="sidebar">
          <section className="card room-section">
            <div className="card-heading">
              <h2 className="section-title">Interview setup</h2>
              <span className="section-chip">Live</span>
            </div>

            <div className="form-group">
              <label className="field-label" htmlFor="username">Your name</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Interviewer or candidate"
                maxLength="30"
                className="input-field"
              />
            </div>

            <div className="form-group">
              <label className="field-label" htmlFor="roomId">Room code</label>
              <input
                id="roomId"
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Paste an interview room code"
                className="input-field"
              />
            </div>

            <div className="button-group">
              <button className="btn-primary" onClick={handleCreateRoom}>
                Start interview
              </button>
              <button className="btn-secondary" onClick={handleJoinRoom}>
                Join room
              </button>
            </div>

            <div className="button-group secondary-actions">
              <button className="btn-tertiary" onClick={handleCopyInvite} disabled={!inviteLink}>
                Copy invite
              </button>
              <button className="btn-tertiary" onClick={handleResetCode} disabled={!joinedRoomId}>
                Reset code
              </button>
            </div>

            <div className="session-info">
              <div className="info-row">
                <span className="info-label">Session</span>
                <span className="info-value">{joinedRoomId || "Not joined"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Role</span>
                <span className="info-value">{joinedRoomId ? (isHost ? "Interviewer" : "Candidate") : "Visitor"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Participants</span>
                <div className="participants-list">
                  {users.length > 0 ? users.map((participant) => (
                    <span key={participant} className="participant-badge">{participant.slice(0, 1).toUpperCase()}</span>
                  )) : (
                    <span className="info-value">No one yet</span>
                  )}
                </div>
              </div>
              {inviteLink && (
                <div className="invite-link-block">
                  <span className="info-label">Invite</span>
                  <span className="invite-link-text">{inviteLink}</span>
                </div>
              )}
            </div>
          </section>

          <section className="card problem-section">
            <div className="card-heading">
              <h2 className="section-title">Question</h2>
              <span className="section-chip accent">{isHost ? "Editable" : "Read only"}</span>
            </div>
            <textarea
              value={question}
              onChange={handleQuestionChange}
              placeholder="Interviewer: paste the interview question here"
              className="question-textarea"
              readOnly={canCollaborate && !isHost}
            />
          </section>
        </aside>

        <section className="editor-workspace">
          <div className="editor-toolbar">
            <div className="toolbar-left">
              <select
                value={language}
                onChange={handleLanguageChange}
                className="language-dropdown"
              >
                {LANGUAGES.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <div className="status-indicator">
                <span className={`status-dot status-${statusClass}`}></span>
                <span className="status-text">{status}</span>
              </div>
            </div>
            <button
              className="btn-run"
              onClick={handleRunCode}
              disabled={isRunning}
            >
              {isRunning ? "Running" : "Run code"}
            </button>
          </div>

          {sessionMessage && <div className="notice-bar">{sessionMessage}</div>}

          <div className="workspace-grid">
            <div className="editor-section">
              <Editor
                height="100%"
                language={language === "cpp" ? "cpp" : language}
                value={code}
                onChange={handleCodeChange}
                theme={theme === "dark" ? "vs-dark" : "vs"}
                options={{
                  minimap: { enabled: false },
                  automaticLayout: true,
                  fontSize: 14,
                  fontFamily: "'Fira Code', 'Roboto Mono', monospace",
                  lineHeight: 1.6,
                  wordWrap: "on",
                  padding: { top: 16, bottom: 16 },
                  scrollBeyondLastLine: false,
                  smoothScrolling: true
                }}
              />
            </div>

            <div className="console-section">
              <div className="console-tabs">
                <div className="tab-item active">
                  <span>Input</span>
                </div>
              </div>
              <textarea
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                placeholder="Optional stdin input"
                className="console-input"
              />

              <div className="console-tabs spaced">
                <div className="tab-item active">
                  <span>Output</span>
                </div>
              </div>
              <div className="console-output stdout">
                {stdout || "(no output)"}
              </div>

              {stderr && (
                <>
                  <div className="console-tabs spaced">
                    <div className="tab-item error">
                      <span>Errors</span>
                    </div>
                  </div>
                  <div className="console-output stderr">{stderr}</div>
                </>
              )}

              {compileOutput && (
                <>
                  <div className="console-tabs spaced">
                    <div className="tab-item warning">
                      <span>Build</span>
                    </div>
                  </div>
                  <div className="console-output compile">{compileOutput}</div>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
