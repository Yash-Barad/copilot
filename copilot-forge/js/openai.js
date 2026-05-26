import {
  DEFAULT_API_BASE,
  OPENAI_TEXT_MODEL,
  OPENAI_VISION_MODEL,
  SYSTEM_PROMPT,
} from "./config.js";
import { parseEnhancementResponse } from "./parser.js";

function buildUserText(prompt, hasImage) {
  return `USER INPUT:
${prompt.slice(0, 12000)}${prompt.length > 12000 ? "\n[truncated for length]" : ""}

SCREENSHOT: ${hasImage ? "YES — reference [See attached screenshot] in the enhanced prompt" : "none"}

Produce the optimized GitHub Copilot prompt and metadata in the required format.`;
}

function buildUserMessage(prompt, hasImage, imageDataUrl) {
  const text = buildUserText(prompt, hasImage);
  if (!hasImage || !imageDataUrl) {
    return { role: "user", content: text };
  }
  return {
    role: "user",
    content: [
      { type: "text", text },
      { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
    ],
  };
}

function resolveEndpoint(baseUrl) {
  const base = (baseUrl || DEFAULT_API_BASE).replace(/\/$/, "");
  if (base.includes("/chat/completions")) return base;
  return `${base}/chat/completions`;
}

function buildHeaders(apiKey, baseUrl) {
  const isAzure = /azure|openai\.azure/i.test(baseUrl || "");
  if (isAzure) {
    return { "Content-Type": "application/json", "api-key": apiKey };
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

async function enhanceViaProxy({ apiKey, baseUrl, prompt, hasImage, imageDataUrl }) {
  const model = hasImage && imageDataUrl ? OPENAI_VISION_MODEL : OPENAI_TEXT_MODEL;
  const res = await fetch("/api/enhance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: apiKey || undefined,
      baseUrl,
      systemPrompt: SYSTEM_PROMPT,
      userText: buildUserText(prompt, hasImage),
      hasImage: Boolean(hasImage && imageDataUrl),
      imageDataUrl,
      model,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Server error (${res.status})`);
  }

  return parseEnhancementResponse(data.content, {
    source: "openai",
    modelUsed: data.modelUsed || model,
    viaProxy: true,
  });
}

async function enhanceDirect({ apiKey, baseUrl, prompt, hasImage, imageDataUrl }) {
  const model = hasImage && imageDataUrl ? OPENAI_VISION_MODEL : OPENAI_TEXT_MODEL;
  const endpoint = resolveEndpoint(baseUrl);
  const headers = buildHeaders(apiKey.trim(), baseUrl);

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.25,
      max_tokens: 1400,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        buildUserMessage(prompt, hasImage, imageDataUrl),
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.message || `OpenAI API error (${res.status})`);
  }

  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty response from OpenAI.");

  return parseEnhancementResponse(raw, { source: "openai", modelUsed: model });
}

/** Check if local dev server proxy is available */
export async function checkProxyHealth() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return { available: false };
    const data = await res.json();
    return { available: true, hasServerKey: Boolean(data.hasServerKey) };
  } catch {
    return { available: false };
  }
}

/**
 * Enhance prompt via OpenAI — prefers same-origin proxy (no CORS), then direct API.
 */
export async function enhanceWithOpenAI({
  apiKey,
  baseUrl,
  prompt,
  hasImage = false,
  imageDataUrl = null,
}) {
  const key = apiKey?.trim();

  try {
    const health = await checkProxyHealth();
    if (health.available) {
      if (!key && !health.hasServerKey) {
        throw new Error("Add an API key or set OPENAI_API_KEY in server .env");
      }
      return await enhanceViaProxy({
        apiKey: key,
        baseUrl,
        prompt,
        hasImage,
        imageDataUrl,
      });
    }
  } catch (err) {
    if (!key) throw err;
  }

  if (!key) {
    throw new Error("OpenAI API key is required. Run npm run dev with .env or enter a key.");
  }

  return enhanceDirect({
    apiKey: key,
    baseUrl,
    prompt,
    hasImage,
    imageDataUrl,
  });
}
