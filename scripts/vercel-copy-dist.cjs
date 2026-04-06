const fs = require("node:fs");
const path = require("node:path");

const sourceDir = path.resolve(__dirname, "..", "frontend", "dist");
const targetDir = path.resolve(__dirname, "..", "dist");

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Frontend build output not found: ${sourceDir}`);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });
console.log("Copied frontend/dist to dist for Vercel output.");
