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
import { isLanguageSupported, normalizeLanguage } from "../config/languages.js";
import { runCode } from "../services/judge0.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { optionalAuth } from "../middleware/auth.js";

const router = express.Router();
const codeRunLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
  message: "Too many code run requests. Please wait a minute and try again."
});

router.post("/room/create", optionalAuth, async (req, res) => {
  const username = req.user?.username || req.body?.username || "guest";
  try {
    const room = await createRoom(username, req.body?.question || "");
    res.status(201).json(room);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/room/join", optionalAuth, async (req, res) => {
  const { roomId } = req.body || {};
  const username = req.user?.username || req.body?.username || "guest";
  if (!roomId) {
    return res.status(400).json({ message: "roomId is required" });
  }

  try {
    const room = await joinRoom(roomId, username);
    return res.json(room);
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
});

router.post("/code/run", codeRunLimiter, async (req, res) => {
  const { roomId, sourceCode, language, stdin } = req.body || {};
  if (!sourceCode || !language) {
    return res.status(400).json({ message: "sourceCode and language are required" });
  }

  const normalizedLanguage = normalizeLanguage(language);

  if (!isLanguageSupported(normalizedLanguage)) {
    return res.status(400).json({ message: "Unsupported language" });
  }

  if (roomId) {
    const existing = await getRoom(roomId);
    if (existing) {
      await setRoomCode(roomId, sourceCode);
      await setRoomLanguage(roomId, normalizedLanguage);
    }
  }

  try {
    const result = await runCode({ sourceCode, language: normalizedLanguage, stdin: stdin || "" });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/room/reset", async (req, res) => {
  const { roomId } = req.body || {};
  if (!roomId) {
    return res.status(400).json({ message: "roomId is required" });
  }

  try {
    const room = await resetRoom(roomId);
    return res.json(room);
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
});

router.post("/room/question", async (req, res) => {
  const { roomId, question } = req.body || {};
  if (!roomId) {
    return res.status(400).json({ message: "roomId is required" });
  }

  try {
    const room = await setRoomQuestion(roomId, question || "");
    return res.json({
      roomId: room.roomId,
      question: room.question
    });
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
});

export default router;
