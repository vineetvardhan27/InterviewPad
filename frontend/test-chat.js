import { io } from "socket.io-client";
import axios from "axios";

const BACKEND_URL = "http://localhost:4000";
const API_BASE_URL = `${BACKEND_URL}/api`;

async function runTest() {
  console.log("Starting chat consistency tests...\n");

  // 1. Create a room
  let roomId;
  try {
    const res = await axios.post(`${API_BASE_URL}/room/create`, { username: "Interviewer", question: "Chat Test Question" });
    roomId = res.data.roomId;
    console.log(`Room created successfully: ${roomId}`);
  } catch (err) {
    console.error("Failed to create room:", err.message);
    process.exit(1);
  }

  // 2. Connect clients
  const interviewerSocket = io(BACKEND_URL, { transports: ["websocket"], forceNew: true });
  const candidateSocket = io(BACKEND_URL, { transports: ["websocket"], forceNew: true });

  let interviewerReceivedMessage = null;
  let candidateReceivedMessage = null;

  interviewerSocket.on("chat-update", (msg) => {
    console.log(`[Interviewer Socket] Received chat-update:`, msg);
    interviewerReceivedMessage = msg;
  });

  candidateSocket.on("chat-update", (msg) => {
    console.log(`[Candidate Socket] Received chat-update:`, msg);
    candidateReceivedMessage = msg;
  });

  // Wait for connections
  await new Promise((resolve) => {
    let connected = 0;
    interviewerSocket.on("connect", () => {
      console.log("Interviewer socket connected");
      connected++;
      if (connected === 2) resolve();
    });
    candidateSocket.on("connect", () => {
      console.log("Candidate socket connected");
      connected++;
      if (connected === 2) resolve();
    });
  });

  // 3. Join room
  console.log("\nClients joining room via WebSocket...");
  interviewerSocket.emit("join-room", { roomId, username: "Interviewer" });
  candidateSocket.emit("join-room", { roomId, username: "Candidate" });

  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 4. Send chat message
  const chatMessageText = "Hello, this is a real-time collaborative chat test!";
  console.log(`\nInterviewer sending chat message: "${chatMessageText}"`);
  interviewerSocket.emit("chat-message", { roomId, text: chatMessageText });

  // Wait for propagation
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // 5. Assertions
  console.log("\n--- TEST RESULTS ---");
  let passed = true;

  if (candidateReceivedMessage && candidateReceivedMessage.text === chatMessageText) {
    console.log("✅ SUCCESS: Candidate socket successfully received the chat message!");
  } else {
    console.error("❌ FAILURE: Candidate socket did not receive the chat message.");
    passed = false;
  }

  if (interviewerReceivedMessage && interviewerReceivedMessage.text === chatMessageText) {
    console.log("✅ SUCCESS: Interviewer socket successfully received the broadcasted chat message!");
  } else {
    console.error("❌ FAILURE: Interviewer socket did not receive the broadcasted chat message.");
    passed = false;
  }

  if (candidateReceivedMessage && candidateReceivedMessage.id && candidateReceivedMessage.sender && candidateReceivedMessage.timestamp) {
    console.log("✅ SUCCESS: Message payload is correctly formed with id, sender, text, and timestamp!");
  } else {
    console.error("❌ FAILURE: Message payload lacks required fields:", candidateReceivedMessage);
    passed = false;
  }

  console.log("\nDisconnecting sockets...");
  interviewerSocket.disconnect();
  candidateSocket.disconnect();

  if (passed) {
    console.log("\n🎉 ALL CHAT SOCKET TESTS PASSED! Chat is working perfectly via WebSockets! 🎉");
  } else {
    console.error("\n❌ TESTS FAILED: Chat has socket transmission or storage issues. ❌");
    process.exit(1);
  }
}

runTest();
