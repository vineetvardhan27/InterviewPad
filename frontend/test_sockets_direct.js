import { io } from "socket.io-client";
import axios from "axios";
import * as Y from "yjs";

async function testDirectSockets() {
  console.log("1. Registering interviewer...");
  const username = "Host" + Date.now();
  const regRes = await axios.post("http://localhost:4000/api/auth/register", {
    username,
    email: `${username}@test.com`,
    password: "password123",
    role: "interviewer"
  });
  const token = regRes.data.token;

  console.log("2. Creating room...");
  const roomRes = await axios.post("http://localhost:4000/api/room/create", 
    { username, question: "Test Question" },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const roomId = roomRes.data.roomId;
  console.log("Room created:", roomId);

  console.log("3. Connecting Client 1 (Host)...");
  const s1 = io("http://localhost:4000", { auth: { token } });
  const doc1 = new Y.Doc();

  await new Promise((resolve) => s1.on("connect", resolve));
  console.log("Client 1 connected. Emitting join-room...");
  s1.emit("join-room", { roomId, username });

  await new Promise((resolve) => s1.on("yjs-sync-full", resolve));
  console.log("Client 1 received yjs-sync-full.");

  console.log("4. Connecting Client 2 (Guest)...");
  const s2 = io("http://localhost:4000");
  const doc2 = new Y.Doc();

  await new Promise((resolve) => s2.on("connect", resolve));
  console.log("Client 2 connected. Emitting join-room...");
  s2.emit("join-room", { roomId, username: "GuestBob" });

  await new Promise((resolve) => s2.on("yjs-sync-full", resolve));
  console.log("Client 2 received yjs-sync-full.");

  // Attach listener on Client 2 for yjs-update
  s2.on("yjs-update", ({ update }) => {
    console.log("Client 2 received yjs-update! Update length:", update.length);
    const uint8 = new Uint8Array(Buffer.from(update, "base64"));
    Y.applyUpdate(doc2, uint8, "server-update");
    console.log("Client 2 doc code is now:", JSON.stringify(doc2.getText("code").toString()));
  });

  // Client 1 types text
  console.log("5. Client 1 typing local update...");
  doc1.on("update", (update, origin) => {
    if (origin === "server-update") return;
    const b64 = Buffer.from(update).toString("base64");
    console.log("Client 1 emitting yjs-update, len:", b64.length);
    s1.emit("yjs-update", { roomId, update: b64 });
  });

  doc1.getText("code").insert(0, "// Hello from Client 1!\n");

  await new Promise((r) => setTimeout(r, 2000));

  console.log("Final check:");
  console.log("Client 1 text:", JSON.stringify(doc1.getText("code").toString()));
  console.log("Client 2 text:", JSON.stringify(doc2.getText("code").toString()));

  s1.disconnect();
  s2.disconnect();
}

testDirectSockets().catch(console.error);
