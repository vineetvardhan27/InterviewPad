import express from "express";
import {
  createRoom,
  getRoom,
  joinRoom,
  resetRoom,
  setRoomCode,
  setRoomQuestion,
  setRoomLanguage
} from "../store/roomStore.js";
import { isLanguageSupported } from "../config/languages.js";
import { runCode } from "../services/judge0.js";

const router = express.Router();

router.post("/room/create", (req, res) => {
  const username = req.body?.username || "guest";
  const room = createRoom(username, req.body?.question || "");
  res.status(201).json({
    roomId: room.roomId,
    code: room.code,
    language: room.language,
    users: room.users,
    host: room.host,
    question: room.question,
    version: room.version
  });
});

router.post("/room/join", (req, res) => {
  const { roomId, username } = req.body || {};
  if (!roomId) {
    return res.status(400).json({ message: "roomId is required" });
  }

  try {
    const room = joinRoom(roomId, username || "guest");
    return res.json({
      roomId: room.roomId,
      code: room.code,
      language: room.language,
      users: room.users,
      host: room.host,
      question: room.question,
      version: room.version
    });
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
});

router.post("/code/run", async (req, res) => {
  const { roomId, sourceCode, language, stdin } = req.body || {};
  if (!sourceCode || !language) {
    return res.status(400).json({ message: "sourceCode and language are required" });
  }

  if (!isLanguageSupported(language)) {
    return res.status(400).json({ message: "Unsupported language" });
  }

  if (roomId && getRoom(roomId)) {
    setRoomCode(roomId, sourceCode);
    setRoomLanguage(roomId, language);
  }

  try {
    const result = await runCode({ sourceCode, language, stdin: stdin || "" });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/room/reset", (req, res) => {
  const { roomId } = req.body || {};
  if (!roomId) {
    return res.status(400).json({ message: "roomId is required" });
  }

  try {
    const room = resetRoom(roomId);
    return res.json({
      roomId: room.roomId,
      code: room.code,
      language: room.language,
      users: room.users,
      host: room.host,
      question: room.question,
      version: room.version
    });
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
});

router.post("/room/question", (req, res) => {
  const { roomId, question } = req.body || {};
  if (!roomId) {
    return res.status(400).json({ message: "roomId is required" });
  }

  try {
    const room = setRoomQuestion(roomId, question || "");
    return res.json({
      roomId: room.roomId,
      question: room.question
    });
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
});

export default router;
