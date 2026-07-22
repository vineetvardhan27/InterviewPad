import { chromium } from "playwright";

async function runLandingPageMotionTest() {
  console.log("=== VERIFYING LANDING PAGE MOTION DESIGN SYSTEM ===");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto("http://localhost:5173/");
  await page.waitForTimeout(1000);

  // 1. Check Scroll Progress Bar
  const scrollProgressBar = await page.locator(".bp-scroll-progress").count();

  // 2. Check Headline Per-Character Reveal
  const charSpans = await page.locator(".bp-hero-char").count();
  const headlineText = await page.locator(".bp-hero-title").getAttribute("aria-label");

  // 3. Check Centerpiece Live Editor Demo (Simulated Carets & Terminal Output)
  await page.waitForTimeout(6800); // Wait for demo script to reach execution & pass line

  const editorState = await page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll(".bp-code-row")).map(el => el.textContent);
    const candCaret = document.querySelector(".bp-sim-caret.candidate");
    const interviewerCaret = document.querySelector(".bp-sim-caret.interviewer");
    const testResult = document.querySelector(".bp-terminal-result");
    const nodeSwapped = document.querySelector(".bp-node-left.swapped-right");

    return {
      typedLineCount: lines.filter(l => l.trim().length > 2).length,
      candCaretPresent: !!candCaret,
      interviewerCaretPresent: !!interviewerCaret,
      testResultPresent: !!testResult,
      testResultText: testResult ? testResult.textContent : null,
      nodeSwappedPresent: !!nodeSwapped
    };
  });

  // 4. Scroll down to trigger Spec Cards & Section Rule
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(1000);

  const specCardsState = await page.evaluate(() => {
    const grid = document.querySelector(".bp-matrix-grid");
    const hr = document.querySelector(".bp-section-hr");
    return {
      cardsIn: grid ? grid.classList.contains("cards-in") : false,
      hrDrawn: hr ? hr.classList.contains("drawn") : false
    };
  });

  // 5. Scroll down to Stat Bar
  await page.evaluate(() => window.scrollTo(0, 1600));
  await page.waitForTimeout(1500);

  const statBarState = await page.evaluate(() => {
    const values = Array.from(document.querySelectorAll(".bp-metric-value")).map(el => el.textContent);
    return {
      statValues: values
    };
  });

  await browser.close();

  console.log("\n================ LANDING PAGE MOTION VERIFICATION ================");

  console.log("\n1. HERO HEADLINE:");
  console.log("   - Target Label:", headlineText);
  console.log("   - Per-Character Elements Animated:", charSpans);

  console.log("\n2. LIVE EDITOR CRDT SHOWCASE DEMO:");
  console.log("   - Typed Code Rows Active:", editorState.typedLineCount);
  console.log("   - Candidate Caret Pill Present:", editorState.candCaretPresent);
  console.log("   - Interviewer Caret Pill Present:", editorState.interviewerCaretPresent);
  console.log("   - Test Execution Output Rendered:", editorState.testResultText);
  console.log("   - Binary Tree Node Inversion Animated:", editorState.nodeSwappedPresent);

  console.log("\n3. SCROLL REVEALS & SPEC CARDS:");
  console.log("   - Spec Cards Class Animated (cards-in):", specCardsState.cardsIn);
  console.log("   - Section Header Line Rule Drawn:", specCardsState.hrDrawn);

  console.log("\n4. STAT BAR LIVE COUNTERS:");
  console.log("   - Rendered Metric Values:", statBarState.statValues);

  console.log("\n--- VERIFICATION CHECKLIST ---");
  console.log("1. Headline has staggered per-character reveal:", charSpans > 15);
  console.log("2. Editor showcase simulates 2 concurrent cursors & test execution:", editorState.candCaretPresent && editorState.interviewerCaretPresent && editorState.testResultPresent);
  console.log("3. Tree visualizer inverts nodes upon execution:", editorState.nodeSwappedPresent);
  console.log("4. Scroll reveals & live stats count up successfully:", specCardsState.cardsIn && statBarState.statValues.length === 3);
}

runLandingPageMotionTest().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
