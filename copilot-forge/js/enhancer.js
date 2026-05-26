import { enhanceWithOpenAI } from "./openai.js";
import { parseEnhancementResponse } from "./parser.js";

const MODEL_RULES = [
  { model: "gemini-2.0", weight: 5, reason: "Large context for lengthy logs and multi-file traces", test: (t) => t.length > 2200 || (/\b(log|trace|stack|pipeline|etl)\b/i.test(t) && t.length > 900) },
  { model: "gpt-4.1", weight: 4, reason: "Wide codebase context for file-heavy debugging", test: (t) => /\b(repo|codebase|monorepo|multi-?file|refactor)\b/i.test(t) && t.length > 600 },
  { model: "o3", weight: 5, reason: "Deep reasoning for hard logic, performance, or security issues", test: (t) => /\b(security|vuln|cve|race condition|deadlock|memory leak|algorithm|bottleneck|perf)\b/i.test(t) },
  { model: "o3-mini", weight: 3, reason: "Efficient reasoning for logic and math-heavy bugs", test: (t) => /\b(math|calculation|formula|logic bug|edge case)\b/i.test(t) },
  { model: "claude-opus", weight: 4, reason: "Best for ambiguous architecture and multi-system problems", test: (t) => /\b(architecture|microservice|distributed|unclear|root cause unknown|sporadic)\b/i.test(t) },
  { model: "o4-mini", weight: 4, reason: "Balanced choice for API, test, and CI failures", test: (t) => /\b(api|endpoint|401|403|500|test fail|ci\/cd|pipeline fail|regression)\b/i.test(t) },
  { model: "claude-sonnet", weight: 3, reason: "Strong reasoning for complex traces and long descriptions", test: (t) => /\b(stack trace|exception|nullpointer|typeerror|complex)\b/i.test(t) || t.length > 1200 },
  { model: "gpt-4o", weight: 1, reason: "Reliable all-rounder for general coding tasks", test: () => true },
];

const ISSUE_PATTERNS = [
  ["UI_BUG", /\b(ui|css|layout|button|modal|responsive|render|screenshot|visual|frontend)\b/i],
  ["API_ERROR", /\b(api|endpoint|rest|graphql|401|403|404|500|timeout|fetch)\b/i],
  ["PERF", /\b(slow|latency|perf|performance|bottleneck|memory|cpu)\b/i],
  ["AUTH", /\b(auth|login|oauth|jwt|session|token|password|sso)\b/i],
  ["SECURITY", /\b(security|xss|csrf|injection|vuln|cve)\b/i],
  ["TEST", /\b(test|jest|pytest|spec|assert|coverage|flaky)\b/i],
  ["INFRA", /\b(docker|k8s|kubernetes|deploy|ci\/cd|pipeline|aws|azure)\b/i],
  ["DATA", /\b(sql|database|query|migration|orm|data)\b/i],
  ["CONFIG", /\b(config|env|yaml|settings|feature flag)\b/i],
  ["REGRESSION", /\b(regression|broke after|used to work|recent release)\b/i],
];

function detectIssueType(text) {
  for (const [type, re] of ISSUE_PATTERNS) {
    if (re.test(text)) return type;
  }
  return "UNKNOWN";
}

function detectSeverity(text, issueType) {
  if (/\b(p0|critical|production down|outage|data loss|blocker)\b/i.test(text)) return "P0";
  if (/\b(p1|urgent|high priority|cannot login|security)\b/i.test(text) || issueType === "SECURITY") return "P1";
  if (/\b(p3|low|minor|cosmetic|nice to have)\b/i.test(text)) return "P3";
  return "P2";
}

function pickModel(text, hasImage) {
  if (hasImage || /\b(screenshot|ui|visual|layout|css|pixel)\b/i.test(text)) {
    return { id: "gpt-4o", reason: "Vision-capable model for UI and screenshot-driven debugging" };
  }
  let best = { id: "gpt-4o", reason: MODEL_RULES[MODEL_RULES.length - 1].reason, score: 0 };
  for (const rule of MODEL_RULES) {
    if (rule.test(text) && rule.weight > best.score) {
      best = { id: rule.model, reason: rule.reason, score: rule.weight };
    }
  }
  return { id: best.id, reason: best.reason };
}

