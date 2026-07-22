import "dotenv/config";
import { io } from "socket.io-client";
import * as Y from "yjs";
import mongoose from "mongoose";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/interviewpad";

const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  users: { type: [String], default: [] },
  host: { type: String, required: true },
  question: { type: String, default: "" },
  code: { type: String, default: "# Write your solution here\n" },
  language: { type: String, default: "cpp" },
  version: { type: Number, default: 0 },
  messages: { type: Array, default: [] }
}, { timestamps: true });

const RoomModel = mongoose.models.Room || mongoose.model("Room", roomSchema);

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("Connected.");
  
  const roomId = "testroom" + Date.now();
  await RoomModel.create({
    roomId,
    host: "Alice",
  });
  console.log("Created room", roomId);

  const socket1 = io("http://localhost:4000");
  const socket2 = io("http://localhost:4000");

  socket1.on("connect", () => {
    console.log("Socket 1 connected");
    socket1.emit("join-room", { roomId, username: "Alice" });
  });

  socket2.on("connect", () => {
    console.log("Socket 2 connected");
    setTimeout(() => {
      socket2.emit("join-room", { roomId, username: "Bob" });
    }, 500);
  });

  let doc1 = new Y.Doc();
  let doc2 = new Y.Doc();
  
  socket1.on("yjs-sync-full", ({ update }) => {
    console.log("Client 1 full sync");
    Y.applyUpdate(doc1, new Uint8Array(Buffer.from(update, "base64")));
    
    const text = doc1.getText("code");
    
    doc1.on("update", (updateObj, origin) => {
      if (origin !== "server-update") {
        console.log("Client 1 sending local update");
        socket1.emit("yjs-update", { roomId, update: Buffer.from(updateObj).toString("base64") });
      }
    });

    setTimeout(() => {
      console.log("Client 1 typing...");
      text.insert(0, "Alice typed this.");
    }, 1000);
  });

  socket2.on("yjs-sync-full", ({ update }) => {
    console.log("Client 2 full sync");
    Y.applyUpdate(doc2, new Uint8Array(Buffer.from(update, "base64")));
  });

  socket2.on("yjs-update", ({ update }) => {
    console.log("Client 2 received yjs-update");
    try {
      Y.applyUpdate(doc2, new Uint8Array(Buffer.from(update, "base64")), "server-update");
      console.log("Client 2 code is now:", doc2.getText("code").toString());
      console.log("SUCCESS!");
    } catch (e) {
      console.error("Client 2 applyUpdate error:", e.message);
    }
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Timeout: Client 2 did not receive yjs-update");
    process.exit(1);
  }, 5000);
}

run().catch(console.error);
