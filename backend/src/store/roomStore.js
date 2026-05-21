import { randomUUID } from "node:crypto";
import { DEFAULT_LANGUAGE, isLanguageSupported, normalizeLanguage } from "../config/languages.js";
import { isDBConnected } from "../config/db.js";
import RoomModel from "../models/Room.js";

/* ------------------------------------------------------------------ */
/*  In-memory fallback (used when MongoDB is not connected)            */
/* ------------------------------------------------------------------ */
const memoryRooms = new Map();

function memGetOrThrow(roomId) {
  const room = memoryRooms.get(roomId);
  if (!room) {
    throw new Error("Room not found");
  }
  return room;
}

function memToClient(room) {
  return {
    roomId: room.roomId,
    code: room.code,
    language: room.language,
    users: room.users,
    host: room.host,
    question: room.question,
    version: room.version,
    messages: room.messages || []
  };
}

/* ------------------------------------------------------------------ */
/*  Public API — auto-routes to Mongo or memory                        */
/* ------------------------------------------------------------------ */

export async function createRoom(username = "guest", question = "") {
  const roomId = randomUUID().slice(0, 8);
  const data = {
    roomId,
    users: username ? [username] : [],
    host: username || "guest",
    question: question || "",
    code: "# Write your solution here\n",
    language: DEFAULT_LANGUAGE,
    version: 0,
    messages: []
  };

  if (isDBConnected()) {
    const doc = await RoomModel.create(data);
    return doc.toClient();
  }

  data.createdAt = new Date().toISOString();
  memoryRooms.set(roomId, data);
  return memToClient(data);
}

export async function joinRoom(roomId, username = "guest") {
  if (isDBConnected()) {
    const doc = await RoomModel.findOne({ roomId });
    if (!doc) throw new Error("Room not found");
    if (username && !doc.users.includes(username)) {
      doc.users.push(username);
      await doc.save();
    }
    return doc.toClient();
  }

  const room = memGetOrThrow(roomId);
  if (username && !room.users.includes(username)) {
    room.users.push(username);
  }
  return memToClient(room);
}

export async function getRoom(roomId) {
  if (isDBConnected()) {
    const doc = await RoomModel.findOne({ roomId });
    return doc ? doc.toClient() : null;
  }
  const room = memoryRooms.get(roomId) || null;
  return room ? memToClient(room) : null;
}

export async function setRoomCode(roomId, code) {
  if (isDBConnected()) {
    const doc = await RoomModel.findOneAndUpdate(
      { roomId },
      { $set: { code }, $inc: { version: 1 } },
      { new: true }
    );
    if (!doc) throw new Error("Room not found");
    return doc.toClient();
  }

  const room = memGetOrThrow(roomId);
  room.code = code;
  room.version += 1;
  return memToClient(room);
}

export async function setRoomLanguage(roomId, language) {
  const normalizedLanguage = normalizeLanguage(language);
  if (!isLanguageSupported(normalizedLanguage)) {
    throw new Error("Unsupported language");
  }

  if (isDBConnected()) {
    const doc = await RoomModel.findOneAndUpdate(
      { roomId },
      { $set: { language: normalizedLanguage } },
      { new: true }
    );
    if (!doc) throw new Error("Room not found");
    return doc.toClient();
  }

  const room = memGetOrThrow(roomId);
  room.language = normalizedLanguage;
  return memToClient(room);
}

export async function setRoomQuestion(roomId, question) {
  if (isDBConnected()) {
    const doc = await RoomModel.findOneAndUpdate(
      { roomId },
      { $set: { question: question || "" } },
      { new: true }
    );
    if (!doc) throw new Error("Room not found");
    return doc.toClient();
  }

  const room = memGetOrThrow(roomId);
  room.question = question || "";
  return memToClient(room);
}

export async function resetRoom(roomId) {
  if (isDBConnected()) {
    const doc = await RoomModel.findOneAndUpdate(
      { roomId },
      {
        $set: { language: DEFAULT_LANGUAGE, code: "# Write your solution here\n" },
        $inc: { version: 1 }
      },
      { new: true }
    );
    if (!doc) throw new Error("Room not found");
    return doc.toClient();
  }

  const room = memGetOrThrow(roomId);
  room.language = DEFAULT_LANGUAGE;
  room.code = "# Write your solution here\n";
  room.version += 1;
  return memToClient(room);
}

export async function getRoomsCount() {
  if (isDBConnected()) {
    return RoomModel.countDocuments();
  }
  return memoryRooms.size;
}

/* ------------------------------------------------------------------ */
/*  Disconnect cleanup                                                 */
/* ------------------------------------------------------------------ */

export async function removeUserFromRoom(roomId, username) {
  if (isDBConnected()) {
    const doc = await RoomModel.findOne({ roomId });
    if (!doc) return null;
    doc.users = doc.users.filter((u) => u !== username);
    await doc.save();
    if (doc.users.length === 0) {
      await RoomModel.deleteOne({ roomId });
      return null;
    }
    return doc.toClient();
  }

  const room = memoryRooms.get(roomId);
  if (!room) return null;
  room.users = room.users.filter((u) => u !== username);
  if (room.users.length === 0) {
    memoryRooms.delete(roomId);
    return null;
  }
  return memToClient(room);
}

/* ------------------------------------------------------------------ */
/*  Chat                                                               */
/* ------------------------------------------------------------------ */

export async function addChatMessage(roomId, sender, text) {
  const msg = {
    sender,
    text,
    timestamp: new Date().toISOString()
  };

  if (isDBConnected()) {
    const doc = await RoomModel.findOneAndUpdate(
      { roomId },
      { $push: { messages: { sender, text, timestamp: new Date() } } },
      { new: true }
    );
    if (!doc) throw new Error("Room not found");
    const last = doc.messages[doc.messages.length - 1];
    return {
      id: last._id.toString(),
      sender: last.sender,
      text: last.text,
      timestamp: last.timestamp.toISOString()
    };
  }

  const room = memGetOrThrow(roomId);
  if (!room.messages) room.messages = [];
  const id = randomUUID().slice(0, 12);
  const entry = { id, ...msg };
  room.messages.push(entry);
  // Keep last 200 messages in memory
  if (room.messages.length > 200) {
    room.messages = room.messages.slice(-200);
  }
  return entry;
}
