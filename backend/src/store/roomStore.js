import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
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
  const trimmedUsername = (username || "guest").trim();
  const roomId = randomUUID().slice(0, 8);
  const data = {
    roomId,
    users: trimmedUsername ? [trimmedUsername] : [],
    host: trimmedUsername || "guest",
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
    // Use atomic $addToSet to prevent TOCTOU race when REST route
    // and socket handler both call joinRoom concurrently.
    const update = username ? { $addToSet: { users: username } } : {};
    const doc = await RoomModel.findOneAndUpdate(
      { roomId },
      update,
      { returnDocument: 'after' }
    );
    if (!doc) throw new Error("Room not found");
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
      { $set: { code } },
      { returnDocument: 'after' }
    );
    if (!doc) throw new Error("Room not found");
    return { conflict: false, room: doc.toClient() };
  }

  const room = memGetOrThrow(roomId);
  room.code = code;
  return { conflict: false, room: memToClient(room) };
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
      { returnDocument: 'after' }
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
      { returnDocument: 'after' }
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
      { returnDocument: 'after' }
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
    const doc = await RoomModel.findOneAndUpdate(
      { roomId },
      { $pull: { users: username } },
      { returnDocument: 'after' }
    );
    if (!doc) return null;
    return doc.toClient();
  }

  const room = memoryRooms.get(roomId);
  if (!room) return null;
  room.users = room.users.filter((u) => u !== username);
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
    console.log(`[addChatMessage] DB Mode: roomId=${roomId} sender=${sender}`);
    const doc = await RoomModel.findOneAndUpdate(
      { roomId },
      { $push: { messages: { sender, text, timestamp: new Date() } } },
      { returnDocument: 'after' }
    );
    if (!doc) {
      console.error(`[addChatMessage] DB Room not found: roomId=${roomId}`);
      throw new Error("Room not found");
    }
    const last = doc.messages[doc.messages.length - 1];
    if (!last) {
      console.error(`[addChatMessage] DB failed to push message`);
      throw new Error("Failed to store message");
    }
    return {
      id: last._id ? last._id.toString() : new mongoose.Types.ObjectId().toString(),
      sender: last.sender || sender,
      text: last.text || text,
      timestamp: last.timestamp ? last.timestamp.toISOString() : new Date().toISOString()
    };
  }

  console.log(`[addChatMessage] Memory Mode: roomId=${roomId} sender=${sender}`);
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

/* ------------------------------------------------------------------ */
/*  Chat catchup (reconnect)                                           */
/* ------------------------------------------------------------------ */

export async function getMessagesSince(roomId, afterMessageId) {
  if (isDBConnected()) {
    const doc = await RoomModel.findOne({ roomId });
    if (!doc) return [];
    const msgs = doc.toClient().messages;
    if (!afterMessageId) return msgs;
    const idx = msgs.findIndex((m) => m.id === afterMessageId);
    return idx === -1 ? msgs : msgs.slice(idx + 1);
  }

  const room = memoryRooms.get(roomId);
  if (!room || !room.messages) return [];
  const msgs = room.messages.map((m) => ({ ...m }));
  if (!afterMessageId) return msgs;
  const idx = msgs.findIndex((m) => m.id === afterMessageId);
  return idx === -1 ? msgs : msgs.slice(idx + 1);
}
