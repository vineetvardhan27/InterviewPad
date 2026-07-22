import { chromium } from "playwright";
import axios from "axios";

async function runLiveDiagnostic() {
  console.log("=== LIVE DIAGNOSTIC: Capturing real browser console logs ===");
  const timestamp = Date.now();
  const interviewerName = "InterviewerAlice" + timestamp;
  const candidateName = "CandidateBob" + timestamp;

  let token = "";
  try {
    const regRes = await axios.post("http://localhost:4000/api/auth/register", {
      username: interviewerName,
      email: `interviewer${timestamp}@test.com`,
      password: "password123",
      role: "interviewer"
    });
    token = regRes.data.token;
    console.log("Interviewer registered.");
  } catch (err) {
    console.log("Register failed:", err.response?.data?.message || err.message);
  }

  let roomId = "";
  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const roomRes = await axios.post("http://localhost:4000/api/room/create",
      { username: interviewerName, question: "Cursor Diag" },
      { headers }
    );
    roomId = roomRes.data.roomId;
    console.log("Room ID:", roomId);
  } catch (err) {
    console.error("Room create failed:", err.message);
    process.exit(1);
  }

  const roomUrl = `http://localhost:5173/?room=${roomId}`;
  const browser = await chromium.launch({ headless: true });

  // Separate browser contexts = separate socket connections
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage(); // Interviewer
  const page2 = await ctx2.newPage(); // Candidate

  // Capture ALL console output from page1 and page2
  const p1Logs = [];
  const p2Logs = [];

  page1.on("console", msg => {
    const text = msg.text();
    if (text.includes("[DIAG") || text.includes("[DEBUG")) {
      p1Logs.push("[P1] " + text);
      console.log("[P1 CONSOLE]", text);
    }
  });

  page2.on("console", msg => {
    const text = msg.text();
    if (text.includes("[DIAG") || text.includes("[DEBUG")) {
      p2Logs.push("[P2] " + text);
      console.log("[P2 CONSOLE]", text);
    }
  });

  console.log("\n--- Step 1: Loading Interviewer (Page 1) ---");
  await page1.goto(roomUrl);
  if (token) await page1.evaluate((t) => localStorage.setItem("auth_token", t), token);
  await page1.evaluate((name) => localStorage.setItem("username", name), interviewerName);
  await page1.goto(roomUrl);
  await page1.locator(".monaco-editor").first().waitFor({ timeout: 10000 });
  await page1.waitForTimeout(1500);

  console.log("\n--- Step 2: Loading Candidate (Page 2) ---");
  await page2.goto(roomUrl);
  await page2.evaluate((name) => localStorage.setItem("username", name), candidateName);
  await page2.goto(roomUrl);
  await page2.locator(".monaco-editor").first().waitFor({ timeout: 10000 });
  await page2.waitForTimeout(1500);

  console.log("\n--- Step 3: Candidate types and moves cursor ---");
  await page2.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      const model = editor.getModel();
      model.applyEdits([{ range: model.getFullModelRange(), text: "// Candidate is typing\nLine 2" }]);
      editor.setPosition({ lineNumber: 1, column: 10 });
    }
  });

  await page1.waitForTimeout(2000);

  console.log("\n--- Step 4: Snap DOM state from both pages ---");

  const p1DOM = await page1.evaluate(() => {
    const labels = Array.from(document.querySelectorAll(".y-remote-cursor-label")).map(el => ({
      text: el.textContent,
      transform: window.getComputedStyle(el).transform
    }));
    const ydoc = window.yjsDoc;
    const aw = ydoc?.awareness || null;
    return {
      labels,
      ydocClientId: ydoc?.clientID,
      awarenessClientId: aw?.clientID,
      localAwarenessState: aw?.getLocalState()?.user,
      allStates: aw ? Array.from(aw.getStates().entries()).map(([id, s]) => ({ clientID: id, user: s.user })) : []
    };
  });

  const p2DOM = await page2.evaluate(() => {
    const labels = Array.from(document.querySelectorAll(".y-remote-cursor-label")).map(el => ({
      text: el.textContent,
      transform: window.getComputedStyle(el).transform
    }));
    const ydoc = window.yjsDoc;
    const aw = ydoc?.awareness || null;
    return {
      labels,
      ydocClientId: ydoc?.clientID,
      awarenessClientId: aw?.clientID,
      localAwarenessState: aw?.getLocalState()?.user,
      allStates: aw ? Array.from(aw.getStates().entries()).map(([id, s]) => ({ clientID: id, user: s.user })) : []
    };
  });

  await browser.close();

  console.log("\n=== RAW DIAGNOSTIC DUMP ===\n");

  console.log("--- Page 1 (Interviewer) ---");
  console.log("  DOM labels visible:", JSON.stringify(p1DOM.labels));
  console.log("  ydoc.clientID:", p1DOM.ydocClientId);
  console.log("  awareness.clientID:", p1DOM.awarenessClientId);
  console.log("  localAwarenessState:", JSON.stringify(p1DOM.localAwarenessState));
  console.log("  allAwarenessStates:", JSON.stringify(p1DOM.allStates, null, 2));

  console.log("\n--- Page 2 (Candidate) ---");
  console.log("  DOM labels visible:", JSON.stringify(p2DOM.labels));
  console.log("  ydoc.clientID:", p2DOM.ydocClientId);
  console.log("  awareness.clientID:", p2DOM.awarenessClientId);
  console.log("  localAwarenessState:", JSON.stringify(p2DOM.localAwarenessState));
  console.log("  allAwarenessStates:", JSON.stringify(p2DOM.allStates, null, 2));

  console.log("\n--- Console Logs Captured ---");
  console.log("Page 1 DIAG logs:", p1Logs);
  console.log("Page 2 DIAG logs:", p2Logs);

  // Analysis
  const p2SeesOwnLabel = p2DOM.labels.some(l => l.text === candidateName);
  const p1SeesOwnLabel = p1DOM.labels.some(l => l.text === interviewerName);
  const p2SeesRemoteLabel = p2DOM.labels.some(l => l.text === interviewerName);
  const p1SeesRemoteLabel = p1DOM.labels.some(l => l.text === candidateName);

  console.log("\n=== ANALYSIS ===");
  console.log("Page 2 (Candidate) sees its OWN label:", p2SeesOwnLabel, "(should be FALSE)");
  console.log("Page 1 (Interviewer) sees its OWN label:", p1SeesOwnLabel, "(should be FALSE)");
  console.log("Page 2 (Candidate) sees Interviewer label:", p2SeesRemoteLabel, "(should be TRUE only AFTER Interviewer moves cursor)");
  console.log("Page 1 (Interviewer) sees Candidate label:", p1SeesRemoteLabel, "(should be TRUE)");
}

runLiveDiagnostic().catch(err => {
  console.error("Fatal diagnostic error:", err);
  process.exit(1);
});
