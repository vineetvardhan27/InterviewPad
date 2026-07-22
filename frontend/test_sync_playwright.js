import { chromium } from "playwright";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const page1 = await context.newPage();
  const page2 = await context.newPage();

  page1.on('console', msg => console.log('PAGE 1 CONSOLE:', msg.text()));
  page1.on('pageerror', err => console.log('PAGE 1 ERROR:', err.message));
  
  page2.on('console', msg => console.log('PAGE 2 CONSOLE:', msg.text()));
  page2.on('pageerror', err => console.log('PAGE 2 ERROR:', err.message));

  console.log("Navigating Page 1 to root...");
  await page1.goto("http://localhost:5173/");

  // Wait for Landing Page or Auth Page
  try {
    // If landing page is present, click Initialize Session
    await page1.waitForSelector('.bp-btn-init', { timeout: 3000 });
    console.log("Found Landing Page. Clicking Initialize Session...");
    await page1.click('.bp-btn-init');
  } catch(e) {
    console.log("No Landing Page. Proceeding...");
  }

  // AuthScreen handling
  // If we see AuthScreen, we select Interviewer role, then type credentials
  try {
    console.log("Looking for For Interviewers tab...");
    // The text is "For Interviewers" in landing page, but in AuthScreen it's "Sign Up" or "Sign In"
    // Let's just create a test room via UI or API.
    await page1.waitForSelector('button.auth-tab', { timeout: 3000 });
    // Click Sign Up
    await page1.click('button.auth-tab:has-text("Sign Up")');
    await page1.fill('input[placeholder="Username"]', "host" + Date.now());
    await page1.fill('input[placeholder="Email"]', "host" + Date.now() + "@test.com");
    await page1.fill('input[placeholder="Password"]', "password");
    // Select interviewer role
    await page1.selectOption('select', 'interviewer');
    await page1.click('button[type="submit"]');
  } catch (e) {
    console.log("Auth step skipped or failed:", e.message);
  }

  // Create room
  try {
    console.log("Waiting for Create New Room button...");
    await page1.waitForSelector('button:has-text("Create New Room")', { timeout: 10000 });
    await page1.click('button:has-text("Create New Room")');
  } catch (e) {
    console.log("Failed to create room:", e.message);
  }
  
  // Wait for editor on Page 1
  try {
    await page1.waitForSelector('.monaco-editor', { timeout: 10000 });
    console.log("Page 1 Editor loaded!");
  } catch(e) {
    console.log("Editor didn't load. Page HTML:");
    console.log(await page1.content());
    await browser.close();
    return;
  }
  
  // Extract room ID from URL
  const url1 = page1.url();
  console.log("Room URL:", url1);

  console.log("Navigating Page 2 to Room URL...");
  await page2.goto(url1);
  
  try {
    // Guest continue on Page 2
    await page2.waitForSelector('input[placeholder="Enter your name"]', { timeout: 3000 });
    await page2.fill('input[placeholder="Enter your name"]', "guest" + Date.now());
    await page2.click('button:has-text("Join as Guest")');
  } catch(e) {
    console.log("Guest join skipped or failed");
  }

  // Wait for editor on Page 2
  await page2.waitForSelector('.monaco-editor', { timeout: 10000 });
  console.log("Page 2 Editor loaded!");

  // Type in Page 1
  console.log("Typing in Page 1...");
  await page1.evaluate(() => {
    const editor = window.monaco.editor.getEditors()[0];
    editor.setValue("Hello from Page 1!");
  });

  console.log("Waiting 3 seconds...");
  await page1.waitForTimeout(3000);

  // Check Page 2
  const text2 = await page2.evaluate(() => {
    const editor = window.monaco.editor.getEditors()[0];
    return editor.getValue();
  });

  console.log("Text in Page 2:", text2);

  if (text2 === "Hello from Page 1!") {
    console.log("SUCCESS: Sync works!");
  } else {
    console.error("FAILURE: Sync failed.");
  }

  await browser.close();
}

run().catch(console.error);
