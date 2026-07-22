import Editor from "@monaco-editor/react";
import { LANGUAGES } from "../constants/languages";
import { MessageSquare, Play } from "lucide-react";


/**
 * EditorPanel — Monaco editor, toolbar, and console I/O.
 *
 * The editor refs (editorRef, monacoRef, etc.) stay in App.jsx because
 * socket event handlers need direct access to them. This component
 * receives an onEditorMount callback to pass the refs up.
 *
 * Code editing is now managed by Yjs MonacoBinding — no onChange prop.
 *
 * children slot is used for ChatPanel when chat is open.
 */
function EditorPanel({
  theme,
  language,
  code,
  status,
  statusClass,
  isRunning,
  stdin,
  setStdin,
  stdout,
  stderr,
  compileOutput,
  sessionMessage,
  joinedRoomId,
  chatOpen,
  unreadCount,
  connectionStatus,
  yjsStatus,
  onLanguageChange,
  onRunCode,
  onToggleChat,
  onEditorMount,
  children,
}) {
  return (
    <section className="editor-workspace">
      {/* ---- Toolbar ---- */}
      <div className="editor-toolbar">
        <div className="toolbar-left">
          <select
            value={language}
            onChange={onLanguageChange}
            className="language-dropdown"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.key} value={lang.key}>
                {lang.label}
              </option>
            ))}
          </select>
          <div className="status-indicator">
            <span className={`status-dot status-${statusClass}`} />
            <span className="status-text">{status}</span>
          </div>
        </div>

        <div className="toolbar-right">
          {joinedRoomId && (
            <button
              className={`btn-chat ${chatOpen ? "active" : ""}`}
              onClick={onToggleChat}
            >
              <MessageSquare size={14} strokeWidth={2.2} />
              Chat{" "}
              {unreadCount > 0 && (
                <span className="chat-badge">{unreadCount}</span>
              )}
            </button>
          )}
          <button
            className="btn-run"
            onClick={onRunCode}
            disabled={isRunning}
          >
            {isRunning ? "Running" : <><Play size={13} strokeWidth={2.5} /> Run code</>}
          </button>
        </div>
      </div>

      {/* ---- Notice Bar ---- */}
      {sessionMessage && <div className="notice-bar">{sessionMessage}</div>}

      {/* ---- Workspace Grid ---- */}
      <div
        className={`workspace-grid ${
          chatOpen && joinedRoomId ? "with-chat" : ""
        }`}
      >
        <div className={`editor-panel ${chatOpen ? "with-chat" : ""}`}>
          {/* ---- Monaco Editor ---- */}
          <div className="editor-section">
          {/* Reconnecting overlay — shown when socket is reconnecting */}
          {joinedRoomId && connectionStatus === "reconnecting" && (
            <div className="reconnecting-banner">
              <span className="reconnecting-dot" />
              Reconnecting…
            </div>
          )}
          {joinedRoomId && connectionStatus === "disconnected" && (
            <div className="reconnecting-banner disconnected">
              <span className="reconnecting-dot disconnected" />
              Connection lost
            </div>
          )}
          {/* Yjs sync status — shown when socket is connected but Yjs hasn't synced yet */}
          {joinedRoomId && connectionStatus === "connected" && yjsStatus === "syncing" && (
            <div className="reconnecting-banner yjs-syncing">
              <span className="reconnecting-dot" />
              Syncing editor…
            </div>
          )}
            <Editor
              height="100%"
              language={language}
              defaultValue=""
              theme={theme === "dark" ? "vs-dark" : "vs"}
              onMount={onEditorMount}
              options={{
                minimap: { enabled: false },
                automaticLayout: true,
                fontSize: 14,
                fontFamily: "'Fira Code', 'IBM Plex Mono', monospace",
                lineHeight: 1.6,
                wordWrap: "on",
                padding: { top: 16, bottom: 16 },
                scrollBeyondLastLine: false,
                smoothScrolling: true,
              }}
            />
          </div>

          {/* ---- Console ---- */}
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

        {/* ---- Chat slot (children) ---- */}
        {children}
      </div>
    </section>
  );
}

export default EditorPanel;
