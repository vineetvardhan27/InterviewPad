import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "node:http";
import { Server } from "socket.io";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";

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
  addChatMessage
} from "./store/roomStore.js";
import { isLanguageSupported, normalizeLanguage } from "./config/languages.js";
import { runCode } from "./services/judge0.js";
import { verifyToken } from "./middleware/auth.js";

/* ------------------------------------------------------------------ */
/*  Socket-to-room tracking (for disconnect cleanup)                   */
/* ------------------------------------------------------------------ */
const socketMeta = new Map(); // socketId → { roomId, username }

/* ------------------------------------------------------------------ */
/*  Cursor presence tracking                                           */
/* ------------------------------------------------------------------ */
const cursorPositions = new Map(); // roomId → Map<username, { line, column, color }>

const CURSOR_COLORS = [
  "#e06c75", "#61afef", "#98c379", "#c678dd", "#e5c07b",
  "#56b6c2", "#be5046", "#d19a66", "#7ec699", "#c792ea"
];

function getCursorColor(roomId, username) {
  const roomCursors = cursorPositions.get(roomId);
  const idx = roomCursors ? roomCursors.size % CURSOR_COLORS.length : 0;
  return CURSOR_COLORS[idx];
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
  return ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://localhost:") || origin.startsWith("https://");
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
  res.json({ status: "ok", rooms: count });
});

if (process.env.NODE_ENV === "production" || fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

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
  socket.on("join-room", async ({ roomId, username }) => {
    try {
      const name = socket.data.username || username || "guest";
      socket.data.username = name;
      const room = await joinRoom(roomId, name);
      socket.join(roomId);

      // Track for disconnect cleanup
      socketMeta.set(socket.id, { roomId, username: name });

      // Initialize cursor tracking for room
      if (!cursorPositions.has(roomId)) {
        cursorPositions.set(roomId, new Map());
      }

      emitRoomState(socket, room);
      io.to(roomId).emit("users-update", room.users);

      // Send existing cursor positions to the joining user
      const roomCursors = cursorPositions.get(roomId);
      if (roomCursors && roomCursors.size > 0) {
        const cursors = Object.fromEntries(roomCursors);
        socket.emit("cursors-sync", cursors);
      }
    } catch (error) {
      socket.emit("error-message", error.message);
    }
  });

  /* ---------- Code change ---------- */
  socket.on("code-change", async ({ roomId, code }) => {
    try {
      const room = await setRoomCode(roomId, code);
      socket.to(roomId).emit("code-update", {
        code: room.code,
        version: room.version
      });
    } catch (error) {
      socket.emit("error-message", error.message);
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
      if (currentRoom.host !== socket.data.username) {
        throw new Error("Only interviewer can edit question");
      }
      const room = await setRoomQuestion(roomId, question || "");
      io.to(roomId).emit("question-update", room.question);
    } catch (error) {
      socket.emit("error-message", error.message);
    }
  });

  /* ---------- Reset room ---------- */
  socket.on("reset-room", async ({ roomId }) => {
    try {
      const room = await resetRoom(roomId);
      io.to(roomId).emit("code-update", {
        code: room.code,
        version: room.version
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
      const room = await getRoom(roomId);
      if (room) {
        await setRoomCode(roomId, sourceCode);
        await setRoomLanguage(roomId, normalizedLanguage);
      }

      const result = await runCode({ sourceCode, language: normalizedLanguage, stdin: stdin || "" });
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

  /* ---------- Cursor presence ---------- */
  socket.on("cursor-move", ({ roomId, position }) => {
    const username = socket.data.username;
    if (!username || !roomId) return;

    if (!cursorPositions.has(roomId)) {
      cursorPositions.set(roomId, new Map());
    }
    const roomCursors = cursorPositions.get(roomId);
    const color = roomCursors.get(username)?.color || getCursorColor(roomId, username);
    roomCursors.set(username, { ...position, color, username });

    socket.to(roomId).emit("cursor-update", {
      username,
      position: { ...position, color }
    });
  });

  /* ---------- Selection presence ---------- */
  socket.on("selection-change", ({ roomId, selection }) => {
    const username = socket.data.username;
    if (!username || !roomId) return;

    socket.to(roomId).emit("selection-update", {
      username,
      selection
    });
  });

  /* ---------- Chat system ---------- */
  socket.on("chat-message", async ({ roomId, text }) => {
    const username = socket.data.username;
    if (!username || !roomId || !text?.trim()) return;

    try {
      const message = await addChatMessage(roomId, username, text.trim());
      io.to(roomId).emit("chat-update", message);
    } catch (error) {
      socket.emit("error-message", error.message);
    }
  });

  /* ---------- Typing indicator ---------- */
  socket.on("chat-typing", ({ roomId, isTyping }) => {
    const username = socket.data.username;
    if (!username || !roomId) return;
    socket.to(roomId).emit("chat-typing-update", { username, isTyping });
  });

  /* ---------- Disconnect cleanup ---------- */
  socket.on("disconnect", async () => {
    const meta = socketMeta.get(socket.id);
    if (!meta) return;

    const { roomId, username } = meta;
    socketMeta.delete(socket.id);

    try {
      // Remove user from room
      const updatedRoom = await removeUserFromRoom(roomId, username);

      // Remove cursor data
      const roomCursors = cursorPositions.get(roomId);
      if (roomCursors) {
        roomCursors.delete(username);
        if (roomCursors.size === 0) {
          cursorPositions.delete(roomId);
        }
      }

      if (updatedRoom) {
        // Room still has users — notify them
        io.to(roomId).emit("users-update", updatedRoom.users);
        io.to(roomId).emit("cursor-remove", { username });
        io.to(roomId).emit("chat-update", {
          id: `sys-${Date.now()}`,
          sender: "system",
          text: `${username} left the room`,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error("Disconnect cleanup error:", error.message);
    }
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
