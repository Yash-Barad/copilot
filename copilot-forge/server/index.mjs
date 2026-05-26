import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile();

const PORT = Number(process.env.PORT) || 3000;
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE = (process.env.OPENAI_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function resolveOpenAiUrl(base) {
  const b = (base || OPENAI_BASE).replace(/\/$/, "");
  return b.includes("/chat/completions") ? b : `${b}/chat/completions`;
}

async function proxyEnhance(body) {
  const apiKey = body.apiKey?.trim() || OPENAI_KEY;
  if (!apiKey) {
    throw new Error("Set OPENAI_API_KEY in .env or pass apiKey in the request.");
  }

  const baseUrl = body.baseUrl?.trim() || OPENAI_BASE;
  const isAzure = /azure/i.test(baseUrl);
  const model = body.hasImage && body.imageDataUrl ? "gpt-4o" : "gpt-4o-mini";

  const userContent = body.hasImage && body.imageDataUrl
    ? [
        { type: "text", text: body.userText },
        { type: "image_url", image_url: { url: body.imageDataUrl, detail: "low" } },
      ]
    : body.userText;

  const headers = {
    "Content-Type": "application/json",
    ...(isAzure ? { "api-key": apiKey } : { Authorization: `Bearer ${apiKey}` }),
  };

  const res = await fetch(resolveOpenAiUrl(baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: body.model || model,
      temperature: 0.25,
      max_tokens: 1400,
      messages: [
        { role: "system", content: body.systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.message || `OpenAI error ${res.status}`);
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty response from OpenAI.");
  return { content, modelUsed: model };
}

function serveStatic(urlPath, res) {
  let filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  if (url.pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        ok: true,
        hasServerKey: Boolean(OPENAI_KEY),
      })
    );
  }

  if (url.pathname === "/api/enhance" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}");
      const result = await proxyEnhance(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === "GET") {
    return serveStatic(url.pathname, res);
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Copilot Prompt Studio → http://localhost:${PORT}`);
  console.log(
    OPENAI_KEY
      ? "OpenAI: server key loaded from OPENAI_API_KEY"
      : "OpenAI: no server key — users must enter key in the app"
  );
});
