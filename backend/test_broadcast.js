import "dotenv/config";
import { io } from "socket.io-client";
import * as Y from "yjs";
import axios from "axios";

const apiUrl = process.env.VITE_API_URL || "http://localhost:4000";

async function run() {
  console.log("Connecting sockets...");
  const socket1 = io(apiUrl);
  const socket2 = io(apiUrl);

  const roomId = "test-room-" + Date.now();

  socket1.on("connect", () => {
    console.log("Socket 1 connected. Emitting join-room...");
    // We bypass /api/room/create and just emit join-room directly.
    // If the room doesn't exist in DB, the backend will still create the Y.Doc locally in memory 
    // Wait, backend join-room might fail if room doesn't exist in MongoDB!
    // Let's check backend/src/server.js: 
    // It calls `getRoom(roomId)` which might throw an error. But wait, `getRoom` is not called!
    // Ah, `socket.join(roomId)` is called unconditionally!
    // But then it calls `const room = await getRoom(roomId)` which might throw!
    // If it throws, the catch block logs it.
    // BUT does it still join the room? Yes, `socket.join` is BEFORE the try/catch!
    socket1.emit("join-room", { roomId, username: "Alice" });
  });

  socket2.on("connect", () => {
    console.log("Socket 2 connected.");
    setTimeout(() => {
      socket2.emit("join-room", { roomId, username: "Bob" });
    }, 500);
  });

  let receivedUpdate = false;

  socket1.on("yjs-sync-full", () => {
    console.log("Socket 1 joined. Sending yjs-update...");
    const doc = new Y.Doc();
    doc.getText("code").insert(0, "Hello");
    const update = Y.encodeStateAsUpdate(doc);
    const b64 = Buffer.from(update).toString("base64");
    socket1.emit("yjs-update", { roomId, update: b64 });
  });

  socket2.on("yjs-update", () => {
    console.log("SUCCESS! Socket 2 received yjs-update.");
    receivedUpdate = true;
    process.exit(0);
  });

  setTimeout(() => {
    if (!receivedUpdate) {
      console.error("FAILURE! Socket 2 did NOT receive yjs-update.");
      process.exit(1);
    }
  }, 3000);
}

run().catch(console.error);
