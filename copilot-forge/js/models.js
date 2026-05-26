/** GitHub Copilot models shown as recommendations */
export const COPILOT_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", badge: "Default", badgeColor: "#475569", best: ["General bugs", "UI issues", "Auth errors"], desc: "Best all-rounder with vision. Default in Copilot Chat.", vision: true },
  { id: "claude-sonnet", name: "Claude Sonnet 4", badge: "Reasoning", badgeColor: "#1e40af", best: ["Complex logic", "Long stack traces"], desc: "Deep reasoning over long logs and multi-file context.", vision: true },
  { id: "o3", name: "o3", badge: "Deep think", badgeColor: "#6d28d9", best: ["Performance", "Security", "Hard bugs"], desc: "Extended thinking for genuinely difficult problems.", vision: false },
  { id: "gemini-2.0", name: "Gemini 2.0 Flash", badge: "Fast", badgeColor: "#0891b2", best: ["Huge logs", "Data pipelines"], desc: "Massive context window. Great for infra and data tickets.", vision: true },
  { id: "o4-mini", name: "o4-mini", badge: "Balanced", badgeColor: "#2563eb", best: ["API errors", "Test failures", "CI/CD"], desc: "Reasoning at lower cost. Sweet spot for most coding bugs.", vision: true },
  { id: "claude-opus", name: "Claude Opus 4", badge: "Powerful", badgeColor: "#b45309", best: ["Architecture", "Multi-system"], desc: "Most capable for ambiguous, hard-to-diagnose issues.", vision: true },
  { id: "gpt-4.1", name: "GPT-4.1", badge: "Coding", badgeColor: "#0d9488", best: ["Large codebases", "Repo-wide bugs"], desc: "Optimized for coding with very large context.", vision: true },
  { id: "o3-mini", name: "o3-mini", badge: "Efficient", badgeColor: "#059669", best: ["Logic bugs", "Math-heavy tasks"], desc: "Efficient reasoning — speed and depth balanced.", vision: false },
];

export const ISSUE_LABELS = {
  UI_BUG: "UI", API_ERROR: "API", PERF: "Performance", AUTH: "Auth", DATA: "Data",
  CONFIG: "Config", INFRA: "Infra", SECURITY: "Security", REGRESSION: "Regression",
  TEST: "Test", UNKNOWN: "General",
};

export const SEV_COLORS = { P0: "#c45c5c", P1: "#c49a5c", P2: "#8a8a7a", P3: "#6b9a7a" };
