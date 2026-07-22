// Final diagnostic: simulates the EXACT browser client flow
// 1. REST create room → socket join-room → socket code-change → check receipt
import { io } from "socket.io-client";

const BACKEND = "http://localhost:4000";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log("=== FINAL DIAGNOSTIC ===\n");

  // ---- Step 1: Create room via REST (like browser does) ----
  const createRes = await fetch(`${BACKEND}/api/room/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "Alice", question: "" })
  });
  const room = await createRes.json();
  console.log(`Room created: ${room.roomId}, version: ${room.version}`);

  // ---- Step 2: Connect sockets (like browser does at module load) ----
  const socket1 = io(BACKEND, { autoConnect: true, transports: ["websocket"] });
  const socket2 = io(BACKEND, { autoConnect: true, transports: ["websocket"] });

  // Wait for connection
  await new Promise(r => socket1.on("connect", r));
  await new Promise(r => socket2.on("connect", r));
  console.log(`Socket1 connected: ${socket1.id}`);
  console.log(`Socket2 connected: ${socket2.id}`);

  // ---- Step 3: Register listeners BEFORE joining (like useEffect([], []) in browser) ----
  let s1Version = room.version || 0;
  let s2Version = 0;
  let s1CodeUpdateReceived = false;
  let s2CodeUpdateReceived = false;

  // Simulate onRoomState
  socket1.on("room-state", (state) => {
    console.log(`  Socket1 room-state: version=${state.version}, users=${JSON.stringify(state.users)}`);
    s1Version = state.version;
  });
  socket2.on("room-state", (state) => {
    console.log(`  Socket2 room-state: version=${state.version}, users=${JSON.stringify(state.users)}`);
    s2Version = state.version;
  });

  // Simulate onCodeUpdate
  socket1.on("code-update", (data) => {
    console.log(`  Socket1 code-update: version=${data.version}, conflict=${data.conflict}, code="${data.code?.substring(0,30)}"`);
    s1Version = data.version;
    s1CodeUpdateReceived = true;
  });
  socket2.on("code-update", (data) => {
    console.log(`  Socket2 code-update: version=${data.version}, conflict=${data.conflict}, code="${data.code?.substring(0,30)}"`);
    s2Version = data.version;
    s2CodeUpdateReceived = true;
  });

  socket1.on("users-update", (users) => {
    console.log(`  Socket1 users-update: ${JSON.stringify(users)}`);
  });
  socket2.on("users-update", (users) => {
    console.log(`  Socket2 users-update: ${JSON.stringify(users)}`);
  });

  // ---- Step 4: REST join room (like browser handleCreateRoom does) ----
  // Browser does: REST POST /room/join → syncRoomState → socket.emit("join-room")
  console.log(`\n--- Alice joins room via REST + socket ---`);
  const joinRes1 = await fetch(`${BACKEND}/api/room/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId: room.roomId, username: "Alice" })
  });
  const joinData1 = await joinRes1.json();
  console.log(`REST join response: version=${joinData1.version}, users=${JSON.stringify(joinData1.users)}`);
  s1Version = joinData1.version;

  // Now emit join-room on socket (like browser does after REST)
  socket1.emit("join-room", { roomId: room.roomId, username: "Alice" });
  await sleep(500);

  console.log(`\n--- Bob joins room via REST + socket ---`);
  const joinRes2 = await fetch(`${BACKEND}/api/room/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId: room.roomId, username: "Bob" })
  });
  const joinData2 = await joinRes2.json();
  console.log(`REST join response: version=${joinData2.version}, users=${JSON.stringify(joinData2.users)}`);
  s2Version = joinData2.version;

  socket2.emit("join-room", { roomId: room.roomId, username: "Bob" });
  await sleep(500);

  // ---- Step 5: Alice types → does Bob receive? ----
  console.log(`\n--- Alice sends code-change (version=${s1Version}) ---`);
  s2CodeUpdateReceived = false;
  socket1.emit("code-change", { roomId: room.roomId, code: "hello from alice\n", version: s1Version });
  s1Version += 1;
  await sleep(1000);
  console.log(`Bob received code-update? ${s2CodeUpdateReceived ? "YES ✓" : "NO ✗"}`);
  console.log(`Versions after: s1Version=${s1Version}, s2Version=${s2Version}`);

  // ---- Step 6: Bob types → does Alice receive? ----
  console.log(`\n--- Bob sends code-change (version=${s2Version}) ---`);
  s1CodeUpdateReceived = false;
  socket2.emit("code-change", { roomId: room.roomId, code: "hello from bob\n", version: s2Version });
  s2Version += 1;
  await sleep(1000);
  console.log(`Alice received code-update? ${s1CodeUpdateReceived ? "YES ✓" : "NO ✗"}`);
  console.log(`Versions after: s1Version=${s1Version}, s2Version=${s2Version}`);

  // ---- Step 7: One more round to verify version sync ----
  console.log(`\n--- Alice sends another code-change (version=${s1Version}) ---`);
  s2CodeUpdateReceived = false;
  socket1.emit("code-change", { roomId: room.roomId, code: "alice round 2\n", version: s1Version });
  s1Version += 1;
  await sleep(1000);
  console.log(`Bob received code-update? ${s2CodeUpdateReceived ? "YES ✓" : "NO ✗"}`);
  console.log(`Final versions: s1Version=${s1Version}, s2Version=${s2Version}`);

  socket1.disconnect();
  socket2.disconnect();
  console.log("\n=== DIAGNOSTIC COMPLETE ===");
  process.exit(0);
}

run().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
