import { chromium } from "playwright";
import axios from "axios";

async function testYjsSync() {
  console.log("Creating test room via API...");
  let token = "";
  let roomId = "";
  const username = "HostInterviewer" + Date.now();
  
  try {
    const regRes = await axios.post("http://localhost:4000/api/auth/register", {
      username,
      email: `${username}@test.com`,
      password: "password123",
      role: "interviewer"
    });
    token = regRes.data.token;
    console.log("Registered interviewer. Token obtained.");
  } catch (err) {
    console.error("Failed to register interviewer:", err.message);
    process.exit(1);
  }

  try {
    const roomRes = await axios.post("http://localhost:4000/api/room/create", 
      { username, question: "Test Question" },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    roomId = roomRes.data.roomId;
    console.log("Created room ID:", roomId);
  } catch (err) {
    console.error("Failed to create room:", err.message);
    process.exit(1);
  }

  const roomUrl = `http://localhost:5173/?room=${roomId}`;
  console.log("Target Room URL:", roomUrl);

  console.log("\nLaunching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const page1 = await context.newPage();
  const page2 = await context.newPage();

  page1.on("console", async (msg) => {
    try {
      const args = await Promise.all(msg.args().map((arg) => arg.jsonValue().catch(() => arg.toString())));
      console.log("PAGE 1 CONSOLE:", ...args);
    } catch (_) {
      console.log("PAGE 1 CONSOLE:", msg.text());
    }
  });

  page2.on("console", async (msg) => {
    try {
      const args = await Promise.all(msg.args().map((arg) => arg.jsonValue().catch(() => arg.toString())));
      console.log("PAGE 2 CONSOLE:", ...args);
    } catch (_) {
      console.log("PAGE 2 CONSOLE:", msg.text());
    }
  });

  console.log("\n--- STEP 1: Page 1 (Host) joining room ---");
  await page1.goto(roomUrl);
  await page1.evaluate((t) => localStorage.setItem("auth_token", t), token);
  await page1.goto(roomUrl);

  // Wait for Monaco Editor on Page 1
  await page1.waitForSelector(".monaco-editor", { timeout: 10000 });
  console.log("Page 1 (Host) Editor loaded!");

  console.log("\n--- STEP 2: Page 2 (Guest Candidate) joining room ---");
  await page2.goto(roomUrl);
  await page2.evaluate(() => localStorage.setItem("username", "CandidateBob"));
  await page2.goto(roomUrl);

  // Wait for Monaco Editor on Page 2
  await page2.waitForSelector(".monaco-editor", { timeout: 10000 });
  console.log("Page 2 (CandidateBob) Editor loaded!");

  await page1.waitForTimeout(2000);

  console.log("\n--- STEP 3: Diagnostic Check Before Typing ---");
  const p1ValueBefore = await page1.evaluate(() => window.__monaco_editor__?.getValue());
  const p2ValueBefore = await page2.evaluate(() => window.__monaco_editor__?.getValue());
  console.log("Page 1 value before typing:", JSON.stringify(p1ValueBefore));
  console.log("Page 2 value before typing:", JSON.stringify(p2ValueBefore));

  console.log("\n--- STEP 4: Typing in Page 1 (Host) ---");
  const typedResult = await page1.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      const model = editor.getModel();
      model.applyEdits([{ range: model.getFullModelRange(), text: "// ALICE IS TYPING THIS REALTIME TEST CODE\n" }]);
      return "SUCCESS_APPLY_EDITS";
    } else {
      return "EDITOR_NOT_FOUND";
    }
  });
  console.log("Page 1 applyEdits result:", typedResult);

  console.log("Waiting 3 seconds for propagation...");
  await page1.waitForTimeout(3000);

  console.log("\n--- STEP 5: Diagnostic Check After Typing ---");
  const p1ValueAfter = await page1.evaluate(() => window.__monaco_editor__?.getValue());
  const p2ValueAfter = await page2.evaluate(() => window.__monaco_editor__?.getValue());
  console.log("Page 1 value after typing:", JSON.stringify(p1ValueAfter));
  console.log("Page 2 value after typing:", JSON.stringify(p2ValueAfter));

  if (p2ValueAfter && p2ValueAfter.includes("ALICE IS TYPING THIS REALTIME TEST CODE")) {
    console.log("\n🎉 SUCCESS: Real-time Yjs Monaco sync works! 🎉");
  } else {
    console.error("\n❌ FAILURE: Real-time Yjs Monaco sync failed. ❌");
  }

  await browser.close();
}

testYjsSync().catch(console.error);
