import { io } from "socket.io-client";
import * as Y from "yjs";
import axios from "axios";
import jwt from "jsonwebtoken";

const token = jwt.sign({ id: "test", username: "interviewer", role: "interviewer" }, process.env.JWT_SECRET || "interviewpad_super_secret_key_123", { expiresIn: "1h" });

async function run() {
  const res = await axios.post("http://localhost:4000/api/room/create", { username: "Alice" }, { headers: { Authorization: `Bearer ${token}` }});
  const roomId = res.data.roomId;
  console.log("Created room", roomId);

  const socket1 = io("http://localhost:4000", { auth: { token } });
  const socket2 = io("http://localhost:4000");

  socket1.on("connect", () => {
    socket1.emit("join-room", { roomId, username: "Alice" });
  });

  socket2.on("connect", () => {
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
      if (origin !== "remote") {
        console.log("Client 1 sending local update");
        socket1.emit("yjs-update", { roomId, update: Buffer.from(updateObj).toString("base64") });
      }
    });

    setTimeout(() => {
      text.insert(0, "Alice typed this.");
    }, 1000);
  });

  socket2.on("yjs-update", ({ update }) => {
    console.log("Client 2 received yjs-update");
    try {
      Y.applyUpdate(doc2, new Uint8Array(Buffer.from(update, "base64")), "remote");
      console.log("Client 2 code is now:", doc2.getText("code").toString());
    } catch (e) {
      console.error("Client 2 applyUpdate error:", e.message);
    }
    process.exit(0);
  });
}
run();
