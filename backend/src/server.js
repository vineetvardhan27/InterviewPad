import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "node:http";
import { Server } from "socket.io";
import apiRouter from "./routes/api.js";
import {
  getRoom,
  getRoomsCount,
  joinRoom,
  resetRoom,
  setRoomCode,
  setRoomQuestion,
  setRoomLanguage
} from "./store/roomStore.js";
import { isLanguageSupported } from "./config/languages.js";
import { runCode } from "./services/judge0.js";

function emitRoomState(target, room) {
  target.emit("room-state", {
    roomId: room.roomId,
    code: room.code,
    language: room.language,
    users: room.users,
    host: room.host,
    question: room.question,
    version: room.version
  });
}

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST"]
  }
});

app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json({ limit: "200kb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", rooms: getRoomsCount() });
});

app.use("/api", apiRouter);

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, username }) => {
    try {
      socket.data.username = username || "guest";
      const room = joinRoom(roomId, username || "guest");
      socket.join(roomId);
      emitRoomState(socket, room);
      io.to(roomId).emit("users-update", room.users);
    } catch (error) {
      socket.emit("error-message", error.message);
    }
  });

  socket.on("code-change", ({ roomId, code }) => {
    try {
      const room = setRoomCode(roomId, code);
      socket.to(roomId).emit("code-update", {
        code: room.code,
        version: room.version
      });
    } catch (error) {
      socket.emit("error-message", error.message);
    }
  });

  socket.on("set-language", ({ roomId, language }) => {
    try {
      if (!isLanguageSupported(language)) {
        throw new Error("Unsupported language");
      }
      const room = setRoomLanguage(roomId, language);
      io.to(roomId).emit("language-update", room.language);
    } catch (error) {
      socket.emit("error-message", error.message);
    }
  });

  socket.on("question-change", ({ roomId, question }) => {
    try {
      const currentRoom = getRoom(roomId);
      if (!currentRoom) {
        throw new Error("Room not found");
      }
      if (currentRoom.host !== socket.data.username) {
        throw new Error("Only interviewer can edit question");
      }
      const room = setRoomQuestion(roomId, question || "");
      io.to(roomId).emit("question-update", room.question);
    } catch (error) {
      socket.emit("error-message", error.message);
    }
  });

  socket.on("reset-room", ({ roomId }) => {
    try {
      const room = resetRoom(roomId);
      io.to(roomId).emit("code-update", {
        code: room.code,
        version: room.version
      });
      io.to(roomId).emit("language-update", room.language);
      io.to(roomId).emit("room-state", {
        roomId: room.roomId,
        code: room.code,
        language: room.language,
        users: room.users,
        host: room.host,
        question: room.question,
        version: room.version
      });
    } catch (error) {
      socket.emit("error-message", error.message);
    }
  });

  socket.on("run-code", async ({ roomId, sourceCode, language, stdin }) => {
    try {
      if (!isLanguageSupported(language)) {
        throw new Error("Unsupported language");
      }
      const room = getRoom(roomId);
      if (room) {
        setRoomCode(roomId, sourceCode);
        setRoomLanguage(roomId, language);
      }

      const result = await runCode({ sourceCode, language, stdin: stdin || "" });
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
});

server.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
