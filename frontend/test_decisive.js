import { chromium } from "playwright";
import axios from "axios";

async function runDecisiveTest() {
  console.log("=== DECISIVE TEST: Isolated Incognito Contexts & Line 1 vs Line 20 ===");
  const ts = Date.now().toString().slice(-6);
  const interviewerName = "Alice_" + ts;
  const candidateName = "Bob_" + ts;

  // 1. Register interviewer via REST
  let token = "";
  try {
    const regRes = await axios.post("http://localhost:4000/api/auth/register", {
      username: interviewerName,
      email: `interviewer${timestamp}@test.com`,
      password: "password123",
      role: "interviewer"
    });
    token = regRes.data.token;
    console.log("[Setup] Interviewer registered.");
  } catch (err) {
    console.log("[Setup] Register error:", err.code, err.message, err.response?.data);
  }

  // 2. Create room via REST
  let roomId = "";
  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const roomRes = await axios.post("http://localhost:4000/api/room/create",
      { username: interviewerName, question: "Decisive Test Question" },
      { headers }
    );
    roomId = roomRes.data.roomId;
    console.log("[Setup] Room created ID:", roomId);
  } catch (err) {
    console.error("[Setup] Room create failed:", err.code, err.message, err.response?.data);
    process.exit(1);
  }

  const roomUrl = `http://localhost:5173/?room=${roomId}`;
  const browser = await chromium.launch({ headless: true });

  // Create two completely isolated incognito browser contexts
  const ctxInterviewer = await browser.newContext();
  const ctxCandidate = await browser.newContext();

  const pageI = await ctxInterviewer.newPage();
  const pageC = await ctxCandidate.newPage();

  console.log("\n--- Step 1: Open Interviewer session in Incognito Context 1 ---");
  await pageI.goto(roomUrl);
  if (token) await pageI.evaluate((t) => localStorage.setItem("auth_token", t), token);
  await pageI.evaluate((name) => localStorage.setItem("username", name), interviewerName);
  await pageI.goto(roomUrl);
  await pageI.locator(".monaco-editor").first().waitFor({ timeout: 10000 });
  await pageI.waitForTimeout(1000);

  // Interviewer populates 25 lines of code so Line 20 exists
  console.log("[Interviewer] Populating multiline code (25 lines)...");
  await pageI.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      const lines = [];
      for (let i = 1; i <= 25; i++) {
        lines.push(`// Line ${i}: initial content`);
      }
      editor.getModel().setValue(lines.join("\n"));
      // Set Interviewer cursor explicitly on Line 1, Column 5
      editor.setPosition({ lineNumber: 1, column: 5 });
      editor.focus();
    }
  });

  await pageI.waitForTimeout(1500);

  console.log("\n--- Step 2: Open Candidate session in Incognito Context 2 ---");
  await pageC.goto(roomUrl);
  await pageC.evaluate((name) => localStorage.setItem("username", name), candidateName);
  await pageC.goto(roomUrl);
  await pageC.locator(".monaco-editor").first().waitFor({ timeout: 10000 });
  await pageC.waitForTimeout(1500);

  console.log("\n--- Step 3: Explicitly move Candidate cursor to Line 20 ---");
  await pageC.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      // Set Candidate cursor explicitly on Line 20, Column 10
      editor.setPosition({ lineNumber: 20, column: 10 });
      editor.focus();
    }
  });

  await pageC.waitForTimeout(1000);

  console.log("\n--- Step 4: Candidate types on Line 20 ---");
  await pageC.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      editor.trigger('keyboard', 'type', { text: " [Candidate typing on line 20]" });
    }
  });

  await pageC.waitForTimeout(1500);

  // Capture candidate view details
  const candidateView = await pageC.evaluate(() => {
    const editor = window.__monaco_editor__;
    const pos = editor ? editor.getPosition() : null;
    const labels = Array.from(document.querySelectorAll(".y-remote-cursor-label")).map(el => ({
      text: el.textContent,
      top: el.getBoundingClientRect().top,
      left: el.getBoundingClientRect().left
    }));
    return {
      caretPosition: pos ? { lineNumber: pos.lineNumber, column: pos.column } : null,
      labelsVisibleOnScreen: labels
    };
  });

  console.log("\n--- Step 5: Interviewer types on Line 1 ---");
  await pageI.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      editor.setPosition({ lineNumber: 1, column: 5 });
      editor.focus();
      editor.trigger('keyboard', 'type', { text: " [Interviewer typing on line 1]" });
    }
  });

  await pageI.waitForTimeout(1500);

  // Capture interviewer view details
  const interviewerView = await pageI.evaluate(() => {
    const editor = window.__monaco_editor__;
    const pos = editor ? editor.getPosition() : null;
    const labels = Array.from(document.querySelectorAll(".y-remote-cursor-label")).map(el => ({
      text: el.textContent,
      top: el.getBoundingClientRect().top,
      left: el.getBoundingClientRect().left
    }));
    return {
      caretPosition: pos ? { lineNumber: pos.lineNumber, column: pos.column } : null,
      labelsVisibleOnScreen: labels
    };
  });

  await browser.close();

  console.log("\n================ DECISIVE TEST RESULTS ================");
  console.log("\n1. CANDIDATE SCREEN (Candidate caret at Line 20):");
  console.log("   - Candidate's local caret position:", JSON.stringify(candidateView.caretPosition));
  console.log("   - Labels visible on Candidate's screen:", JSON.stringify(candidateView.labelsVisibleOnScreen, null, 2));

  console.log("\n2. INTERVIEWER SCREEN (Interviewer caret at Line 1):");
  console.log("   - Interviewer's local caret position:", JSON.stringify(interviewerView.caretPosition));
  console.log("   - Labels visible on Interviewer's screen:", JSON.stringify(interviewerView.labelsVisibleOnScreen, null, 2));

  // Assertions
  const cSeesOwnName = candidateView.labelsVisibleOnScreen.some(l => l.text.includes(candidateName));
  const iSeesOwnName = interviewerView.labelsVisibleOnScreen.some(l => l.text.includes(interviewerName));

  console.log("\n--- VERIFICATION SUMMARY ---");
  console.log(`Candidate sees Candidate's OWN name label on Candidate's screen: ${cSeesOwnName} (EXPECTED: false)`);
  console.log(`Interviewer sees Interviewer's OWN name label on Interviewer's screen: ${iSeesOwnName} (EXPECTED: false)`);
}

runDecisiveTest().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
