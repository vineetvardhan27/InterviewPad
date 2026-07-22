import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "node:http";
import { Server } from "socket.io";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";
import * as Y from "yjs";

import { connectDB } from "./config/db.js";
import apiRouter from "./routes/api.js";
import authRouter from "./routes/auth.js";
import {
  getRoom,
  getRoomsCount,
  joinRoom,
  resetRoom,
  setRoomCode,
  setRoomQuestion,
  setRoomLanguage,
  removeUserFromRoom,
  addChatMessage,
  getMessagesSince
} from "./store/roomStore.js";
import { isLanguageSupported, normalizeLanguage } from "./config/languages.js";
import { runCode } from "./services/judge0.js";
import { verifyToken } from "./middleware/auth.js";

/* ------------------------------------------------------------------ */
/*  Socket-to-room tracking (for disconnect cleanup)                   */
/* ------------------------------------------------------------------ */
const socketMeta = new Map(); // socketId → { roomId, username }

/* ------------------------------------------------------------------ */
/*  Yjs document management                                            */
/* ------------------------------------------------------------------ */
const yjsDocs = new Map();   // roomId → Y.Doc

function getOrCreateYDoc(roomId, seedCode = "") {
  if (yjsDocs.has(roomId)) return yjsDocs.get(roomId);
  const doc = new Y.Doc();
  if (seedCode) {
    const txt = doc.getText("code");
    txt.insert(0, seedCode);
  }
  yjsDocs.set(roomId, doc);
  return doc;
}

function destroyYDoc(roomId) {
  const doc = yjsDocs.get(roomId);
  if (doc) {
    doc.destroy();
    yjsDocs.delete(roomId);
  }
}

/* ------------------------------------------------------------------ */
/*  Graceful disconnect timers                                         */
/* ------------------------------------------------------------------ */
const GRACE_PERIOD_MS = 60_000; // 60 seconds
const disconnectTimers = new Map(); // "roomId::username" → timeout id

function graceKey(roomId, username) {
  return `${roomId}::${username}`;
}


function emitRoomState(target, room) {
  target.emit("room-state", {
    roomId: room.roomId,
    code: room.code,
    language: room.language,
    users: room.users,
    host: room.host,
    question: room.question,
    version: room.version,
    messages: room.messages || []
  });
}

