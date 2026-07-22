import { X, SendHorizontal } from "lucide-react";

/**
 * ChatPanel — Real-time chat messages, input bar, typing indicator.
 *
 * Pure presentational — no socket logic. App.jsx handles all socket
 * emissions via the onSendChat and onChatInputChange callbacks.
 */
function ChatPanel({
  messages,
  username,
  chatInput,
  setChatInput,
  typingUsers,
  chatEndRef,
  onSendChat,
  onChatInputChange,
  onClose,
}) {
  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h3>Room Chat</h3>
        <button className="chat-close" onClick={onClose} aria-label="Close chat">
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      <div className="chat-messages">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`chat-msg ${
              m.sender === "system"
                ? "system"
                : m.sender === username
                ? "own"
                : ""
            }`}
          >
            {m.sender !== "system" && (
              <span className="chat-sender">{m.sender}</span>
            )}
            <span className="chat-text">{m.text}</span>
            <span className="chat-time">
              {m.timestamp
                ? new Date(m.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
            </span>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {typingUsers.length > 0 && (
        <div className="chat-typing">
          {typingUsers.join(", ")} typing…
        </div>
      )}

      <form className="chat-input-bar" onSubmit={onSendChat}>
        <input
          type="text"
          value={chatInput}
          onChange={onChatInputChange}
          placeholder="Type a message…"
          className="chat-input"
          maxLength={2000}
        />
        <button
          type="submit"
          className="chat-send"
          disabled={!chatInput.trim()}
        >
          <SendHorizontal size={15} strokeWidth={2.2} />
        </button>
      </form>
    </div>
  );
}

export default ChatPanel;
