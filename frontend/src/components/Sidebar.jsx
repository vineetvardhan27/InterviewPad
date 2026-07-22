/**
 * Sidebar — Room setup, session info, participant list, question editor.
 *
 * Pure presentational — no socket logic.
 */
function Sidebar({
  authUser,
  username,
  setUsername,
  roomId,
  setRoomId,
  joinedRoomId,
  isHost,
  users,
  question,
  inviteLink,
  canCollaborate,
  reconnectingUsers = new Set(),
  onCreateRoom,
  onJoinRoom,
  onCopyInvite,
  onResetCode,
  onQuestionChange,
}) {
  return (
    <aside className="sidebar">
      {/* ---- Room Setup ---- */}
      <section className="card room-section">
        <div className="card-heading">
          <h2 className="section-title">Interview setup</h2>
          <span className="section-chip">Live</span>
        </div>

        {!authUser && (
          <div className="form-group">
            <label className="field-label" htmlFor="username">
              Your name
            </label>
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
        )}

        <div className="form-group">
          <label className="field-label" htmlFor="roomId">
            Room code
          </label>
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
          {(!authUser || authUser.role === 'interviewer') && (
            <button className="btn-primary" onClick={onCreateRoom}>
              Start interview
            </button>
          )}
          <button className="btn-secondary" onClick={onJoinRoom}>
            Join room
          </button>
        </div>

        <div className="button-group secondary-actions">
          <button
            className="btn-tertiary"
            onClick={onCopyInvite}
            disabled={!inviteLink}
          >
            Copy invite
          </button>
          <button
            className="btn-tertiary"
            onClick={onResetCode}
            disabled={!joinedRoomId}
          >
            Reset code
          </button>
        </div>

        {/* ---- Session Info ---- */}
        <div className="session-info">
          <div className="info-row">
            <span className="info-label">Session</span>
            <span className="info-value">{joinedRoomId || "Not joined"}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Role</span>
            <span className="info-value">
              {joinedRoomId
                ? isHost
                  ? "Interviewer"
                  : "Candidate"
                : "Visitor"}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Participants</span>
            <div className="participants-list">
              {users.length > 0 ? (
                users.map((p) => (
                  <span
                    key={p}
                    className={`participant-badge${reconnectingUsers.has(p) ? " reconnecting" : ""}`}
                    title={reconnectingUsers.has(p) ? `${p} (reconnecting…)` : p}
                  >
                    {p.slice(0, 1).toUpperCase()}
                  </span>
                ))
              ) : (
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

      {/* ---- Question ---- */}
      <section className="card problem-section">
        <div className="card-heading">
          <h2 className="section-title">Question</h2>
          <span className="section-chip accent">
            {isHost ? "Editable" : "Read only"}
          </span>
        </div>
        <textarea
          value={question}
          onChange={onQuestionChange}
          placeholder="Interviewer: paste the interview question here"
          className="question-textarea"
          readOnly={canCollaborate && !isHost}
        />
      </section>
    </aside>
  );
}

export default Sidebar;

