import { chromium } from "playwright";
import axios from "axios";

async function runRemovalVerificationTest() {
  console.log("=== VERIFYING COMPLETE REMOVAL OF FLOATING CURSOR NAME LABELS ===");
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
      { username: interviewerName, question: "Removal Test" },
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

  console.log("1. Opening Interviewer (Alice) & Candidate (Bob)...");
  await pageI.goto(roomUrl);
  if (token) await pageI.evaluate((t) => localStorage.setItem("auth_token", t), token);
  await pageI.evaluate((name) => localStorage.setItem("username", name), interviewerName);
  await pageI.goto(roomUrl);
  await pageI.locator(".monaco-editor").first().waitFor({ timeout: 10000 });

  await pageC.goto(roomUrl);
  await pageC.evaluate((name) => localStorage.setItem("username", name), candidateName);
  await pageC.goto(roomUrl);
  await pageC.locator(".monaco-editor").first().waitFor({ timeout: 10000 });

  await pageI.waitForTimeout(1500);

  console.log("2. Interviewer positions cursor at Line 1, Column 5. Candidate positions cursor at Line 1, Column 5 (Overlapping)...");
  await pageI.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      editor.setPosition({ lineNumber: 1, column: 5 });
      editor.focus();
    }
  });

  await pageC.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      editor.setPosition({ lineNumber: 1, column: 5 });
      editor.focus();
    }
  });

  await pageI.waitForTimeout(1500);

  console.log("3. Candidate selects text across Line 1, Col 1 to Col 15...");
  await pageC.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      const monaco = window.monaco;
      editor.setSelection(new monaco.Selection(1, 1, 1, 15));
    }
  });

  await pageI.waitForTimeout(1500);

  // Inspect Interviewer's screen
  const viewI = await pageI.evaluate(() => {
    const nameLabelElements = document.querySelectorAll(".y-remote-cursor-label");
    const caretHeadElements = document.querySelectorAll(".yRemoteSelectionHead");
    const selectionElements = document.querySelectorAll(".yRemoteSelection");
    const participantBadges = document.querySelectorAll(".participant-badge");

    const selStyles = Array.from(selectionElements).map(el => window.getComputedStyle(el).backgroundColor);
    const caretStyles = Array.from(caretHeadElements).map(el => window.getComputedStyle(el).borderLeftColor);

    return {
      nameLabelCount: nameLabelElements.length,
      caretHeadCount: caretHeadElements.length,
      selectionCount: selectionElements.length,
      participantBadgeCount: participantBadges.length,
      selStyles,
      caretStyles
    };
  });

  // Inspect Candidate's screen
  const viewC = await pageC.evaluate(() => {
    const nameLabelElements = document.querySelectorAll(".y-remote-cursor-label");
    const caretHeadElements = document.querySelectorAll(".yRemoteSelectionHead");
    const selectionElements = document.querySelectorAll(".yRemoteSelection");
    const participantBadges = document.querySelectorAll(".participant-badge");

    return {
      nameLabelCount: nameLabelElements.length,
      caretHeadCount: caretHeadElements.length,
      selectionCount: selectionElements.length,
      participantBadgeCount: participantBadges.length
    };
  });

  await browser.close();

  console.log("\n================ NAME LABEL REMOVAL VERIFICATION ================");

  console.log("\n1. INTERVIEWER SCREEN:");
  console.log("   - Floating Name Tag Count (EXPECTED: 0):", viewI.nameLabelCount);
  console.log("   - Remote Caret Bar Count (EXPECTED: >= 1):", viewI.caretHeadCount, "(Border colors:", viewI.caretStyles, ")");
  console.log("   - Remote Text Selection Highlight Count (EXPECTED: >= 1):", viewI.selectionCount, "(Bg colors:", viewI.selStyles, ")");
  console.log("   - Participant List Badges Count (EXPECTED: >= 1):", viewI.participantBadgeCount);

  console.log("\n2. CANDIDATE SCREEN:");
  console.log("   - Floating Name Tag Count (EXPECTED: 0):", viewC.nameLabelCount);
  console.log("   - Remote Caret Bar Count (EXPECTED: >= 1):", viewC.caretHeadCount);
  console.log("   - Participant List Badges Count (EXPECTED: >= 1):", viewC.participantBadgeCount);

  console.log("\n--- FINAL VERIFICATION CHECKLIST ---");
  console.log("1. Zero floating name labels/tags present on both screens:", viewI.nameLabelCount === 0 && viewC.nameLabelCount === 0);
  console.log("2. Remote colored caret vertical bar still renders:", viewI.caretHeadCount > 0 && viewC.caretHeadCount > 0);
  console.log("3. Remote soft text selection highlight still renders:", viewI.selectionCount > 0);
  console.log("4. Participant badges untouched:", viewI.participantBadgeCount > 0 && viewC.participantBadgeCount > 0);
}

runRemovalVerificationTest().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
