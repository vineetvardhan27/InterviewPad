import { chromium } from "playwright";
import axios from "axios";

async function testCursorSwap() {
  console.log("=== Diagnostic Test: Checking Local vs Remote Cursor Identity Swap ===");
  const timestamp = Date.now();
  const interviewerName = "InterviewerAlice" + timestamp;
  const candidateName = "CandidateBob" + timestamp;

  console.log("1. Registering Interviewer via API:", interviewerName);
  let token = "";
  try {
    const regRes = await axios.post("http://localhost:4000/api/auth/register", {
      username: interviewerName,
      email: `interviewer${timestamp}@test.com`,
      password: "password123",
      role: "interviewer"
    });
    token = regRes.data.token;
    console.log("Interviewer registered successfully.");
  } catch (err) {
    console.log("Auth register warning (using guest join):", err.response?.data?.message || err.message);
  }

  console.log("2. Creating Room via API...");
  let roomId = "";
  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const roomRes = await axios.post("http://localhost:4000/api/room/create",
      { username: interviewerName, question: "Cursor Swap Test" },
      { headers }
    );
    roomId = roomRes.data.roomId;
    console.log("Created Room ID:", roomId);
  } catch (err) {
    console.error("Room create failed:", err.message);
    process.exit(1);
  }

  const roomUrl = `http://localhost:5173/?room=${roomId}`;
  const browser = await chromium.launch({ headless: true });
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  const page1 = await context1.newPage(); // Interviewer
  const page2 = await context2.newPage(); // Candidate

  console.log("3. Loading Page 1 (Interviewer:", interviewerName, ")...");
  await page1.goto(roomUrl);
  if (token) await page1.evaluate((t) => localStorage.setItem("auth_token", t), token);
  await page1.evaluate((name) => localStorage.setItem("username", name), interviewerName);
  await page1.goto(roomUrl);
  await page1.locator(".monaco-editor").first().waitFor({ timeout: 10000 });

  console.log("4. Loading Page 2 (Candidate:", candidateName, ")...");
  await page2.goto(roomUrl);
  await page2.evaluate((name) => localStorage.setItem("username", name), candidateName);
  await page2.goto(roomUrl);
  await page2.locator(".monaco-editor").first().waitFor({ timeout: 10000 });

  await page1.waitForTimeout(2000);

  console.log("5. Candidate (Page 2) moves cursor to Line 1 Column 10 and types...");
  await page2.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      const model = editor.getModel();
      model.applyEdits([{ range: model.getFullModelRange(), text: "Line 1: Candidate is typing code here\nLine 2: Interviewer line" }]);
      editor.setPosition({ lineNumber: 1, column: 10 });
    }
  });

  await page1.waitForTimeout(1000);

  console.log("6. Interviewer (Page 1) moves cursor to Line 2 Column 5...");
  await page1.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      editor.setPosition({ lineNumber: 2, column: 5 });
    }
  });

  await page1.waitForTimeout(2000);

  console.log("\n--- DIAGNOSTIC DATA ---");

  const page1State = await page1.evaluate(() => {
    const labels = Array.from(document.querySelectorAll(".y-remote-cursor-label")).map(el => el.textContent);
    const ydoc = window.yjsDoc;
    const awareness = ydoc ? ydoc.awareness : null;
    const localState = awareness ? awareness.getLocalState() : null;
    const allStates = awareness ? Array.from(awareness.getStates().entries()) : [];
    return { labels, clientID: ydoc?.clientID, localState, allStates };
  });

  const page2State = await page2.evaluate(() => {
    const labels = Array.from(document.querySelectorAll(".y-remote-cursor-label")).map(el => el.textContent);
    const ydoc = window.yjsDoc;
    const awareness = ydoc ? ydoc.awareness : null;
    const localState = awareness ? awareness.getLocalState() : null;
    const allStates = awareness ? Array.from(awareness.getStates().entries()) : [];
    return { labels, clientID: ydoc?.clientID, localState, allStates };
  });

  console.log("Page 1 (Interviewer) labels:", page1State.labels);
  console.log("Page 1 local state:", page1State.localState);
  console.log("Page 1 all awareness states:", page1State.allStates);

  console.log("\nPage 2 (Candidate) labels:", page2State.labels);
  console.log("Page 2 local state:", page2State.localState);
  console.log("Page 2 all awareness states:", page2State.allStates);

  await browser.close();
}

testCursorSwap().catch((err) => {
  console.error("Diagnostic error:", err);
  process.exit(1);
});
