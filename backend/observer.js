import "dotenv/config";
import { io } from "socket.io-client";
import * as Y from "yjs";

const apiUrl = process.env.VITE_API_URL || "http://localhost:4000";

async function run() {
  const roomId = "88ee5ee7";
  console.log("Connecting to room", roomId);
  
  const socket = io(apiUrl);
  
  socket.on("connect", () => {
    console.log("Connected. Joining room...");
    socket.emit("join-room", { roomId, username: "ObserverBot" });
  });

  const doc = new Y.Doc();

  socket.on("yjs-sync-full", ({ update }) => {
    console.log("Received yjs-sync-full!");
    const buf = Buffer.from(update, "base64");
    Y.applyUpdate(doc, new Uint8Array(buf));
    console.log("Current code:", doc.getText("code").toString());
    console.log("WAITING for the user to type in their browser tabs...");
  });

  socket.on("yjs-update", ({ update }) => {
    console.log("Received yjs-update from another client!");
    const buf = Buffer.from(update, "base64");
    try {
      Y.applyUpdate(doc, new Uint8Array(buf), "server-update");
      console.log("New code:", doc.getText("code").toString());
    } catch (e) {
      console.error("Failed to apply update:", e.message);
    }
  });
}

run().catch(console.error);
