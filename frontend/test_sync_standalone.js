import { chromium } from "playwright";
import axios from "axios";

async function run() {
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
  const roomUrl = `http://localhost:5173/?room=${roomId}`;
  console.log("Room created:", roomId, roomUrl);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const p1 = await context.newPage();
  const p2 = await context.newPage();

  console.log("3. Loading Page 1...");
  await p1.goto(roomUrl);
  await p1.evaluate((t) => localStorage.setItem("auth_token", t), token);
  await p1.goto(roomUrl);
  await p1.waitForSelector(".monaco-editor", { timeout: 10000 });
  console.log("Page 1 ready.");

  console.log("4. Loading Page 2...");
  await p2.goto(roomUrl);
  await p2.evaluate(() => localStorage.setItem("username", "GuestBob"));
  await p2.goto(roomUrl);
  await p2.waitForSelector(".monaco-editor", { timeout: 10000 });
  console.log("Page 2 ready.");

  console.log("Waiting 5 seconds to ensure both clients have joined room on server...");
  await p1.waitForTimeout(5000);

  console.log("5. Checking Yjs initial state:");
  const y1Init = await p1.evaluate(() => window.yjsText ? window.yjsText.toString() : "NO_YJS_TEXT");
  const y2Init = await p2.evaluate(() => window.yjsText ? window.yjsText.toString() : "NO_YJS_TEXT");
  console.log("P1 yjsText init:", JSON.stringify(y1Init));
  console.log("P2 yjsText init:", JSON.stringify(y2Init));

  console.log("6. Page 1 executing edit...");
  await p1.evaluate(() => {
    const ed = window.__monaco_editor__;
    const model = ed.getModel();
    ed.executeEdits("user-typing", [{
      range: model.getFullModelRange(),
      text: "// Hello from P1 real-time sync\n"
    }]);
  });

  console.log("Waiting 3 seconds for propagation...");
  await p1.waitForTimeout(3000);

  const v1Monaco = await p1.evaluate(() => window.__monaco_editor__?.getValue());
  const v1Yjs = await p1.evaluate(() => window.yjsText ? window.yjsText.toString() : "NO_YJS_TEXT");
  const v2Monaco = await p2.evaluate(() => window.__monaco_editor__?.getValue());
  const v2Yjs = await p2.evaluate(() => window.yjsText ? window.yjsText.toString() : "NO_YJS_TEXT");

  console.log("P1 Monaco:", JSON.stringify(v1Monaco));
  console.log("P1 YjsText:", JSON.stringify(v1Yjs));
  console.log("P2 Monaco:", JSON.stringify(v2Monaco));
  console.log("P2 YjsText:", JSON.stringify(v2Yjs));

  if (v2Yjs?.includes("Hello from P1")) {
    console.log("\n🎉 SUCCESS! Yjs text synced to Page 2!");
  } else {
    console.log("\n❌ FAILURE! Yjs text did not sync to Page 2.");
  }

  await browser.close();
}

run().catch(console.error);
