const VALID_MODELS = new Set([
  "gpt-4o", "claude-sonnet", "o3", "gemini-2.0", "o4-mini",
  "claude-opus", "gpt-4.1", "o3-mini",
]);

const VALID_ISSUES = new Set([
  "UI_BUG", "API_ERROR", "PERF", "AUTH", "DATA", "CONFIG",
  "INFRA", "SECURITY", "REGRESSION", "TEST", "UNKNOWN",
]);

const VALID_SEVERITY = new Set(["P0", "P1", "P2", "P3"]);

export function parseMetaBlock(metaPart) {
  const meta = {};
  (metaPart || "").split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx === -1) return;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k && v) meta[k] = v;
  });
  return meta;
}

export function parseEnhancementResponse(raw, extra = {}) {
  const [promptPart, metaPart] = raw.split("|||");
  const meta = parseMetaBlock(metaPart);

  const model = VALID_MODELS.has(meta.RECOMMENDED_MODEL)
    ? meta.RECOMMENDED_MODEL
    : "gpt-4o";

  const issueType = VALID_ISSUES.has(meta.ISSUE_TYPE) ? meta.ISSUE_TYPE : "UNKNOWN";
  const severity = VALID_SEVERITY.has(meta.SEVERITY) ? meta.SEVERITY : "P2";

  return {
    prompt: (promptPart || raw).trim(),
    model,
    modelReason: meta.MODEL_REASON || "Recommended based on your task type.",
    issueType,
    severity,
    ...extra,
  };
}
