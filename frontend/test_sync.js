import { chromium } from "playwright";

async function enterWorkspace(page, name) {
  const initBtn = page.locator('button:has-text("Initialize Session")');
  if (await initBtn.isVisible()) {
    await initBtn.click();
    await page.waitForTimeout(500);
  }

  const guestInput = page.locator('input[placeholder="Enter your name"]');
  if (await guestInput.isVisible()) {
    await guestInput.fill(name);
    await page.click('button:has-text("Continue as Guest")');
    await page.waitForTimeout(500);
  }
}

async function run() {
  console.log("Starting Playwright sync test...");
  const browser = await chromium.launch({ headless: true });
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  pageA.on("console", (msg) => {
    if (msg.text().includes("[DEBUG")) console.log("TAB A LOG:", msg.text());
  });

  pageB.on("console", (msg) => {
    if (msg.text().includes("[DEBUG")) console.log("TAB B LOG:", msg.text());
  });

  // Tab A setup
  console.log("Navigating Tab A...");
  await pageA.goto("http://localhost:5173/");
  await pageA.waitForTimeout(1000);
  await enterWorkspace(pageA, "UserA");

  // Tab A creates room
  console.log("Tab A creating room...");
  await pageA.click('button:has-text("Start interview")');
  await pageA.waitForTimeout(2000);

  const roomId = await pageA.evaluate(() => {
    const el = document.querySelector('.session-info .info-value');
    return el ? el.textContent.trim() : null;
  });
  console.log("Created Room ID:", roomId);

  if (!roomId || roomId === "Not joined") {
    console.error("Failed to create room!");
    await browser.close();
    return;
  }

  // Tab B setup
  console.log("Navigating Tab B to room:", roomId);
  await pageB.goto(`http://localhost:5173/?room=${roomId}`);
  await pageB.waitForTimeout(1000);
  await enterWorkspace(pageB, "UserB");

  await pageA.waitForTimeout(2000);
  await pageB.waitForTimeout(2000);

  // Tab A types in Monaco
  console.log("Tab A typing in Monaco...");
  const monacoA = pageA.locator('.monaco-editor').first();
  await monacoA.click();
  await pageA.keyboard.type("\n// Hello from Tab A!\nfunction test() {}\n");

  await pageA.waitForTimeout(3000);

  // Inspect Y.Doc text in both tabs
  const textA = await pageA.evaluate(() => window.yjsDoc ? window.yjsDoc.getText("code").toString() : "NO_DOC");
  const textB = await pageB.evaluate(() => window.yjsDoc ? window.yjsDoc.getText("code").toString() : "NO_DOC");

  console.log("FINAL SYNC RESULT:");
  console.log("Tab A Y.Doc text:", JSON.stringify(textA));
  console.log("Tab B Y.Doc text:", JSON.stringify(textB));

  await browser.close();
}

run().catch((e) => console.error("Test error:", e));
