import { chromium } from "playwright";
import axios from "axios";

async function runVisualBugTest() {
  console.log("=== TESTING SELECTION HIGHLIGHT & SINGLE CARET VISUALS ===");
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
      { username: interviewerName, question: "Visual Test" },
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

  console.log("1. Loading Interviewer & Candidate...");
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

  console.log("2. Interviewer selects a range of text (line 1, col 1 to col 25)...");
  await pageI.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      const monaco = window.monaco;
      editor.setSelection(new monaco.Selection(1, 1, 1, 25));
    }
  });

  await pageC.waitForTimeout(1500);

  // Inspect selection decoration styling on Candidate's screen
  const candidateView = await pageC.evaluate(() => {
    const selEls = Array.from(document.querySelectorAll(".yRemoteSelection"));
    const styles = selEls.map(el => ({
      bg: window.getComputedStyle(el).backgroundColor
    }));

    // Check how many cursor-like elements (e.g. .yRemoteSelectionHead or local cursor boxes) exist
    const caretHeadEls = Array.from(document.querySelectorAll(".yRemoteSelectionHead"));

    return {
      remoteSelectionCount: selEls.length,
      remoteSelectionBgColors: styles,
      remoteCaretCount: caretHeadEls.length
    };
  });

  console.log("3. Candidate clicks and types on Line 2...");
  await pageC.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      editor.setPosition({ lineNumber: 2, column: 5 });
      editor.focus();
    }
  });

  await pageC.waitForTimeout(1000);

  const localCaretCheck = await pageC.evaluate(() => {
    // Check local inline underline indicator
    const inlineUnderlines = document.querySelectorAll(".local-caret-inline-underline");
    // Check if any secondary cursor box exists
    const secondaryBoxes = document.querySelectorAll(".local-caret-you-indicator");
    return {
      inlineUnderlineCount: inlineUnderlines.length,
      secondaryBoxCount: secondaryBoxes.length
    };
  });

  await browser.close();

  console.log("\n================ VISUAL BUG TEST RESULTS ================");
  console.log("\n1. SELECTION HIGHLIGHT TEST (Candidate viewing Interviewer's selection):");
  console.log("   - Selection Elements Found:", candidateView.remoteSelectionCount);
  console.log("   - Selection Background Colors (expect rgba with 0.2 alpha, not solid):", JSON.stringify(candidateView.remoteSelectionBgColors, null, 2));

  console.log("\n2. LOCAL CARET TEST (Candidate typing on screen):");
  console.log("   - Inline Underline Count (expect 1):", localCaretCheck.inlineUnderlineCount);
  console.log("   - Secondary Cursor Box Count (expect 0):", localCaretCheck.secondaryBoxCount);

  // Assertions
  const bgIsTransparent = candidateView.remoteSelectionBgColors.every(s => s.bg.includes("rgba") || s.bg.includes("0.2"));
  const singleCaretVerified = localCaretCheck.inlineUnderlineCount >= 1 && localCaretCheck.secondaryBoxCount === 0;

  console.log("\n--- VERIFICATION CHECKLIST ---");
  console.log("1. Selection highlight uses soft semi-transparent background:", bgIsTransparent);
  console.log("2. Local caret uses single native caret with subtle inline underline (0 secondary cursor boxes):", singleCaretVerified);
}

runVisualBugTest().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
