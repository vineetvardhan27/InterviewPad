import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Editor from "@monaco-editor/react";
import axios from "axios";
import { LANGUAGES } from "./constants/languages";
import { API_BASE_URL, socket, getAuthHeaders, reconnectSocket } from "./lib/socket";

/* ------------------------------------------------------------------ */
/*  Cursor decoration helpers                                          */
/* ------------------------------------------------------------------ */
function buildCursorDecorations(remoteCursors, monacoRef) {
  if (!monacoRef.current) return [];
  const decorations = [];
  for (const [username, data] of Object.entries(remoteCursors)) {
    if (!data.line || !data.column) continue;
    decorations.push({
      range: new monacoRef.current.Range(data.line, data.column, data.line, data.column + 1),
      options: {
        className: `remote-cursor`,
        beforeContentClassName: `remote-cursor-line`,
        hoverMessage: { value: username },
        stickiness: 1,
        after: {
          content: ` ${username}`,
          inlineClassName: "remote-cursor-label",
          cursorStops: 0
        }
      }
    });
  }
  return decorations;
}

/* ------------------------------------------------------------------ */
/*  Main App                                                           */
/* ------------------------------------------------------------------ */
function App() {
  const normalizeLanguage = (l) => (l === "c++" ? "cpp" : l || "cpp");

  // Theme
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");

  // Auth state
  const [authMode, setAuthMode] = useState("login"); // login | register | none
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authForm, setAuthForm] = useState({ username: "", email: "", password: "" });

  // Room state
  const [username, setUsername] = useState(() => localStorage.getItem("username") || "");
  const [roomId, setRoomId] = useState("");
  const [joinedRoomId, setJoinedRoomId] = useState("");
  const [roomHost, setRoomHost] = useState("");
  const [users, setUsers] = useState([]);
  const [question, setQuestion] = useState("");

  // Editor state
  const [language, setLanguage] = useState("cpp");
  const [code, setCode] = useState("# Write your solution here\n");
  const [stdin, setStdin] = useState("");
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const [compileOutput, setCompileOutput] = useState("");
  const [status, setStatus] = useState("Ready");
  const [isRunning, setIsRunning] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");

  // Chat state
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState([]);
  const chatEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Cursor presence state
  const [remoteCursors, setRemoteCursors] = useState({});
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);

  const canCollaborate = useMemo(() => Boolean(joinedRoomId), [joinedRoomId]);
  const isHost = Boolean(canCollaborate && roomHost && username && roomHost === username);
  const inviteLink = useMemo(
    () => (joinedRoomId ? `${window.location.origin}${window.location.pathname}?room=${joinedRoomId}` : ""),
    [joinedRoomId]
  );
  const statusClass = useMemo(() => status.toLowerCase().replace(/[^a-z0-9]+/g, "-"), [status]);

  /* ---- Theme persistence ---- */
  useEffect(() => {
    localStorage.setItem("theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => { localStorage.setItem("username", username); }, [username]);

  /* ---- Check auth on mount ---- */
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) { setAuthLoading(false); return; }
    axios.get(`${API_BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        setAuthUser(res.data.user);
        setUsername(res.data.user.username);
        setAuthMode("none");
      })
      .catch(() => { localStorage.removeItem("auth_token"); })
      .finally(() => setAuthLoading(false));
  }, []);

  /* ---- URL room param ---- */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("room");
    if (q) setRoomId(q);
  }, []);

  /* ---- Socket listeners ---- */
  useEffect(() => {
    const onRoomState = (state) => {
      setJoinedRoomId(state.roomId);
      setRoomId(state.roomId);
      setRoomHost(state.host || "");
      setQuestion(state.question || "");
      setCode(state.code || "");
      setLanguage(normalizeLanguage(state.language));
      setUsers(state.users || []);
      setMessages(state.messages || []);
    };
    const onCodeUpdate = (p) => setCode(p.code || "");
    const onQuestionUpdate = (q) => setQuestion(q || "");
    const onUsersUpdate = (u) => setUsers(u || []);
    const onLanguageUpdate = (l) => setLanguage(normalizeLanguage(l));
    const onError = (msg) => { setStatus("Error"); setSessionMessage(msg); setStderr(msg); setIsRunning(false); };

    // Cursor events
    const onCursorUpdate = ({ username: u, position }) => {
      setRemoteCursors((prev) => ({ ...prev, [u]: position }));
    };
    const onCursorRemove = ({ username: u }) => {
      setRemoteCursors((prev) => { const n = { ...prev }; delete n[u]; return n; });
    };
    const onCursorsSync = (cursors) => setRemoteCursors(cursors);

    // Chat events
    const onChatUpdate = (msg) => {
      setMessages((prev) => [...prev.slice(-199), msg]);
      if (!chatOpen) setUnreadCount((c) => c + 1);
    };
    const onChatTyping = ({ username: u, isTyping }) => {
      setTypingUsers((prev) =>
        isTyping ? (prev.includes(u) ? prev : [...prev, u]) : prev.filter((x) => x !== u)
      );
    };

    socket.on("room-state", onRoomState);
    socket.on("code-update", onCodeUpdate);
    socket.on("question-update", onQuestionUpdate);
    socket.on("users-update", onUsersUpdate);
    socket.on("language-update", onLanguageUpdate);
    socket.on("error-message", onError);
    socket.on("cursor-update", onCursorUpdate);
    socket.on("cursor-remove", onCursorRemove);
    socket.on("cursors-sync", onCursorsSync);
    socket.on("chat-update", onChatUpdate);
    socket.on("chat-typing-update", onChatTyping);

    return () => {
      socket.off("room-state", onRoomState);
      socket.off("code-update", onCodeUpdate);
      socket.off("question-update", onQuestionUpdate);
      socket.off("users-update", onUsersUpdate);
      socket.off("language-update", onLanguageUpdate);
      socket.off("error-message", onError);
      socket.off("cursor-update", onCursorUpdate);
      socket.off("cursor-remove", onCursorRemove);
      socket.off("cursors-sync", onCursorsSync);
      socket.off("chat-update", onChatUpdate);
      socket.off("chat-typing-update", onChatTyping);
    };
  }, [chatOpen]);

  /* ---- Update cursor decorations ---- */
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const decorations = buildCursorDecorations(remoteCursors, monacoRef);
    decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, decorations);
  }, [remoteCursors]);

  /* ---- Scroll chat to bottom ---- */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ---- Auth handlers ---- */
  async function handleAuth(e) {
    e.preventDefault();
    setAuthError("");
    const endpoint = authMode === "register" ? "/auth/register" : "/auth/login";
    const body = authMode === "register"
      ? { username: authForm.username, email: authForm.email, password: authForm.password }
      : { email: authForm.email, password: authForm.password };
    try {
      const res = await axios.post(`${API_BASE_URL}${endpoint}`, body);
      localStorage.setItem("auth_token", res.data.token);
      setAuthUser(res.data.user);
      setUsername(res.data.user.username);
      setAuthMode("none");
      reconnectSocket();
    } catch (err) {
      setAuthError(err.response?.data?.message || "Authentication failed");
    }
  }

  function handleLogout() {
    localStorage.removeItem("auth_token");
    setAuthUser(null);
    setAuthMode("login");
    setJoinedRoomId("");
    setUsers([]);
    setMessages([]);
    reconnectSocket();
  }

  function handleGuestContinue() {
    if (!username.trim()) { setAuthError("Enter a name to continue as guest"); return; }
    setAuthMode("none");
  }

  /* ---- Room handlers ---- */
  function syncRoomState(r) {
    setJoinedRoomId(r.roomId); setRoomId(r.roomId); setRoomHost(r.host || "");
    setQuestion(r.question || ""); setCode(r.code || "");
    setLanguage(normalizeLanguage(r.language)); setUsers(r.users || []);
    setMessages(r.messages || []);
  }

  async function handleCreateRoom() {
    const name = authUser?.username || username.trim() || "guest";
    setUsername(name);
    try {
      const res = await axios.post(`${API_BASE_URL}/room/create`, { username: name, question }, { headers: getAuthHeaders() });
      syncRoomState(res.data);
      window.history.replaceState({}, "", `${window.location.pathname}?room=${res.data.roomId}`);
      socket.emit("join-room", { roomId: res.data.roomId, username: name });
      setSessionMessage(`Interview room ${res.data.roomId} is ready`);
    } catch (err) { setSessionMessage(err.response?.data?.message || "Failed to create room"); }
  }

  async function handleJoinRoom() {
    const name = authUser?.username || username.trim() || "guest";
    setUsername(name);
    if (!roomId.trim()) { setSessionMessage("Enter a room code to join"); return; }
    try {
      const res = await axios.post(`${API_BASE_URL}/room/join`, { roomId: roomId.trim(), username: name }, { headers: getAuthHeaders() });
      syncRoomState(res.data);
      window.history.replaceState({}, "", `${window.location.pathname}?room=${res.data.roomId}`);
      socket.emit("join-room", { roomId: res.data.roomId, username: name });
      setSessionMessage(`Joined room ${res.data.roomId}`);
    } catch (err) { setSessionMessage(err.response?.data?.message || "Unable to join room"); }
  }

  async function handleCopyInvite() {
    if (!inviteLink) return;
    try { await navigator.clipboard.writeText(inviteLink); setSessionMessage("Invite link copied"); }
    catch { setSessionMessage("Copy the invite link from the address bar"); }
  }

  function handleQuestionChange(e) {
    const q = e.target.value; setQuestion(q);
    if (canCollaborate && isHost) socket.emit("question-change", { roomId: joinedRoomId, question: q });
  }

  function handleCodeChange(nextCode) {
    const v = nextCode || ""; setCode(v);
    if (canCollaborate) socket.emit("code-change", { roomId: joinedRoomId, code: v });
  }

  function handleLanguageChange(e) {
    const l = e.target.value; setLanguage(l);
    if (canCollaborate) socket.emit("set-language", { roomId: joinedRoomId, language: l });
  }

  async function handleResetCode() {
    if (!joinedRoomId) return;
    try {
      const res = await axios.post(`${API_BASE_URL}/room/reset`, { roomId: joinedRoomId });
      syncRoomState(res.data); socket.emit("reset-room", { roomId: joinedRoomId });
      setStatus("Ready"); setStdout(""); setStderr(""); setCompileOutput(""); setSessionMessage("Code editor reset");
    } catch (err) { setSessionMessage(err.response?.data?.message || "Unable to reset"); }
  }

  async function handleRunCode() {
    setIsRunning(true); setStatus("Running..."); setStdout(""); setStderr(""); setCompileOutput("");
    try {
      const payload = { sourceCode: code, language, stdin };
      if (joinedRoomId) payload.roomId = joinedRoomId;
      const res = await axios.post(`${API_BASE_URL}/code/run`, payload);
      setStatus(res.data.status || "Done"); setStdout(res.data.stdout || "");
      setStderr(res.data.stderr || ""); setCompileOutput(res.data.compileOutput || "");
    } catch (err) { setStatus("Error"); setStderr(err.response?.data?.message || "Execution failed"); }
    finally { setIsRunning(false); }
  }

  /* ---- Editor mount (cursor tracking) ---- */
  function handleEditorMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.onDidChangeCursorPosition((e) => {
      if (!joinedRoomId) return;
      socket.emit("cursor-move", {
        roomId: joinedRoomId,
        position: { line: e.position.lineNumber, column: e.position.column }
      });
    });
    editor.onDidChangeCursorSelection((e) => {
      if (!joinedRoomId) return;
      const sel = e.selection;
      if (sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn) return;
      socket.emit("selection-change", {
        roomId: joinedRoomId,
        selection: {
          startLine: sel.startLineNumber, startColumn: sel.startColumn,
          endLine: sel.endLineNumber, endColumn: sel.endColumn
        }
      });
    });
  }

  /* ---- Chat handlers ---- */
  function handleSendChat(e) {
    e.preventDefault();
    if (!chatInput.trim() || !joinedRoomId) return;
    socket.emit("chat-message", { roomId: joinedRoomId, text: chatInput.trim() });
    setChatInput("");
    socket.emit("chat-typing", { roomId: joinedRoomId, isTyping: false });
  }

  function handleChatInputChange(e) {
    setChatInput(e.target.value);
    if (!joinedRoomId) return;
    socket.emit("chat-typing", { roomId: joinedRoomId, isTyping: true });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("chat-typing", { roomId: joinedRoomId, isTyping: false });
    }, 2000);
  }

  function toggleChat() {
    setChatOpen((o) => !o);
    if (!chatOpen) setUnreadCount(0);
  }

  /* ---- Auth screen ---- */
  if (authLoading) {
    return <div className="app" data-theme={theme}><div className="auth-loading"><div className="spinner" /><p>Loading...</p></div></div>;
  }

  if (authMode !== "none") {
    return (
      <div className="app" data-theme={theme}>
        <div className="auth-backdrop">
          <div className="auth-card">
            <h1 className="auth-brand">Interview Pad</h1>
            <p className="auth-subtitle">Real-time collaborative coding for interviews</p>
            <div className="auth-tabs">
              <button className={`auth-tab ${authMode === "login" ? "active" : ""}`} onClick={() => { setAuthMode("login"); setAuthError(""); }}>Sign In</button>
              <button className={`auth-tab ${authMode === "register" ? "active" : ""}`} onClick={() => { setAuthMode("register"); setAuthError(""); }}>Register</button>
            </div>
            {authError && <div className="auth-error">{authError}</div>}
            <form onSubmit={handleAuth} className="auth-form">
              {authMode === "register" && (
                <input type="text" placeholder="Username" value={authForm.username}
                  onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
                  className="input-field" required minLength={2} maxLength={30} />
              )}
              <input type="email" placeholder="Email" value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                className="input-field" required />
              <input type="password" placeholder="Password" value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                className="input-field" required minLength={6} />
              <button type="submit" className="btn-primary auth-submit">
                {authMode === "register" ? "Create Account" : "Sign In"}
              </button>
            </form>
            <div className="auth-divider"><span>or</span></div>
            <div className="guest-section">
              <input type="text" placeholder="Enter a name" value={username}
                onChange={(e) => setUsername(e.target.value)} className="input-field" maxLength={30} />
              <button className="btn-secondary" onClick={handleGuestContinue}>Continue as Guest</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Main UI ---- */
  return (
    <div className="app" data-theme={theme}>
      <header className="navbar">
        <div className="navbar-content">
          <div>
            <h1 className="brand">Interview Pad</h1>
            <p className="brand-subtitle">Interviewer writes the question, candidate solves live.</p>
          </div>
          <div className="navbar-actions">
            {authUser && <span className="user-badge">{authUser.username}</span>}
            <button className="theme-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? "☀️" : "🌙"}</button>
            {authUser ? (
              <button className="btn-tertiary" onClick={handleLogout}>Logout</button>
            ) : (
              <button className="btn-tertiary" onClick={() => setAuthMode("login")}>Sign In</button>
            )}
          </div>
        </div>
      </header>

      <main className="container">
        <aside className="sidebar">
          <section className="card room-section">
            <div className="card-heading">
              <h2 className="section-title">Interview setup</h2>
              <span className="section-chip">Live</span>
            </div>
            {!authUser && (
              <div className="form-group">
                <label className="field-label" htmlFor="username">Your name</label>
                <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="Interviewer or candidate" maxLength="30" className="input-field" />
              </div>
            )}
            <div className="form-group">
              <label className="field-label" htmlFor="roomId">Room code</label>
              <input id="roomId" type="text" value={roomId} onChange={(e) => setRoomId(e.target.value)}
                placeholder="Paste an interview room code" className="input-field" />
            </div>
            <div className="button-group">
              <button className="btn-primary" onClick={handleCreateRoom}>Start interview</button>
              <button className="btn-secondary" onClick={handleJoinRoom}>Join room</button>
            </div>
            <div className="button-group secondary-actions">
              <button className="btn-tertiary" onClick={handleCopyInvite} disabled={!inviteLink}>Copy invite</button>
              <button className="btn-tertiary" onClick={handleResetCode} disabled={!joinedRoomId}>Reset code</button>
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
                  {users.length > 0 ? users.map((p) => (
                    <span key={p} className="participant-badge" title={p}>{p.slice(0, 1).toUpperCase()}</span>
                  )) : <span className="info-value">No one yet</span>}
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
            <textarea value={question} onChange={handleQuestionChange}
              placeholder="Interviewer: paste the interview question here"
              className="question-textarea" readOnly={canCollaborate && !isHost} />
          </section>
        </aside>

        <section className="editor-workspace">
          <div className="editor-toolbar">
            <div className="toolbar-left">
              <select value={language} onChange={handleLanguageChange} className="language-dropdown">
                {LANGUAGES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
              </select>
              <div className="status-indicator">
                <span className={`status-dot status-${statusClass}`}></span>
                <span className="status-text">{status}</span>
              </div>
            </div>
            <div className="toolbar-right">
              {joinedRoomId && (
                <button className={`btn-chat ${chatOpen ? "active" : ""}`} onClick={toggleChat}>
                  💬 Chat {unreadCount > 0 && <span className="chat-badge">{unreadCount}</span>}
                </button>
              )}
              <button className="btn-run" onClick={handleRunCode} disabled={isRunning}>
                {isRunning ? "Running" : "▶ Run code"}
              </button>
            </div>
          </div>

          {sessionMessage && <div className="notice-bar">{sessionMessage}</div>}

          <div className="workspace-grid">
            <div className={`editor-panel ${chatOpen ? "with-chat" : ""}`}>
              <div className="editor-section">
                <Editor height="100%" language={language} value={code} onChange={handleCodeChange}
                  theme={theme === "dark" ? "vs-dark" : "vs"} onMount={handleEditorMount}
                  options={{
                    minimap: { enabled: false }, automaticLayout: true, fontSize: 14,
                    fontFamily: "'Fira Code', 'Roboto Mono', monospace", lineHeight: 1.6,
                    wordWrap: "on", padding: { top: 16, bottom: 16 },
                    scrollBeyondLastLine: false, smoothScrolling: true
                  }} />
              </div>
              <div className="console-section">
                <div className="console-tabs"><div className="tab-item active"><span>Input</span></div></div>
                <textarea value={stdin} onChange={(e) => setStdin(e.target.value)}
                  placeholder="Optional stdin input" className="console-input" />
                <div className="console-tabs spaced"><div className="tab-item active"><span>Output</span></div></div>
                <div className="console-output stdout">{stdout || "(no output)"}</div>
                {stderr && (<><div className="console-tabs spaced"><div className="tab-item error"><span>Errors</span></div></div><div className="console-output stderr">{stderr}</div></>)}
                {compileOutput && (<><div className="console-tabs spaced"><div className="tab-item warning"><span>Build</span></div></div><div className="console-output compile">{compileOutput}</div></>)}
              </div>
            </div>

            {chatOpen && joinedRoomId && (
              <div className="chat-panel">
                <div className="chat-header">
                  <h3>Room Chat</h3>
                  <button className="chat-close" onClick={toggleChat}>✕</button>
                </div>
                <div className="chat-messages">
                  {messages.map((m) => (
                    <div key={m.id} className={`chat-msg ${m.sender === "system" ? "system" : m.sender === username ? "own" : ""}`}>
                      {m.sender !== "system" && <span className="chat-sender">{m.sender}</span>}
                      <span className="chat-text">{m.text}</span>
                      <span className="chat-time">{new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                {typingUsers.length > 0 && (
                  <div className="chat-typing">{typingUsers.join(", ")} typing...</div>
                )}
                <form className="chat-input-bar" onSubmit={handleSendChat}>
                  <input type="text" value={chatInput} onChange={handleChatInputChange}
                    placeholder="Type a message..." className="chat-input" maxLength={2000} />
                  <button type="submit" className="chat-send" disabled={!chatInput.trim()}>↑</button>
                </form>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
