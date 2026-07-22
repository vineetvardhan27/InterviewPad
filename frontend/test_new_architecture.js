import { chromium } from "playwright";
import axios from "axios";

async function runArchitectureTest() {
  console.log("=== VERIFYING NEW CURSOR ARCHITECTURE (REMOTESTATES ONLY) ===");
  const ts = Date.now().toString().slice(-6);
  const interviewerName = "Alice_" + ts;
  const candidateName = "Bob_" + ts;

  // 1. Register interviewer
  let token = "";
  try {
    const regRes = await axios.post("http://localhost:4000/api/auth/register", {
      username: interviewerName,
      email: `interviewer${ts}@test.com`,
      password: "password123",
      role: "interviewer"
    });
    token = regRes.data.token;
  } catch (err) {}

  // 2. Create room
  let roomId = "";
  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const roomRes = await axios.post("http://localhost:4000/api/room/create",
      { username: interviewerName, question: "Architecture Test" },
      { headers }
    );
    roomId = roomRes.data.roomId;
  } catch (err) {
    console.error("Room creation failed:", err.message);
    process.exit(1);
  }

  const roomUrl = `http://localhost:5173/?room=${roomId}`;
  const browser = await chromium.launch({ headless: true });

  const ctxI = await browser.newContext();
  const ctxC = await browser.newContext();
  const pageI = await ctxI.newPage();
  const pageC = await ctxC.newPage();

  const logsI = [];
  const logsC = [];

  pageI.on("console", msg => {
    const text = msg.text();
    if (text.includes("[updateAwareness]")) {
      logsI.push(text);
      console.log("[Interviewer Console]", text);
    }
  });

  pageC.on("console", msg => {
    const text = msg.text();
    if (text.includes("[updateAwareness]")) {
      logsC.push(text);
      console.log("[Candidate Console]", text);
    }
  });

  console.log("\n1. Loading Interviewer (Alice)...");
  await pageI.goto(roomUrl);
  if (token) await pageI.evaluate((t) => localStorage.setItem("auth_token", t), token);
  await pageI.evaluate((name) => localStorage.setItem("username", name), interviewerName);
  await pageI.goto(roomUrl);
  await pageI.locator(".monaco-editor").first().waitFor({ timeout: 10000 });
  await pageI.waitForTimeout(1000);

  console.log("\n2. Loading Candidate (Bob)...");
  await pageC.goto(roomUrl);
  await pageC.evaluate((name) => localStorage.setItem("username", name), candidateName);
  await pageC.goto(roomUrl);
  await pageC.locator(".monaco-editor").first().waitFor({ timeout: 10000 });
  await pageC.waitForTimeout(1000);

  console.log("\n3. Candidate types...");
  await pageC.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      editor.setPosition({ lineNumber: 1, column: 10 });
      editor.trigger('keyboard', 'type', { text: "Candidate typing" });
    }
  });

  await pageI.waitForTimeout(1500);

  console.log("\n4. Interviewer types...");
  await pageI.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      editor.setPosition({ lineNumber: 2, column: 5 });
      editor.trigger('keyboard', 'type', { text: "Interviewer typing" });
    }
  });

  await pageI.waitForTimeout(1500);

  // Inspect DOM labels visible to each user
  const domI = await pageI.evaluate(() => {
    return Array.from(document.querySelectorAll(".y-remote-cursor-label")).map(el => el.textContent);
  });

  const domC = await pageC.evaluate(() => {
    return Array.from(document.querySelectorAll(".y-remote-cursor-label")).map(el => el.textContent);
  });

  await browser.close();

  console.log("\n=== VERIFICATION RESULTS ===");
  console.log("Interviewer Screen Visible Labels:", domI, "(Expected ONLY Candidate's name)");
  console.log("Candidate Screen Visible Labels:", domC, "(Expected ONLY Interviewer's name)");

  console.log("\nLast Interviewer updateAwareness log:", logsI[logsI.length - 1]);
  console.log("Last Candidate updateAwareness log:", logsC[logsC.length - 1]);
}

runArchitectureTest().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