function firstLine(text) {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean);
  return line?.slice(0, 120) || "Development task";
}

function extractBlocks(text) {
  const blocks = { context: [], steps: [], expected: [], actual: [], errors: [] };
  const lines = text.split("\n");
  let section = "context";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (/^(steps|repro|reproduce|to reproduce)/.test(lower)) { section = "steps"; continue; }
    if (/^(expected|should|want)/.test(lower)) { section = "expected"; continue; }
    if (/^(actual|but|instead|got|result)/.test(lower)) { section = "actual"; continue; }
    if (/^(error|log|stack|trace|exception)/.test(lower) || /exception|error:|at \w+\./i.test(line)) {
      section = "errors";
    }
    blocks[section].push(line);
  }
  return blocks;
}

function compactList(items, max = 8) {
  return items.slice(0, max).map((l) => `• ${l}`).join("\n");
}

/** Offline fallback when no API key or API fails */
export function enhancePromptLocal(rawInput, { hasImage = false } = {}) {
  const text = rawInput.trim();
  const issueType = detectIssueType(text);
  const severity = detectSeverity(text, issueType);
  const { id: modelId, reason: modelReason } = pickModel(text, hasImage);
  const blocks = extractBlocks(text);
  const title = firstLine(text);

  const role =
    issueType === "UNKNOWN"
      ? "You are a senior software engineer helping me debug and fix this issue."
      : `You are a senior engineer specializing in ${issueType.replace(/_/g, " ").toLowerCase()} issues.`;

  const sections = [`## Role\n${role}`, `## Problem\n${title}`];
  if (blocks.context.length) sections.push(`## Context\n${blocks.context.join("\n")}`);
  else if (text.length > title.length) sections.push(`## Context\n${text.slice(0, 2000)}`);
  if (blocks.steps.length) sections.push(`## Steps to reproduce\n${compactList(blocks.steps)}`);
  if (blocks.expected.length) sections.push(`## Expected\n${compactList(blocks.expected)}`);
  if (blocks.actual.length) sections.push(`## Actual\n${compactList(blocks.actual)}`);
  if (blocks.errors.length) sections.push(`## Errors / logs\n\`\`\`\n${blocks.errors.slice(0, 15).join("\n")}\n\`\`\``);
  if (hasImage) sections.push("## Visual reference\n[See attached screenshot]");
  sections.push(
    "## Your task\n" +
      "1. Identify the most likely root cause\n" +
      "2. Propose a minimal, safe fix with code snippets where relevant\n" +
      "3. List verification steps\n" +
      "4. Note risks or edge cases",
    "## Output format\nConcise bullets, then code blocks only where needed."
  );

  return {
    prompt: sections.join("\n\n"),
    model: modelId,
    modelReason,
    issueType,
    severity,
    source: "local",
  };
}

/**
 * Best-quality enhancement: OpenAI when API key is set, else local fallback.
 */
export async function enhancePrompt(rawInput, options = {}) {
  const {
    apiKey,
    baseUrl,
    hasImage = false,
    imageDataUrl = null,
    preferLocal = false,
  } = options;

  const text = rawInput.trim();
  if (!text) throw new Error("Prompt cannot be empty.");

  if (!preferLocal && apiKey?.trim()) {
    try {
      return await enhanceWithOpenAI({
        apiKey,
        baseUrl,
        prompt: text,
        hasImage,
        imageDataUrl,
      });
    } catch (err) {
      const fallback = enhancePromptLocal(text, { hasImage });
      fallback.source = "local";
      fallback.fallbackReason = err.message;
      return fallback;
    }
  }

  return enhancePromptLocal(text, { hasImage });
}
