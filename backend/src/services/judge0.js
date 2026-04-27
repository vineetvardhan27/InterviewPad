import axios from "axios";
import { SUPPORTED_LANGUAGES, normalizeLanguage } from "../config/languages.js";

const JUDGE0_URL = process.env.JUDGE0_URL || "https://ce.judge0.com";
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY;

function buildHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (JUDGE0_API_KEY) {
    headers["x-rapidapi-key"] = JUDGE0_API_KEY;
    headers["x-rapidapi-host"] = new URL(JUDGE0_URL).host;
  }
  return headers;
}

export async function runCode({ sourceCode, language, stdin = "" }) {
  if (!JUDGE0_URL) {
    throw new Error("JUDGE0_URL is not configured");
  }

  const normalizedLanguage = normalizeLanguage(language);
  const languageConfig = SUPPORTED_LANGUAGES[normalizedLanguage];
  if (!languageConfig) {
    throw new Error("Unsupported language");
  }

  const headers = buildHeaders();

  const createResponse = await axios.post(
    `${JUDGE0_URL}/submissions?base64_encoded=false&wait=false`,
    {
      source_code: sourceCode,
      language_id: languageConfig.judge0Id,
      stdin
    },
    { headers }
  );

  const token = createResponse.data?.token;
  if (!token) {
    throw new Error("Failed to create Judge0 submission");
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const resultResponse = await axios.get(
      `${JUDGE0_URL}/submissions/${token}?base64_encoded=false`,
      { headers }
    );

    const data = resultResponse.data;
    if (data.status?.id > 2) {
      return {
        stdout: data.stdout || "",
        stderr: data.stderr || "",
        compileOutput: data.compile_output || "",
        status: data.status?.description || "Unknown",
        time: data.time || null,
        memory: data.memory || null
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Execution timed out while waiting for Judge0 result");
}
