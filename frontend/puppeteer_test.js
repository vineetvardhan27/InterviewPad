import puppeteer from 'puppeteer';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const browser = await puppeteer.launch({ headless: "new" });
  
  console.log("=== Tab 1: Alice ===");
  const page1 = await browser.newPage();
  
  // Intercept WebSocket frames on Page 1
  const client1 = await page1.target().createCDPSession();
  await client1.send('Network.enable');
  client1.on('Network.webSocketFrameReceived', ({ response }) => {
    console.log(`[Tab 1 RECEIVED] ${response.payloadData}`);
  });
  client1.on('Network.webSocketFrameSent', ({ response }) => {
    console.log(`[Tab 1 SENT] ${response.payloadData}`);
  });

  await page1.goto('http://localhost:5173');
  await sleep(1000);
  
  // Login as Alice
  await page1.type('input[placeholder="Enter your name"]', 'Alice');
  await page1.click('button:has-text("Continue as Guest")');
  await sleep(1000);
  
  // Create Room
  await page1.click('button:has-text("Start interview")');
  await sleep(2000);
  
  const url = page1.url();
  const roomId = new URL(url).searchParams.get('room');
  console.log(`Room created: ${roomId}`);
  
  console.log("\n=== Tab 2: Bob ===");
  const page2 = await browser.newPage();
  
  // Intercept WebSocket frames on Page 2
  const client2 = await page2.target().createCDPSession();
  await client2.send('Network.enable');
  client2.on('Network.webSocketFrameReceived', ({ response }) => {
    console.log(`[Tab 2 RECEIVED] ${response.payloadData}`);
  });
  client2.on('Network.webSocketFrameSent', ({ response }) => {
    console.log(`[Tab 2 SENT] ${response.payloadData}`);
  });

  await page2.goto('http://localhost:5173');
  await sleep(1000);
  
  // Login as Bob
  await page2.type('input[placeholder="Enter your name"]', 'Bob');
  await page2.click('button:has-text("Continue as Guest")');
  await sleep(1000);
  
  // Join Room
  await page2.type('input[placeholder="Enter room code"]', roomId);
  await page2.click('button:has-text("Join room")');
  await sleep(3000);

  // Bob types code
  console.log("\n=== Bob types code ===");
  // We can't easily type in monaco without complex selectors, but we can evaluate JS to simulate the code change handler
  await page2.evaluate(() => {
    window.__socket.emit("code-change", { roomId: new URL(window.location.href).searchParams.get('room'), code: "test code", version: 0 });
  });
  await sleep(2000);
  
  await browser.close();
}

run().catch(err => {
  console.error("Puppeteer test failed:", err);
  process.exit(1);
});
