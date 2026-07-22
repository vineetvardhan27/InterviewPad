import { chromium } from "playwright";
import axios from "axios";

async function runOverlapTest() {
  console.log("=== TESTING COINCIDENT CARET OVERLAP CLARITY ===");
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
      { username: interviewerName, question: "Overlap Test" },
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

  console.log("1. Opening Interviewer (Alice)...");
  await pageI.goto(roomUrl);
  if (token) await pageI.evaluate((t) => localStorage.setItem("auth_token", t), token);
  await pageI.evaluate((name) => localStorage.setItem("username", name), interviewerName);
  await pageI.goto(roomUrl);
  await pageI.locator(".monaco-editor").first().waitFor({ timeout: 10000 });

  console.log("2. Opening Candidate (Bob)...");
  await pageC.goto(roomUrl);
  await pageC.evaluate((name) => localStorage.setItem("username", name), candidateName);
  await pageC.goto(roomUrl);
  await pageC.locator(".monaco-editor").first().waitFor({ timeout: 10000 });

  await pageI.waitForTimeout(1500);

  console.log("3. Both users navigate to EXACT SAME line & column (Line 1, Column 10)...");

  // Move both users to exact same position: Line 1, Column 10
  await pageI.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      editor.setPosition({ lineNumber: 1, column: 10 });
      editor.focus();
    }
  });

  await pageC.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      editor.setPosition({ lineNumber: 1, column: 10 });
      editor.focus();
    }
  });

  await pageI.waitForTimeout(1500);

  // Inspect DOM state on both pages
  const stateI = await pageI.evaluate(() => {
    const localIndicator = document.querySelector(".local-caret-you-indicator");
    const remoteLabels = Array.from(document.querySelectorAll(".y-remote-cursor-label")).map(el => ({
      text: el.textContent,
      isShifted: el.classList.contains("shifted-overlap"),
      transform: window.getComputedStyle(el).transform
    }));
    const remoteCarets = Array.from(document.querySelectorAll(".yRemoteSelectionHead")).map(el => ({
      borderColor: window.getComputedStyle(el).borderLeftColor
    }));
    return {
      hasLocalIndicator: !!localIndicator,
      remoteLabels,
      remoteCarets
    };
  });

  const stateC = await pageC.evaluate(() => {
    const localIndicator = document.querySelector(".local-caret-you-indicator");
    const remoteLabels = Array.from(document.querySelectorAll(".y-remote-cursor-label")).map(el => ({
      text: el.textContent,
      isShifted: el.classList.contains("shifted-overlap"),
      transform: window.getComputedStyle(el).transform
    }));
    const remoteCarets = Array.from(document.querySelectorAll(".yRemoteSelectionHead")).map(el => ({
      borderColor: window.getComputedStyle(el).borderLeftColor
    }));
    return {
      hasLocalIndicator: !!localIndicator,
      remoteLabels,
      remoteCarets
    };
  });

  await browser.close();

  console.log("\n================ OVERLAP CLARITY TEST RESULTS ================");

  console.log("\n1. INTERVIEWER SCREEN (Alice at Line 1, Col 10, Candidate Bob at same spot):");
  console.log("   - Local 'You' Caret Indicator Present:", stateI.hasLocalIndicator);
  console.log("   - Remote Labels Visible:", JSON.stringify(stateI.remoteLabels, null, 2));
  console.log("   - Remote Caret Tint Colors:", JSON.stringify(stateI.remoteCarets, null, 2));

  console.log("\n2. CANDIDATE SCREEN (Bob at Line 1, Col 10, Interviewer Alice at same spot):");
  console.log("   - Local 'You' Caret Indicator Present:", stateC.hasLocalIndicator);
  console.log("   - Remote Labels Visible:", JSON.stringify(stateC.remoteLabels, null, 2));
  console.log("   - Remote Caret Tint Colors:", JSON.stringify(stateC.remoteCarets, null, 2));

  console.log("\n--- VERIFICATION CHECKLIST ---");
  console.log("1. Remote label shifts up/right when overlapping local caret:", stateI.remoteLabels.some(l => l.isShifted) && stateC.remoteLabels.some(l => l.isShifted));
  console.log("2. Local 'You' indicator exists on both screens:", stateI.hasLocalIndicator && stateC.hasLocalIndicator);
}

runOverlapTest().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
