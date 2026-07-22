import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Sun, Moon } from "lucide-react";
import axios from "axios";
import { MonacoBinding } from "y-monaco";
import * as Y from "yjs";
import { API_BASE_URL, socket, getAuthHeaders, reconnectSocket } from "./lib/socket";
import {
  initYDoc,
  applyFullSync,
  applyRemoteUpdate,
  applyAwarenessUpdate,
  setAwarenessUser,
  broadcastAwareness,
  requestResync,
  getYText,
  getYDoc,
  getAwareness,
  getCode,
  destroyYDoc
} from "./lib/yjsProvider";

import AuthScreen from "./components/AuthScreen";
import LandingPage from "./components/LandingPage";
import Sidebar from "./components/Sidebar";
import EditorPanel from "./components/EditorPanel";
import ChatPanel from "./components/ChatPanel";

const normalizeLanguage = (l) => (l === "c++" ? "cpp" : l || "cpp");

/* ------------------------------------------------------------------ */
/*  App — State manager & socket orchestrator                          */
/* ------------------------------------------------------------------ */
function App() {
  // ---- Theme ----
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");

  // ---- Auth state ----
  const [authMode, setAuthMode] = useState("landing");
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authForm, setAuthForm] = useState({ username: "", email: "", password: "", role: "candidate" });

  // ---- Room state ----
  const [username, setUsername] = useState(() => localStorage.getItem("username") || "");
  const [roomId, setRoomId] = useState("");
  const [joinedRoomId, setJoinedRoomId] = useState("");
  const [roomHost, setRoomHost] = useState("");
  const [users, setUsers] = useState([]);
  const [question, setQuestion] = useState("");

  // ---- Editor state ----
  const [language, setLanguage] = useState("cpp");
  const [code, setCode] = useState("# Write your solution here\n");
  const [stdin, setStdin] = useState("");
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const [compileOutput, setCompileOutput] = useState("");
  const [status, setStatus] = useState("Ready");
  const [isRunning, setIsRunning] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");

  // ---- Chat state ----
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState([]);

  // ---- Connection state ----
  const [connectionStatus, setConnectionStatus] = useState("connected");
  const [reconnectingUsers, setReconnectingUsers] = useState(new Set());

  // ---- Refs ----
  const chatEndRef = useRef(null);
  const chatOpenRef = useRef(chatOpen);
  const joinedRoomIdRef = useRef(joinedRoomId);
  const usernameRef = useRef(username);
  const typingTimeoutRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const bindingRef = useRef(null); // MonacoBinding instance
  const [isSynced, setIsSynced] = useState(false); // Track if we've received full Yjs sync
  const [editorMounted, setEditorMounted] = useState(false); // Track if Monaco is mounted
  const [yjsStatus, setYjsStatus] = useState("idle"); // "idle" | "syncing" | "synced" | "error"

  // ---- Computed ----
  const canCollaborate = useMemo(() => Boolean(joinedRoomId), [joinedRoomId]);
  const isHost = useMemo(() => {
    if (!canCollaborate) return false;
    if (authUser && authUser.role === 'interviewer') return true;
    return roomHost && username && roomHost.trim().toLowerCase() === username.trim().toLowerCase();
  }, [canCollaborate, authUser, roomHost, username]);
  const inviteLink = useMemo(
    () =>
      joinedRoomId
        ? `${window.location.origin}${window.location.pathname}?room=${joinedRoomId}`
        : "",
    [joinedRoomId]
  );
  const statusClass = useMemo(
    () => status.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    [status]
  );

  // Helper: get last message ID for chat catchup
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const getLastMessageId = useCallback(() => {
    const msgs = messagesRef.current;
    if (msgs.length === 0) return null;
    return msgs[msgs.length - 1]?.id || null;
  }, []);

  /* ================================================================ */
  /*  EFFECTS                                                          */
  /* ================================================================ */

  // Keep refs in sync
  useEffect(() => { chatOpenRef.current = chatOpen; }, [chatOpen]);
  useEffect(() => { joinedRoomIdRef.current = joinedRoomId; }, [joinedRoomId]);
  useEffect(() => { usernameRef.current = username; }, [username]);

  // Theme persistence
  useEffect(() => {
    localStorage.setItem("theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Username persistence & Yjs Awareness sync
  useEffect(() => {
    localStorage.setItem("username", username);
    if (username && joinedRoomId) {
      setAwarenessUser(
        username,
        authUser?.role || (isHost ? "interviewer" : "candidate"),
        null,
        authUser?._id || socket.id
      );
    }
  }, [username, joinedRoomId, authUser, isHost]);

  // Auth check + auto-join on mount
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      setAuthLoading(false);
    }, 5000);

    try {
      const q = new URLSearchParams(window.location.search).get("room");
      if (q) setRoomId(q);

      const doAutoJoin = (roomIdToJoin, userNameToJoin) => {
        axios
          .post(
            `${API_BASE_URL}/room/join`,
            { roomId: roomIdToJoin, username: userNameToJoin },
            { headers: getAuthHeaders(), timeout: 5000 }
          )
          .then((res) => {
            if (userNameToJoin) {
              setUsername(userNameToJoin);
              usernameRef.current = userNameToJoin;
            }
            syncRoomState(res.data);
            emitJoinRoom(res.data.roomId, userNameToJoin);
            setSessionMessage(`Joined room ${res.data.roomId}`);
          })
          .catch((err) => {
            setSessionMessage(err.response?.data?.message || "Unable to join room");
          });
      };

      const token = localStorage.getItem("auth_token");
      if (!token) {
        setAuthLoading(false);
        const storedName = localStorage.getItem("username");
        if (q && storedName && storedName.trim()) {
          setAuthMode("none");
          doAutoJoin(q, storedName.trim());
        } else if (q) {
          setAuthMode("login");
        }
        return;
      }

      axios
        .get(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000
        })
        .then((res) => {
          setAuthUser(res.data.user);
          setUsername(res.data.user.username);
          setAuthMode("none");
          if (q) doAutoJoin(q, res.data.user.username);
        })
        .catch(() => {
          localStorage.removeItem("auth_token");
          const storedName = localStorage.getItem("username");
          if (q && storedName && storedName.trim()) {
            setAuthMode("none");
            doAutoJoin(q, storedName.trim());
          }
        })
        .finally(() => {
          setAuthLoading(false);
          clearTimeout(safetyTimer);
        });
    } catch (err) {
      console.error(err);
      setAuthLoading(false);
      clearTimeout(safetyTimer);
    }

    return () => clearTimeout(safetyTimer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Socket listeners
  useEffect(() => {
    const onRoomState = (state) => {
      // DEBUG - remove after fix [Step 1: room-state received]
      console.log("[DEBUG Step 1] room-state received:", state.roomId, "currentDoc:", !!getYDoc());

      setJoinedRoomId(state.roomId);
      setRoomId(state.roomId);
      setRoomHost(state.host || "");
      setQuestion(state.question || "");
      setLanguage(normalizeLanguage(state.language));
      setUsers(state.users || []);
      setMessages(state.messages || []);

      // Only reset sync state when switching rooms (not re-joining same room)
      if (joinedRoomIdRef.current !== state.roomId) {
        setIsSynced(false);
        setYjsStatus("syncing");
        if (bindingRef.current) {
          bindingRef.current.destroy();
          bindingRef.current = null;
        }
      }
      // NOTE: Do NOT call initYDoc here — syncRoomState (REST join path) already
      // calls initYDoc with the room's seed code. Calling it again here with empty
      // string would create a doc before the yjs-sync-full arrives, causing applyFullSync
      // to silently fail if the doc was not yet initialized when the event fired.
      // If doc doesn't exist yet (socket-join path without REST), initialize it.
      if (!getYDoc()) {
        initYDoc(state.roomId, "", usernameRef.current);
      }
    };

    const onYjsSyncFull = (data) => {
      // DEBUG - remove after fix [Step 2: yjs-sync-full received]
      const u = typeof data === "string" ? data : data?.update;
      console.log("[DEBUG Step 2] yjs-sync-full received. updateLen:", u?.length, "docExists:", !!getYDoc());
      applyFullSync(u);
      const code = getCode();
      console.log("[DEBUG Step 2] After applyFullSync, code length:", code.length, "preview:", JSON.stringify(code.slice(0, 40)));
      // After sync, update local code state for Run Code
      setCode(code);
      // Signal that sync is complete — the binding useEffect will create/re-evaluate the binding
      setIsSynced(true);
      setYjsStatus("synced");
    };

    const onYjsUpdate = (data) => {
      // DEBUG - remove after fix [Step 4: yjs-update received from server]
      const u = typeof data === "string" ? data : data?.update;
      console.log("[DEBUG Step 4] yjs-update received from server. updateLen:", u?.length);
      applyRemoteUpdate(u);
      setCode(getCode());
    };

    const onQuestionUpdate = (q) => setQuestion(q || "");
    const onUsersUpdate = (u) => {
      setUsers(u || []);
      broadcastAwareness();
    };
    const onLanguageUpdate = (l) => setLanguage(normalizeLanguage(l));
    const onError = (msg) => {
      setStatus("Error");
      setSessionMessage(msg);
      setStderr(msg);
      setIsRunning(false);
    };

    const onYjsAwareness = ({ update }) => {
      applyAwarenessUpdate(update);
    };

    const onChatUpdate = (msg) => {
      setMessages((prev) => [...prev.slice(-199), msg]);
      if (!chatOpenRef.current) setUnreadCount((c) => c + 1);
    };
    const onChatTyping = ({ username: u, isTyping }) => {
      setTypingUsers((prev) =>
        isTyping ? (prev.includes(u) ? prev : [...prev, u]) : prev.filter((x) => x !== u)
      );
    };

    // Chat catchup — merge missed messages without duplicates
    const onChatCatchup = (missed) => {
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        const novel = missed.filter((m) => !ids.has(m.id));
        return [...prev, ...novel].slice(-200);
      });
    };

    // Graceful disconnect presence
    const onUserDisconnecting = ({ username: u }) => {
      setReconnectingUsers((prev) => new Set([...prev, u]));
    };
    const onUserReconnected = ({ username: u }) => {
      setReconnectingUsers((prev) => {
        const next = new Set(prev);
        next.delete(u);
        return next;
      });
    };

    socket.on("room-state", onRoomState);
    socket.on("yjs-sync-full", onYjsSyncFull);
    socket.on("yjs-update", onYjsUpdate);
    socket.on("question-update", onQuestionUpdate);
    socket.on("users-update", onUsersUpdate);
    socket.on("language-update", onLanguageUpdate);
    socket.on("error-message", onError);
    socket.on("yjs-awareness", onYjsAwareness);
    socket.on("chat-update", onChatUpdate);
    socket.on("chat-typing-update", onChatTyping);
    socket.on("chat-catchup", onChatCatchup);
    socket.on("user-disconnecting", onUserDisconnecting);
    socket.on("user-reconnected", onUserReconnected);

    return () => {
      socket.off("room-state", onRoomState);
      socket.off("yjs-sync-full", onYjsSyncFull);
      socket.off("yjs-update", onYjsUpdate);
      socket.off("question-update", onQuestionUpdate);
      socket.off("users-update", onUsersUpdate);
      socket.off("language-update", onLanguageUpdate);
      socket.off("error-message", onError);
      socket.off("yjs-awareness", onYjsAwareness);
      socket.off("chat-update", onChatUpdate);
      socket.off("chat-typing-update", onChatTyping);
      socket.off("chat-catchup", onChatCatchup);
      socket.off("user-disconnecting", onUserDisconnecting);
      socket.off("user-reconnected", onUserReconnected);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Connection status tracking + reconnect re-join
  const emitJoinRoom = useCallback((rId, uName) => {
    if (!rId) return;
    const name = (uName || usernameRef.current || localStorage.getItem("username") || "Guest").trim();
    console.log(`[DEBUG emitJoinRoom] emitting join-room for roomId: "${rId}", username: "${name}", socketConnected: ${socket.connected}`);
    socket.emit("join-room", {
      roomId: rId,
      username: name,
      lastSeenMessageId: getLastMessageId()
    });
    if (!socket.connected) {
      const onConnectRetry = () => {
        console.log(`[DEBUG emitJoinRoom onConnectRetry] socket connected! Retrying join-room for roomId: "${rId}", username: "${name}"`);
        socket.emit("join-room", {
          roomId: rId,
          username: name,
          lastSeenMessageId: getLastMessageId()
        });
      };
      socket.once("connect", onConnectRetry);
    }
  }, [getLastMessageId]);

  useEffect(() => {
    const onConnect = () => {
      setConnectionStatus("connected");
      // Re-join room on reconnect
      const rId = joinedRoomIdRef.current;
      const uName = usernameRef.current || localStorage.getItem("username") || "Guest";
      if (rId) {
        emitJoinRoom(rId, uName);
        requestResync();
      }
    };
    const onDisconnect = () => {
      setConnectionStatus("reconnecting");
    };
    const onConnectError = () => {
      setConnectionStatus("disconnected");
    };

    if (socket.connected) {
      onConnect();
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, [getLastMessageId]);



  // Chat auto-scroll
  useEffect(() => {
    if (chatOpen && chatEndRef.current) {
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [messages, chatOpen]);

  // === Yjs ↔ Monaco binding: created when editor is mounted AND Yjs is synced ===
  // isSynced MUST be in the deps array so this effect re-fires when sync arrives
  // AFTER the editor is already mounted (the common case for the joining participant).
  useEffect(() => {
    if (!editorMounted || !joinedRoomId) return;
    if (!editorRef.current || !monacoRef.current) return;
    if (bindingRef.current) return; // already bound
    // DEBUG - remove after fix [Step 3: binding effect fired]
    console.log("[DEBUG Step 3] Binding effect fired. editorMounted:", editorMounted, "joinedRoomId:", joinedRoomId, "isSynced:", isSynced, "docExists:", !!getYDoc());
    if (!isSynced) {
      // Yjs full sync not yet received — wait for isSynced to flip
      // (this effect will re-run when isSynced changes because it's in the deps)
      console.log("[DEBUG Step 3] Waiting for Yjs sync before creating binding...");
      return;
    }
    setupMonacoBinding();
  }, [editorMounted, joinedRoomId, isSynced]);

  /* ================================================================ */
  /*  Yjs ↔ Monaco binding                                            */
  /* ================================================================ */
  function setupMonacoBinding() {
    // Destroy any existing binding & clean up old content widgets
    if (bindingRef.current) {
      if (bindingRef.current.onAwarenessChange) {
        getAwareness()?.off("change", bindingRef.current.onAwarenessChange);
      }
      if (bindingRef.current.cleanupWidgets) {
        bindingRef.current.cleanupWidgets();
      }
      bindingRef.current.destroy();
      bindingRef.current = null;
    }

    const ytext = getYText();
    const editor = editorRef.current;
    const ydoc = getYDoc();
    const monaco = monacoRef.current;
    if (!ytext || !editor || !ydoc || !monaco) {
      console.log("[setupMonacoBinding] missing dependencies, aborting.");
      return;
    }

    const model = editor.getModel();
    if (!model) {
      console.log("[setupMonacoBinding] missing model, aborting.");
      return;
    }

    // Synchronize Monaco model with Y.Text BEFORE binding to prevent initial delta emission
    const currentYText = ytext.toString();
    if (model.getValue() !== currentYText) {
      model.setValue(currentYText);
    }

    const awareness = getAwareness();
    bindingRef.current = new MonacoBinding(
      ytext,
      model,
      new Set([editor]),
      awareness
    );
    console.log("[DEBUG Step 3] MonacoBinding created successfully.");

    // Setup dynamic CSS for cursor selection highlights & vertical lines
    let styleEl = document.getElementById("y-monaco-awareness-styles");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "y-monaco-awareness-styles";
      document.head.appendChild(styleEl);
    }

function hexToRgba(hexColor, alpha = 0.2) {
  if (!hexColor) return `rgba(97, 175, 239, ${alpha})`;
  let c = hexColor.trim();
  if (c.startsWith("rgba") || c.startsWith("rgb")) return c;
  if (c.startsWith("#")) c = c.slice(1);
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  if (c.length === 6) {
    const num = parseInt(c, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  }
  return `rgba(97, 175, 239, ${alpha})`;
}

    const updateAwareness = () => {
      const localClientId = ydoc.clientID;
      const awarenessClientId = awareness.clientID;

      // Update dynamic selection highlights & vertical caret bar styles for remote peers ONLY
      let css = "";
      awareness.getStates().forEach((state, clientID) => {
        if (clientID !== localClientId && clientID !== awarenessClientId && state.user) {
          const color = state.user.color || "#61afef";
          const bgRgba = hexToRgba(color, 0.2); // Soft 20% transparent highlight
          css += `
            .yRemoteSelection-${clientID} { background-color: ${bgRgba} !important; }
            .yRemoteSelectionHead-${clientID} { border-left-color: ${color} !important; background: transparent !important; }
          `;
        }
      });
      styleEl.innerHTML = css;
    };

    const cleanupWidgets = () => {};

    awareness.on("change", updateAwareness);
    updateAwareness();

    bindingRef.current.onAwarenessChange = updateAwareness;
    bindingRef.current.cleanupWidgets = cleanupWidgets;
  }

  /* ================================================================ */
  /*  HANDLERS                                                         */
  /* ================================================================ */

  function syncRoomState(r) {
    setJoinedRoomId(r.roomId);
    setRoomId(r.roomId);
    setRoomHost(r.host || "");
    setQuestion(r.question || "");
    setLanguage(normalizeLanguage(r.language));
    setUsers(r.users || []);
    setMessages(r.messages || []);
    joinedRoomIdRef.current = r.roomId;
    // Reset sync state — yjs-sync-full will arrive after join-room socket event
    setIsSynced(false);
    setYjsStatus("syncing");
    if (bindingRef.current) {
      bindingRef.current.destroy();
      bindingRef.current = null;
    }
    initYDoc(r.roomId, r.code || "", usernameRef.current);
  }

  // Auth
  async function handleAuth(e) {
    e.preventDefault();
    setAuthError("");
    const endpoint = authMode === "register" ? "/auth/register" : "/auth/login";
    const body =
      authMode === "register"
        ? { username: authForm.username, email: authForm.email, password: authForm.password, role: authForm.role }
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

  async function handleGoogleAuth(credential, role) {
    setAuthError("");
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/google`, {
        credential,
        role: role || authForm.role || "candidate"
      });
      localStorage.setItem("auth_token", res.data.token);
      setAuthUser(res.data.user);
      setUsername(res.data.user.username);
      setAuthMode("none");
      reconnectSocket();
    } catch (err) {
      setAuthError(err.response?.data?.message || "Google authentication failed");
    }
  }

  function handleLogout() {
    localStorage.removeItem("auth_token");
    setAuthUser(null);
    setAuthMode("login");
    setJoinedRoomId("");
    setUsers([]);
    setMessages([]);
    destroyYDoc();
    if (bindingRef.current) {
      if (bindingRef.current.cleanupWidgets) {
        bindingRef.current.cleanupWidgets();
      }
      bindingRef.current.destroy();
      bindingRef.current = null;
    }
    reconnectSocket();
  }

  function handleGuestContinue() {
    if (!username.trim()) {
      setAuthError("Enter a name to continue as guest");
      return;
    }
    setAuthMode("none");
    const q = new URLSearchParams(window.location.search).get("room");
    if (q && (!joinedRoomIdRef.current || joinedRoomIdRef.current !== q)) {
      axios
        .post(
          `${API_BASE_URL}/room/join`,
          { roomId: q, username: username.trim() },
          { headers: getAuthHeaders(), timeout: 5000 }
        )
        .then((res) => {
          syncRoomState(res.data);
          emitJoinRoom(res.data.roomId, username.trim());
          setSessionMessage(`Joined room ${res.data.roomId}`);
        })
        .catch((err) => {
          setSessionMessage(err.response?.data?.message || "Unable to join room");
        });
    }
  }

  // Room
  async function handleCreateRoom() {
    const name = authUser?.username || username.trim() || "guest";
    setUsername(name);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/room/create`,
        { username: name, question },
        { headers: getAuthHeaders() }
      );
      syncRoomState(res.data);
      window.history.replaceState({}, "", `${window.location.pathname}?room=${res.data.roomId}`);
      emitJoinRoom(res.data.roomId, name);
      setSessionMessage(`Interview room ${res.data.roomId} is ready`);
    } catch (err) {
      setSessionMessage(err.response?.data?.message || "Failed to create room");
    }
  }

  async function handleJoinRoom() {
    const name = authUser?.username || username.trim() || "guest";
    setUsername(name);
    if (!roomId.trim()) {
      setSessionMessage("Enter a room code to join");
      return;
    }
    try {
      const res = await axios.post(
        `${API_BASE_URL}/room/join`,
        { roomId: roomId.trim(), username: name },
        { headers: getAuthHeaders() }
      );
      syncRoomState(res.data);
      window.history.replaceState({}, "", `${window.location.pathname}?room=${res.data.roomId}`);
      emitJoinRoom(res.data.roomId, name);
      setSessionMessage(`Joined room ${res.data.roomId}`);
    } catch (err) {
      setSessionMessage(err.response?.data?.message || "Unable to join room");
    }
  }

  async function handleCopyInvite() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setSessionMessage("Invite link copied");
    } catch {
      setSessionMessage("Copy the invite link from the address bar");
    }
  }

  function handleQuestionChange(e) {
    const q = e.target.value;
    setQuestion(q);
    if (!canCollaborate || !joinedRoomId) return;
    const effectiveUsername = authUser?.username || username;
    if (roomHost && effectiveUsername && roomHost === effectiveUsername) {
      socket.emit("question-change", { roomId: joinedRoomId, question: q });
    }
  }

  // Language
  function handleLanguageChange(e) {
    const l = e.target.value;
    setLanguage(l);
    const currentRoomId = joinedRoomIdRef.current;
    if (currentRoomId) socket.emit("set-language", { roomId: currentRoomId, language: l });
  }

  async function handleResetCode() {
    if (!joinedRoomId) return;
    try {
      const res = await axios.post(`${API_BASE_URL}/room/reset`, { roomId: joinedRoomId });
      syncRoomState(res.data);
      socket.emit("reset-room", { roomId: joinedRoomId });
      setStatus("Ready");
      setStdout("");
      setStderr("");
      setCompileOutput("");
      setSessionMessage("Code editor reset");
    } catch (err) {
      setSessionMessage(err.response?.data?.message || "Unable to reset");
    }
  }

  async function handleRunCode() {
    setIsRunning(true);
    setStatus("Running...");
    setStdout("");
    setStderr("");
    setCompileOutput("");
    try {
      // Use editor value as source of truth, fallback to Yjs or state
      const currentCode = editorRef.current?.getValue() || getCode() || code;
      const payload = { sourceCode: currentCode, language, stdin };
      if (joinedRoomId) payload.roomId = joinedRoomId;
      const res = await axios.post(`${API_BASE_URL}/code/run`, payload);
      setStatus(res.data.status || "Done");
      setStdout(res.data.stdout || "");
      setStderr(res.data.stderr || "");
      setCompileOutput(res.data.compileOutput || "");
    } catch (err) {
      setStatus("Error");
      setStderr(err.response?.data?.message || "Execution failed");
    } finally {
      setIsRunning(false);
    }
  }

  function handleEditorMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;
    window.__monaco_editor__ = editor;
    window.monaco = monaco;
    setEditorMounted(true);
  }

  // Chat
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

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  // Landing page
  if (authMode === "landing") {
    return <LandingPage setAuthMode={setAuthMode} setAuthForm={setAuthForm} />;
  }

  // Auth loading or auth screen
  if (authLoading || authMode !== "none") {
    return (
      <AuthScreen
        theme={theme}
        authMode={authMode}
        setAuthMode={setAuthMode}
        authError={authError}
        setAuthError={setAuthError}
        authForm={authForm}
        setAuthForm={setAuthForm}
        authLoading={authLoading}
        username={username}
        setUsername={setUsername}
        onAuth={handleAuth}
        onGoogleAuth={handleGoogleAuth}
        onGuestContinue={handleGuestContinue}
      />
    );
  }

  // Main UI
  return (
    <div className="app" data-theme={theme}>
      {/* ---- Navbar ---- */}
      <header className="navbar">
        <div className="navbar-content">
          <div>
            <h1 className="brand">Interview Pad </h1>
            <p className="brand-subtitle">
              Interviewer writes the question, candidate solves live.
            </p>
          </div>
          <div className="navbar-actions">
            {/* Connection status indicator */}
            <span
              className={`connection-dot connection-${connectionStatus}`}
              title={connectionStatus === "connected" ? "Connected" : connectionStatus === "reconnecting" ? "Reconnecting…" : "Disconnected"}
            />
            {authUser && <span className="user-badge">{authUser.username}</span>}
            <button
              className="theme-btn"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
            </button>
            {authUser ? (
              <button className="btn-tertiary" onClick={handleLogout}>
                Logout
              </button>
            ) : (
              <button className="btn-tertiary" onClick={() => setAuthMode("login")}>
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ---- Main content ---- */}
      <main className="container">
        <Sidebar
          authUser={authUser}
          username={username}
          setUsername={setUsername}
          roomId={roomId}
          setRoomId={setRoomId}
          joinedRoomId={joinedRoomId}
          isHost={isHost}
          users={users}
          question={question}
          inviteLink={inviteLink}
          canCollaborate={canCollaborate}
          reconnectingUsers={reconnectingUsers}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onCopyInvite={handleCopyInvite}
          onResetCode={handleResetCode}
          onQuestionChange={handleQuestionChange}
        />

        <EditorPanel
          theme={theme}
          language={language}
          code={code}
          status={status}
          statusClass={statusClass}
          isRunning={isRunning}
          stdin={stdin}
          setStdin={setStdin}
          stdout={stdout}
          stderr={stderr}
          compileOutput={compileOutput}
          sessionMessage={sessionMessage}
          joinedRoomId={joinedRoomId}
          chatOpen={chatOpen}
          unreadCount={unreadCount}
          connectionStatus={connectionStatus}
          yjsStatus={yjsStatus}
          onLanguageChange={handleLanguageChange}
          onRunCode={handleRunCode}
          onToggleChat={toggleChat}
          onEditorMount={handleEditorMount}
        >
          {chatOpen && joinedRoomId && (
            <ChatPanel
              messages={messages}
              username={username}
              chatInput={chatInput}
              setChatInput={setChatInput}
              typingUsers={typingUsers}
              chatEndRef={chatEndRef}
              onSendChat={handleSendChat}
              onChatInputChange={handleChatInputChange}
              onClose={toggleChat}
            />
          )}
        </EditorPanel>
      </main>
    </div>
  );
}

export default App;
