import { chromium } from "playwright";
import axios from "axios";

async function testRemoteCursors() {
  console.log("=== Testing Remote Cursor Identity, Self-Exclusion, and Placement ===");
  const timestamp = Date.now();
  const user1Name = "AliceInterviewer_" + timestamp;
  const user2Name = "BobCandidate_" + timestamp;

  console.log("1. Registering Host Interviewer via API:", user1Name);
  let token = "";
  try {
    const regRes = await axios.post("http://localhost:4000/api/auth/register", {
      username: user1Name,
      email: `${user1Name}@test.com`,
      password: "password123",
      role: "interviewer"
    });
    token = regRes.data.token;
  } catch (err) {
    console.error("Auth register failed:", err.message);
    process.exit(1);
  }

  console.log("2. Creating Room via API...");
  let roomId = "";
  try {
    const roomRes = await axios.post("http://localhost:4000/api/room/create",
      { username: user1Name, question: "Cursor Label Test" },
      { headers: { Authorization: `Bearer ${token}` } }
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

  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  console.log("3. Loading Page 1 (User 1:", user1Name, ")...");
  await page1.goto(roomUrl);
  await page1.evaluate((t) => localStorage.setItem("auth_token", t), token);
  await page1.goto(roomUrl);
  await page1.locator(".monaco-editor").first().waitFor({ timeout: 10000 });
  console.log("Page 1 Editor loaded!");

  console.log("4. Loading Page 2 (User 2:", user2Name, ")...");
  await page2.goto(roomUrl);
  await page2.evaluate((name) => localStorage.setItem("username", name), user2Name);
  await page2.goto(roomUrl);
  await page2.locator(".monaco-editor").first().waitFor({ timeout: 10000 });
  console.log("Page 2 Editor loaded!");

  await page1.waitForTimeout(2000);

  console.log("5. User 1 typing code and setting cursor...");
  await page1.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      const model = editor.getModel();
      model.applyEdits([{ range: model.getFullModelRange(), text: "// Alice is editing on line 1\n// Second line of code" }]);
      editor.setPosition({ lineNumber: 1, column: 10 });
    }
  });

  await page1.waitForTimeout(2000);

  console.log("6. Verifying User 1's cursor label on Page 2 and self-exclusion on Page 1...");
  const page2Labels = await page2.evaluate(() => {
    const labels = Array.from(document.querySelectorAll(".y-remote-cursor-label"));
    return labels.map(el => ({
      text: el.textContent,
      transform: window.getComputedStyle(el).transform,
      className: el.className
    }));
  });
  console.log("Page 2 Cursor Labels found:", page2Labels);

  console.log("7. User 2 typing code and setting cursor...");
  await page2.evaluate(() => {
    const editor = window.__monaco_editor__;
    if (editor) {
      const model = editor.getModel();
      model.applyEdits([{ range: new window.monaco.Range(2, 1, 2, 1), text: "// Bob added this edit\n" }]);
      editor.setPosition({ lineNumber: 2, column: 5 });
    }
  });

  await page2.waitForTimeout(2000);

  console.log("8. Verifying User 2's cursor label on Page 1 and self-exclusion on Page 2...");
  const page1Labels = await page1.evaluate(() => {
    const labels = Array.from(document.querySelectorAll(".y-remote-cursor-label"));
    return labels.map(el => ({
      text: el.textContent,
      transform: window.getComputedStyle(el).transform,
      className: el.className
    }));
  });
  console.log("Page 1 Cursor Labels found:", page1Labels);

  await browser.close();

  // Assertions
  const page1HasRemoteBob = page1Labels.some(l => l.text === user2Name);
  const page1HasSelfAlice = page1Labels.some(l => l.text === user1Name);

  const page2HasRemoteAlice = page2Labels.some(l => l.text === user1Name);
  const page2HasSelfBob = page2Labels.some(l => l.text === user2Name);

  console.log("\n=== SUMMARY OF VERIFICATION ===");
  console.log(`Page 1 shows Remote User 2 ("${user2Name}"):`, page1HasRemoteBob ? "PASS" : "FAIL");
  console.log(`Page 1 excludes Self User 1 ("${user1Name}"):`, !page1HasSelfAlice ? "PASS" : "FAIL");
  console.log(`Page 2 shows Remote User 1 ("${user1Name}"):`, page2HasRemoteAlice ? "PASS" : "FAIL");
  console.log(`Page 2 excludes Self User 2 ("${user2Name}"):`, !page2HasSelfBob ? "PASS" : "FAIL");

  if (page1HasRemoteBob && !page1HasSelfAlice && page2HasRemoteAlice && !page2HasSelfBob) {
    console.log("\n🎉 ALL TESTS PASSED! Remote cursors render properly, self-labels are 100% excluded. 🎉");
    process.exit(0);
  } else {
    console.error("\n❌ TEST FAILED: Mismatched, missing, or self-rendered cursor identity labels. ❌");
    process.exit(1);
  }
}

testRemoteCursors().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
