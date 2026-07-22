import "dotenv/config";
import { io } from "socket.io-client";
import axios from "axios";

const apiUrl = process.env.VITE_API_URL || "http://localhost:4000";

async function run() {
  console.log("Registering test user to get token...");
  const username = "testuser_" + Date.now();
  let token = "";
  try {
    const res = await axios.post(`${apiUrl}/api/auth/register`, {
      username,
      email: `${username}@test.com`,
      password: "password123",
      role: "Interviewer" // using uppercase since validation might be strict
    });
    token = res.data.token;
  } catch (err) {
    if (err.response?.data?.message?.toLowerCase().includes("invalid role")) {
      // User mentioned invalid role in registration earlier
      console.log("Invalid role, trying 'interviewer'...");
      const res = await axios.post(`${apiUrl}/api/auth/register`, {
        username,
        email: `${username}@test.com`,
        password: "password123",
        role: "interviewer"
      });
      token = res.data.token;
    } else {
      throw err;
    }
  }

  console.log("Creating room...");
  const roomRes = await axios.post(`${apiUrl}/api/room/create`, {
    username,
    question: "Test question"
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const roomId = roomRes.data.roomId;
  console.log("Created room:", roomId);

  console.log("Connecting sockets...");
  const socket1 = io(apiUrl);
  const socket2 = io(apiUrl);

  socket1.on("connect", () => {
    console.log("Socket 1 connected. Emitting join-room...");
    socket1.emit("join-room", { roomId, username: "Alice" });
  });

  socket2.on("connect", () => {
    console.log("Socket 2 connected.");
    setTimeout(() => {
      console.log("Socket 2 emitting join-room...");
      socket2.emit("join-room", { roomId, username: "Bob" });
    }, 500);
  });

  let receivedUpdate = false;

  socket1.on("yjs-sync-full", () => {
    console.log("Socket 1 received yjs-sync-full.");
  });

  socket2.on("yjs-sync-full", () => {
    console.log("Socket 2 received yjs-sync-full. Sending yjs-update...");
    const fakeBase64Update = "AQGG0fPKCgAEAQRjb2RlBWhlbGxvAA==";
    socket2.emit("yjs-update", { roomId, update: fakeBase64Update });
  });

  socket1.on("yjs-update", (data) => {
    console.log("SUCCESS! Socket 1 received yjs-update:", data);
    receivedUpdate = true;
    process.exit(0);
  });

  setTimeout(() => {
    if (!receivedUpdate) {
      console.error("FAILURE! Socket 1 did NOT receive yjs-update.");
      process.exit(1);
    }
  }, 4000);
}

run().catch(console.error);