/* ------------------------------------------------------------------ */
/*  Express + Socket.io setup                                          */
/* ------------------------------------------------------------------ */
const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const ALLOWED_ORIGINS = FRONTEND_ORIGIN
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }
  return (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:") ||
    origin.startsWith("https://")
  );
}

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    credentials: false
  }
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"));
    },
    credentials: false
  })
);
app.set("trust proxy", 1);
app.use(express.json({ limit: "200kb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, "..", "..", "frontend", "dist");

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */
app.use("/api/auth", authRouter);
app.use("/api", apiRouter);

app.get("/health", async (_req, res) => {
  const count = await getRoomsCount();
  res.json({ status: "ok", rooms: count, uptime: process.uptime() });
});

if (fs.existsSync(frontendDist) && fs.existsSync(path.join(frontendDist, "index.html"))) {
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.json({ status: "ok", service: "InterviewPad API & Real-time Backend" });
  });
}

/* ------------------------------------------------------------------ */
/*  Periodic Yjs → Mongo snapshot (every 10 seconds)                   */
/* ------------------------------------------------------------------ */
setInterval(async () => {
  for (const [roomId, doc] of yjsDocs.entries()) {
    try {
      const code = doc.getText("code").toString();
      await setRoomCode(roomId, code);
    } catch (e) {
      // Room may have been deleted — ignore
    }
  }
}, 10_000);

/* ------------------------------------------------------------------ */
/*  Socket.io handlers                                                 */
/* ------------------------------------------------------------------ */
io.on("connection", (socket) => {

  /* ---------- Authenticate socket (optional) ---------- */
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      const decoded = verifyToken(token);
      socket.data.username = decoded.username;
      socket.data.userId = decoded.id;
      socket.data.authenticated = true;
    } catch {
      socket.data.authenticated = false;
    }
  }

  /* ---------- Join room ---------- */
  socket.on("join-room", async ({ roomId, username, lastSeenMessageId }) => {
    console.log(`[DEBUG join-room server] Received join-room event for roomId: "${roomId}", username: "${username}", socketId: ${socket.id}`);
    try {
      const name = (socket.data.username || username || "guest").trim();
      socket.data.username = name;
      console.log(`[join-room] socket=${socket.id} name=${name} roomId=${roomId} authenticated=${socket.data.authenticated}`);

      // Cancel any pending disconnect timer for this user
      const gk = graceKey(roomId, name);
      if (disconnectTimers.has(gk)) {
        clearTimeout(disconnectTimers.get(gk));
        disconnectTimers.delete(gk);
        console.log(`[join-room] Cancelled grace timer for ${name} — reconnect within window`);
        // Notify room that user is back
        socket.to(roomId).emit("user-reconnected", { username: name });
      }

      // Idempotent: skip joinRoom if user was already added by REST route
      const existingRoom = await getRoom(roomId);
      if (!existingRoom) throw new Error("Room not found");
      const room = existingRoom.users.includes(name)
        ? existingRoom
        : await joinRoom(roomId, name);
      console.log(`[join-room] after joinRoom: users=${JSON.stringify(room.users)} host=${room.host}`);

      socket.join(roomId);
      const roomCount = io.sockets.adapter.rooms.get(roomId)?.size || 0;
      console.log(`[join-room] socket ${socket.id} joined room ${roomId}, room size: ${roomCount}`);

      // Track for disconnect cleanup
      socketMeta.set(socket.id, { roomId, username: name });
      console.log(`[join-room] socketMeta updated. DB users: ${room.users.length}, Live sockets: ${roomCount}`);

      // Emit room state (metadata, users, language, question, etc.)
      emitRoomState(socket, room);
      io.to(roomId).emit("users-update", room.users);
      console.log(`[join-room] emitted users-update:`, JSON.stringify(room.users));

      // ---- Yjs sync: send full doc state to the joining client ----
      const doc = getOrCreateYDoc(roomId, room.code);
      const sv = Y.encodeStateVector(doc);
      const update = Y.encodeStateAsUpdate(doc);
      socket.emit("yjs-sync-full", {
        update: Buffer.from(update).toString("base64")
      });

      // ---- Chat catchup: send missed messages ----
      if (lastSeenMessageId) {
        try {
          const missed = await getMessagesSince(roomId, lastSeenMessageId);
          if (missed.length > 0) {
            socket.emit("chat-catchup", missed);
          }
        } catch (e) {
          console.error(`[join-room] chat catchup error:`, e.message);
        }
      }
    } catch (error) {
      console.error(`[join-room] ERROR:`, error.message);
      socket.emit("error-message", error.message);
    }
  });

  socket.on("yjs-update", async ({ roomId, update }) => {
    try {
      const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
      console.log(`[DEBUG yjs-update server] Received yjs-update for roomId: "${roomId}", updateB64Len: ${update?.length}, socketsInRoom: ${roomSize}, senderSocketId: ${socket.id}`);
      let doc = yjsDocs.get(roomId);
      if (!doc) {
        const room = await getRoom(roomId);
        if (room) {
          doc = getOrCreateYDoc(roomId, room.code);
        }
      }
      if (!doc) {
        console.log(`[DEBUG yjs-update server] ERROR: No doc found for roomId: "${roomId}"`);
        return;
      }
      const b64 = Buffer.from(update, "base64");
      const uint8 = new Uint8Array(b64.buffer, b64.byteOffset, b64.length);
      Y.applyUpdate(doc, uint8);
      console.log(`[DEBUG yjs-update server] Rebroadcasting yjs-update to room: "${roomId}" (excluding sender ${socket.id}). Doc text len: ${doc.getText("code").toString().length}`);
      // Broadcast to all OTHER sockets in the room
      socket.to(roomId).emit("yjs-update", { roomId, update });
    } catch (e) {
      console.error("[yjs-update] Error:", e.message);
    }
  });

  socket.on("yjs-awareness", ({ roomId, update }) => {
    try {
      socket.to(roomId).emit("yjs-awareness", { update });
    } catch (e) {
      console.error("[yjs-awareness] Error:", e.message);
    }
  });

  socket.on("yjs-sync-request", async ({ roomId }) => {
    try {
      let doc = yjsDocs.get(roomId);
      if (!doc) {
        const room = await getRoom(roomId);
        if (room) {
          doc = getOrCreateYDoc(roomId, room.code);
        }
      }
      if (doc) {
        const state = Y.encodeStateAsUpdate(doc);
        socket.emit("yjs-sync-full", { update: Buffer.from(state).toString("base64") });
      }
    } catch (e) {
      console.error("[yjs-sync-request] Error:", e.message);
    }
  });

  /* ---------- Language change ---------- */
  socket.on("set-language", async ({ roomId, language }) => {
    try {
      const normalizedLanguage = normalizeLanguage(language);
      if (!isLanguageSupported(normalizedLanguage)) {
        throw new Error("Unsupported language");
      }
      const room = await setRoomLanguage(roomId, normalizedLanguage);
      io.to(roomId).emit("language-update", room.language);
    } catch (error) {
      socket.emit("error-message", error.message);
    }
  });

  /* ---------- Question change (host only) ---------- */
  socket.on("question-change", async ({ roomId, question }) => {
    try {
      const currentRoom = await getRoom(roomId);
      if (!currentRoom) {
        throw new Error("Room not found");
      }
      const normalizedHost = (currentRoom.host || "").trim().toLowerCase();
      const normalizedUser = (socket.data.username || "").trim().toLowerCase();
      console.log(`[question-change] host="${normalizedHost}" user="${normalizedUser}" match=${normalizedHost === normalizedUser}`);
      if (normalizedHost !== normalizedUser) {
        throw new Error("Only interviewer can edit question");
      }
      const room = await setRoomQuestion(roomId, question || "");
      io.to(roomId).emit("question-update", room.question);
      console.log(`[question-change] broadcasted question to room ${roomId}, question length=${(room.question || "").length}`);
    } catch (error) {
      console.error(`[question-change] ERROR:`, error.message);
      socket.emit("error-message", error.message);
    }
  });

  /* ---------- Reset room ---------- */
  socket.on("reset-room", async ({ roomId }) => {
    try {
      const room = await resetRoom(roomId);
      // Reset the Yjs doc
      destroyYDoc(roomId);
      const doc = getOrCreateYDoc(roomId, room.code);
      const update = Y.encodeStateAsUpdate(doc);
      io.to(roomId).emit("yjs-sync-full", {
        update: Buffer.from(update).toString("base64")
      });
      io.to(roomId).emit("language-update", room.language);
      emitRoomState(io.to(roomId), room);
    } catch (error) {
      socket.emit("error-message", error.message);
    }
  });

  /* ---------- Run code ---------- */
  socket.on("run-code", async ({ roomId, sourceCode, language, stdin }) => {
    try {
      const normalizedLanguage = normalizeLanguage(language);
      if (!isLanguageSupported(normalizedLanguage)) {
        throw new Error("Unsupported language");
      }
      // Use Yjs doc as source of truth if available
      let codeToRun = sourceCode;
      const doc = yjsDocs.get(roomId);
      if (doc) {
        codeToRun = doc.getText("code").toString();
      }
      // Snapshot to Mongo
      if (roomId) {
        try {
          await setRoomCode(roomId, codeToRun);
          await setRoomLanguage(roomId, normalizedLanguage);
        } catch (_) { /* ignore snapshot errors */ }
      }

      const result = await runCode({ sourceCode: codeToRun, language: normalizedLanguage, stdin: stdin || "" });
      socket.emit("run-result", result);
    } catch (error) {
      socket.emit("run-result", {
        stdout: "",
        stderr: error.message,
        compileOutput: "",
        status: "Error"
      });
    }
  });

  /* ---------- Manual cursor tracking removed in favor of y-protocols/awareness ---------- */

  /* ---------- Chat system ---------- */
  socket.on("chat-message", async ({ roomId, text }) => {
    const username = socket.data.username;
    console.log(`[chat-message] socket=${socket.id} username=${username} roomId=${roomId} text="${text}"`);
    if (!username || !roomId || !text?.trim()) {
      console.warn(`[chat-message] Guard failed: username=${username} roomId=${roomId} text="${text}"`);
      return;
    }

    try {
      const message = await addChatMessage(roomId, username, text.trim());
      console.log(`[chat-message] Message stored successfully:`, JSON.stringify(message));
      io.to(roomId).emit("chat-update", message);
    } catch (error) {
      console.error(`[chat-message] ERROR:`, error.message);
      socket.emit("error-message", error.message);
    }
  });

  /* ---------- Typing indicator ---------- */
  socket.on("chat-typing", ({ roomId, isTyping }) => {
    const username = socket.data.username;
    if (!username || !roomId) return;
    socket.to(roomId).emit("chat-typing-update", { username, isTyping });
  });

  /* ---------- Disconnect — graceful with 60s window ---------- */
  socket.on("disconnect", () => {
    const meta = socketMeta.get(socket.id);
    if (!meta) return;

    const { roomId, username } = meta;
    socketMeta.delete(socket.id);

    const roomCount = io.sockets.adapter.rooms.get(roomId)?.size || 0;
    console.log(`[disconnect] socket=${socket.id} username=${username} roomId=${roomId}. Live sockets remaining: ${roomCount}`);

    // Check if user has another live socket in the same room
    const hasOtherSocket = Array.from(socketMeta.values()).some(
      (m) => m.roomId === roomId && m.username === username
    );
    if (hasOtherSocket) {
      console.log(`[disconnect] User ${username} has another socket in room ${roomId}. No action needed.`);
      return;
    }

    // Notify room: user is disconnecting (grace period starts)
    io.to(roomId).emit("user-disconnecting", { username });
    console.log(`[disconnect] Grace period started for ${username} in ${roomId} (${GRACE_PERIOD_MS / 1000}s)`);

    // Start grace period timer
    const gk = graceKey(roomId, username);
    const timer = setTimeout(async () => {
      disconnectTimers.delete(gk);

      // Double-check user hasn't reconnected during the timeout
      const reconnected = Array.from(socketMeta.values()).some(
        (m) => m.roomId === roomId && m.username === username
      );
      if (reconnected) {
        console.log(`[disconnect-timeout] User ${username} reconnected. Skipping removal.`);
        return;
      }

      console.log(`[disconnect-timeout] Grace period expired for ${username} in ${roomId}. Removing.`);

      try {
        // Remove user from room
        const updatedRoom = await removeUserFromRoom(roomId, username);

        const newRoomCount = io.sockets.adapter.rooms.get(roomId)?.size || 0;
        console.log(`[disconnect-cleanup] Removed ${username}. DB users: ${updatedRoom ? updatedRoom.users.length : 0}, Live sockets: ${newRoomCount}`);

        if (updatedRoom) {
          // Room still has users — notify them
          io.to(roomId).emit("users-update", updatedRoom.users);
          io.to(roomId).emit("chat-update", {
            id: `sys-${Date.now()}`,
            sender: "system",
            text: `${username} left the room`,
            timestamp: new Date().toISOString()
          });
        }

        // If room is now empty, snapshot Yjs doc to Mongo and destroy
        if (!updatedRoom || updatedRoom.users.length === 0) {
          const doc = yjsDocs.get(roomId);
          if (doc) {
            try {
              const code = doc.getText("code").toString();
              await setRoomCode(roomId, code);
            } catch (_) { /* ignore */ }
            destroyYDoc(roomId);
            console.log(`[disconnect-cleanup] Room ${roomId} empty — Yjs doc destroyed, code snapshot saved.`);
          }
        }
      } catch (error) {
        console.error("Disconnect cleanup error:", error.message);
      }
    }, GRACE_PERIOD_MS);

    disconnectTimers.set(gk, timer);
  });
});

/* ------------------------------------------------------------------ */
/*  Start server                                                       */
/* ------------------------------------------------------------------ */
async function start() {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
}

start();
