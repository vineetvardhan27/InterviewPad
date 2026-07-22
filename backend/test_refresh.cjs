const io = require("socket.io-client");
const Y = require("yjs");
const axios = require("axios");

async function run() {
  console.log("Registering test user to get token...");
  let token;
  let username = "tester_" + Date.now();
  try {
    const res = await axios.post("http://localhost:4000/auth/register", {
      username,
      email: `${username}@test.com`,
      password: "password",
      role: "interviewer"
    });
    token = res.data.token;
  } catch (err) {
    console.log("Register failed:", err.response?.data?.message);
    return;
  }

  console.log("Creating room...");
  let roomId;
  try {
    const res = await axios.post("http://localhost:4000/api/rooms", {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    roomId = res.data.roomId;
    console.log("Created room:", roomId);
  } catch (err) {
    console.log("Room creation failed:", err.response?.data?.message);
    return;
  }

  console.log("Connecting socket 1...");
  const socket1 = io("http://localhost:4000");

  let ydoc = new Y.Doc();

  socket1.on("connect", () => {
    socket1.emit("join-room", { roomId, username, role: "interviewer" });
  });

  socket1.on("yjs-sync-full", ({ update }) => {
    console.log("Socket 1 received yjs-sync-full. Applying update...");
    const buf = Buffer.from(update, "base64");
    Y.applyUpdate(ydoc, buf, "server-update");
    
    // Check code
    console.log("Code after sync:", ydoc.getText("code").toString());

    // Type something
    console.log("Typing 'hello world'...");
    ydoc.getText("code").insert(0, "hello world");
    
    // Send update
    const newUpdate = Y.encodeStateAsUpdate(ydoc);
    socket1.emit("yjs-update", { roomId, update: Buffer.from(newUpdate).toString("base64") });

    // Disconnect and reconnect to simulate refresh
    console.log("Disconnecting Socket 1 to simulate refresh...");
    socket1.disconnect();
    
    setTimeout(() => {
      console.log("Reconnecting Socket 2...");
      const socket2 = io("http://localhost:4000");
      let ydoc2 = new Y.Doc();
      
      socket2.on("connect", () => {
        socket2.emit("join-room", { roomId, username, role: "interviewer" });
      });

      socket2.on("yjs-sync-full", ({ update }) => {
        console.log("Socket 2 received yjs-sync-full.");
        const buf = Buffer.from(update, "base64");
        Y.applyUpdate(ydoc2, buf, "server-update");
        console.log("Code after refresh:", ydoc2.getText("code").toString());
        process.exit(0);
      });
    }, 1000);
  });
}

run();
