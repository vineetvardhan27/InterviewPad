import { randomUUID } from "node:crypto";
import { DEFAULT_LANGUAGE, isLanguageSupported, normalizeLanguage } from "../config/languages.js";

const rooms = new Map();

function getRoomOrThrow(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    throw new Error("Room not found");
  }
  return room;
}

export function createRoom(username = "guest", question = "") {
  const roomId = randomUUID().slice(0, 8);
  const room = {
    roomId,
    users: [],
    host: username || "guest",
    question: question || "",
    code: "# Write your solution here\n",
    language: DEFAULT_LANGUAGE,
    version: 0,
    createdAt: new Date().toISOString()
  };
  rooms.set(roomId, room);
  if (username) {
    room.users.push(username);
  }
  return room;
}

export function joinRoom(roomId, username = "guest") {
  const room = getRoomOrThrow(roomId);
  if (username && !room.users.includes(username)) {
    room.users.push(username);
  }
  return room;
}

export function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

export function setRoomCode(roomId, code) {
  const room = getRoomOrThrow(roomId);
  room.code = code;
  room.version += 1;
  return room;
}

export function setRoomLanguage(roomId, language) {
  const normalizedLanguage = normalizeLanguage(language);

  if (!isLanguageSupported(normalizedLanguage)) {
    throw new Error("Unsupported language");
  }
  const room = getRoomOrThrow(roomId);
  room.language = normalizedLanguage;
  return room;
}

export function setRoomQuestion(roomId, question) {
  const room = getRoomOrThrow(roomId);
  room.question = question || "";
  return room;
}

export function resetRoom(roomId) {
  const room = getRoomOrThrow(roomId);
  room.language = DEFAULT_LANGUAGE;
  room.code = "# Write your solution here\n";
  room.version += 1;
  return room;
}

export function getRoomsCount() {
  return rooms.size;
}
