import { useState, useRef, useCallback } from "react";

// ─── GitHub Copilot Models (shown as recommendations to user) ─────────────────
const COPILOT_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", badge: "DEFAULT", badgeColor: "#10b981", tokens: "128k ctx", best: ["General bugs", "UI issues", "Auth errors", "Code generation"], cost: "●●○○○", speed: "●●●●○", desc: "Best all-rounder. Handles code + image natively. Default in Copilot Chat.", vision: true },
  { id: "claude-sonnet", name: "Claude Sonnet 4", badge: "REASONING", badgeColor: "#f59e0b", tokens: "200k ctx", best: ["Complex logic bugs", "Long stack traces", "Architecture issues"], cost: "●●●○○", speed: "●●●○○", desc: "Strongest at deep reasoning over long logs and multi-file context.", vision: true },
  { id: "o3", name: "o3", badge: "DEEP THINK", badgeColor: "#8b5cf6", tokens: "200k ctx", best: ["Performance bottlenecks", "Algorithm bugs", "Security vulns"], cost: "●●●●●", speed: "●○○○○", desc: "Extended thinking. Use only for truly hard bugs. Expensive.", vision: false },
  { id: "gemini-2.0", name: "Gemini 2.0 Flash", badge: "FAST", badgeColor: "#06b6d4", tokens: "1M ctx", best: ["Huge log files", "Multi-file repo bugs", "Data pipelines"], cost: "●○○○○", speed: "●●●●●", desc: "1M token context. Lightning fast. Great for data/infra tickets.", vision: true },
  { id: "o4-mini", name: "o4-mini", badge: "BALANCED", badgeColor: "#3b82f6", tokens: "128k ctx", best: ["API errors", "Test failures", "Regression bugs", "CI/CD issues"], cost: "●●○○○", speed: "●●●●○", desc: "Reasoning at lower cost. Great sweet spot for most coding bugs.", vision: true },
  { id: "claude-opus", name: "Claude Opus 4", badge: "POWERFUL", badgeColor: "#a855f7", tokens: "200k ctx", best: ["Deep architecture bugs", "Complex refactors", "Multi-system issues"], cost: "●●●●○", speed: "●●○○○", desc: "Most capable Claude model. For ambiguous, hard-to-diagnose issues.", vision: true },
  { id: "gpt-4.1", name: "GPT-4.1", badge: "CODING", badgeColor: "#f97316", tokens: "1M ctx", best: ["Large codebases", "File-heavy bugs", "Full repo analysis"], cost: "●●●○○", speed: "●●●○○", desc: "Optimized for coding tasks with 1M ctx. Great for large repo bugs.", vision: true },
  { id: "o3-mini", name: "o3-mini", badge: "EFFICIENT", badgeColor: "#22c55e", tokens: "128k ctx", best: ["Quick reasoning", "Math/logic bugs", "Cost-sensitive tasks"], cost: "●●○○○", speed: "●●●●○", desc: "Efficient reasoning model. Good balance of speed, cost, and thinking.", vision: false },
];

// ─── Internal analysis models (what THIS app uses to generate prompts) ─────────
const ANALYSIS_MODELS = [
  { id: "claude-sonnet-4-20250514",   name: "Claude Sonnet 4",   badge: "RECOMMENDED", badgeColor: "#f59e0b", vision: true,  ctx: "200k", note: "Best reasoning + vision. Ideal for most tickets." },
  { id: "claude-haiku-4-5-20251001",  name: "Claude Haiku 4.5",  badge: "FASTEST",     badgeColor: "#10b981", vision: true,  ctx: "200k", note: "Fastest & cheapest. Good for simple/clear tickets." },
  { id: "claude-opus-4-20250514",     name: "Claude Opus 4",     badge: "MOST POWERFUL",badgeColor: "#8b5cf6", vision: true,  ctx: "200k", note: "Deepest reasoning. Best for complex, ambiguous tickets." },
  { id: "claude-sonnet-4-5-20251001", name: "Claude Sonnet 4.5", badge: "LATEST",      badgeColor: "#06b6d4", vision: true,  ctx: "200k", note: "Newest Sonnet. Sharper instruction following." },
];

const META_SYSTEM = `You are a GitHub Copilot Prompt Engineer. Your ONLY job is to write a hyper-optimized prompt that a developer will paste directly into GitHub Copilot Chat.

RULES FOR THE PROMPT YOU WRITE:
1. Token-efficient: no fluff, no pleasantries, no repetition
2. Role-first: start with a one-line role declaration
3. Context-dense: pack all signal, remove all noise
4. Instruction-explicit: tell Copilot exactly what to output (code fix, root cause, next steps)
5. Format-directive: end with output format instruction
6. If screenshot was provided, reference it as "[See attached screenshot]"
7. Max 300 tokens in the generated prompt
8. Use ## headers to separate sections only if needed
9. NO markdown code fences around the prompt itself

ALSO output on separate lines after the prompt (separated by |||):
- RECOMMENDED_MODEL: <model_id from: gpt-4o | claude-sonnet | o3 | gemini-2.0 | o4-mini | claude-opus | gpt-4.1 | o3-mini>
- MODEL_REASON: <one sentence why>
- TOKEN_ESTIMATE: <estimated tokens the prompt will use, number only>
- ISSUE_TYPE: <one of: UI_BUG | API_ERROR | PERF | AUTH | DATA | CONFIG | INFRA | SECURITY | REGRESSION | TEST | UNKNOWN>
- SEVERITY: <P0 | P1 | P2 | P3>

Format exactly like:
<the prompt text here>
|||
RECOMMENDED_MODEL: gpt-4o
MODEL_REASON: ...
TOKEN_ESTIMATE: 180
ISSUE_TYPE: API_ERROR
SEVERITY: P1`;

export default function App() {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [logs, setLogs] = useState("");
  const [img, setImg] = useState(null);
  const [imgB64, setImgB64] = useState(null);
  const [imgName, setImgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [analysisModel, setAnalysisModel] = useState(ANALYSIS_MODELS[0].id);
  const [dropOpen, setDropOpen] = useState(false);
  const fileRef = useRef();

  const selectedModelInfo = ANALYSIS_MODELS.find(m => m.id === analysisModel);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0] || e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setImgName(file.name);
    const reader = new FileReader();
    reader.onload = ev => { setImg(ev.target.result); setImgB64(ev.target.result.split(",")[1]); };
    reader.readAsDataURL(file);
  }, []);

  const generate = async () => {
    if (!title.trim() && !desc.trim()) { setError("Add at least a title or description."); return; }
    setError(""); setLoading(true); setResult(null);

    const userText = `TICKET TITLE: ${title || "N/A"}
DESCRIPTION: ${desc || "N/A"}
LOGS/TRACE: ${logs ? logs.slice(0, 800) + (logs.length > 800 ? "\n[truncated]" : "") : "none"}
SCREENSHOT: ${imgB64 ? "YES — attached, include [See attached screenshot] reference in prompt" : "none"}

Write the optimized GitHub Copilot prompt for this ticket.`;

    const content = imgB64
      ? [{ type: "image", source: { type: "base64", media_type: "image/png", data: imgB64 } }, { type: "text", text: userText }]
      : userText;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: analysisModel, max_tokens: 1000, system: META_SYSTEM, messages: [{ role: "user", content }] })
      });
      const data = await res.json();
      const raw = data.content?.map(i => i.text || "").join("").trim();
      const [promptPart, metaPart] = raw.split("|||");
      const meta = {};
      (metaPart || "").split("\n").forEach(line => { const [k, ...v] = line.split(":"); if (k && v.length) meta[k.trim()] = v.join(":").trim(); });
      setResult({ prompt: promptPart.trim(), model: meta["RECOMMENDED_MODEL"] || "gpt-4o", modelReason: meta["MODEL_REASON"] || "", tokens: meta["TOKEN_ESTIMATE"] || "—", issueType: meta["ISSUE_TYPE"] || "UNKNOWN", severity: meta["SEVERITY"] || "P2" });
    } catch (e) {
      setError("Generation failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const copyPrompt = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const recModel = result ? COPILOT_MODELS.find(m => m.id === result.model) || COPILOT_MODELS[0] : null;
  const sevColor = { P0: "#ef4444", P1: "#f97316", P2: "#eab308", P3: "#22c55e" };
  const issueIcon = { UI_BUG:"🖼", API_ERROR:"⚡", PERF:"📈", AUTH:"🔐", DATA:"💾", CONFIG:"⚙️", INFRA:"🔥", SECURITY:"🛡️", REGRESSION:"🔄", TEST:"🧪", UNKNOWN:"❓" };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f0e8", fontFamily: "'Instrument Serif','Georgia',serif", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Fira+Code:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        :root{--ink:#1a1208;--ink2:#4a3f2f;--ink3:#8a7a65;--paper:#f5f0e8;--paper2:#ede7d9;--paper3:#e2d9c8;--rule:#c8bfad;--accent:#c0392b;--accent2:#2563eb;}
        textarea,input{font-family:inherit;outline:none;}
        textarea:focus,input:focus{border-color:var(--accent2)!important;}
        .btn{cursor:pointer;transition:all 0.15s;border:none;}
        .btn:hover:not(:disabled){filter:brightness(0.92);transform:translateY(-1px);}
        .btn:disabled{opacity:0.45;cursor:not-allowed;}
        .drop:hover{background:var(--paper3)!important;border-color:var(--accent2)!important;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .result{animation:fadeUp 0.35s ease both;}
        .spin{animation:spin 0.7s linear infinite;}
        .tag{display:inline-flex;align-items:center;padding:2px 9px;border-radius:3px;font-size:11px;font-family:'Fira Code',monospace;font-weight:500;letter-spacing:0.03em;}
        .ruled{background-image:repeating-linear-gradient(to bottom,transparent,transparent 27px,#d9d0bf 27px,#d9d0bf 28px);background-size:100% 28px;line-height:28px;}
        .grain::after{content:'';position:absolute;inset:0;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");opacity:0.5;border-radius:inherit;}
        .model-opt{cursor:pointer;transition:background 0.1s;}
        .model-opt:hover{background:var(--paper3)!important;}
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "2px solid var(--ink)", background: "var(--paper2)" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "22px 24px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 26, color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1 }}>Copilot Prompt Forge</div>
            <div style={{ fontSize: 13, color: "var(--ink3)", fontFamily: "'Fira Code',monospace", marginTop: 4 }}>ticket → token-efficient GitHub Copilot prompt</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
            <span style={{ fontSize: 11, color: "var(--ink3)", fontFamily: "'Fira Code',monospace" }}>powered by Claude</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* ── INPUT ── */}
        <div style={{ background: "var(--paper2)", border: "1px solid var(--rule)", borderRadius: 4, overflow: "hidden", position: "relative" }} className="grain">
          <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--rule)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontFamily: "'Fira Code',monospace", color: "var(--ink3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>01 — Ticket Input</span>
          </div>

          <div style={{ padding: "18px", display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Title */}
            <div>
              <label style={{ fontSize: 11, fontFamily: "'Fira Code',monospace", color: "var(--ink3)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Login fails with 401 after token refresh"
                style={{ width: "100%", padding: "9px 12px", fontSize: 15, background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 3, color: "var(--ink)", fontFamily: "'Instrument Serif','Georgia',serif", transition: "border-color 0.15s" }} />
            </div>

            {/* Description */}
            <div>
              <label style={{ fontSize: 11, fontFamily: "'Fira Code',monospace", color: "var(--ink3)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Description</label>
              <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} placeholder="Steps to reproduce, expected vs actual, affected users..." className="ruled"
                style={{ width: "100%", padding: "8px 12px", fontSize: 14, background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 3, color: "var(--ink)", resize: "vertical", transition: "border-color 0.15s", lineHeight: "28px" }} />
            </div>

            {/* Logs + Image */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12, alignItems: "start" }}>
              <div>
                <label style={{ fontSize: 11, fontFamily: "'Fira Code',monospace", color: "var(--ink3)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Logs / Stack trace <span style={{ color: "var(--rule)" }}>(optional)</span></label>
                <textarea value={logs} onChange={e => setLogs(e.target.value)} rows={4} placeholder={"NullPointerException at line 42\n  at com.app.Service.method()"}
                  style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: "#1a1208", border: "1px solid #3a3020", borderRadius: 3, color: "#c8b89a", fontFamily: "'Fira Code',monospace", resize: "vertical", lineHeight: 1.7 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontFamily: "'Fira Code',monospace", color: "var(--ink3)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Screenshot</label>
                <div className="drop" onDragOver={e => e.preventDefault()} onDrop={onDrop} onClick={() => fileRef.current.click()}
                  style={{ height: 110, border: "1px dashed var(--rule)", borderRadius: 3, background: "var(--paper)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.15s", overflow: "hidden", position: "relative" }}>
                  <input ref={fileRef} type="file" accept="image/*" onChange={onDrop} style={{ display: "none" }} />
                  {img ? (
                    <>
                      <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0, opacity: 0.85 }} />
                      <div style={{ position: "relative", background: "rgba(245,240,232,0.9)", padding: "2px 8px", borderRadius: 2, fontSize: 10, fontFamily: "'Fira Code',monospace", color: "var(--ink2)", maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{imgName}</div>
                      <button onClick={e => { e.stopPropagation(); setImg(null); setImgB64(null); setImgName(""); }} style={{ position: "relative", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 2, fontSize: 10, fontFamily: "'Fira Code',monospace", padding: "2px 8px", cursor: "pointer" }}>remove</button>
                    </>
                  ) : (
                    <><span style={{ fontSize: 22 }}>📎</span><span style={{ fontSize: 10, color: "var(--ink3)", fontFamily: "'Fira Code',monospace", textAlign: "center", lineHeight: 1.4 }}>drop or click<br />to attach</span></>
                  )}
                </div>
              </div>
            </div>

            {error && <div style={{ fontSize: 12, fontFamily: "'Fira Code',monospace", color: "var(--accent)", padding: "8px 12px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 3 }}>⚠ {error}</div>}

            {/* Model selector + Generate button row */}
            <div style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}>

              {/* Model Selector Dropdown */}
              <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
                <label style={{ fontSize: 10, fontFamily: "'Fira Code',monospace", color: "var(--ink3)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Analysis model (this app uses)</label>
                <button className="btn" onClick={() => setDropOpen(o => !o)}
                  style={{ width: "100%", padding: "10px 14px", background: "var(--paper)", border: "1px solid var(--ink)", borderRadius: 3, color: "var(--ink)", fontFamily: "'Fira Code',monospace", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {selectedModelInfo?.vision && <span style={{ fontSize: 11 }}>👁</span>}
                    <span>{selectedModelInfo?.name}</span>
                    <span className="tag" style={{ background: selectedModelInfo?.badgeColor + "22", color: selectedModelInfo?.badgeColor, border: `1px solid ${selectedModelInfo?.badgeColor}44`, padding: "1px 6px", fontSize: 10 }}>{selectedModelInfo?.badge}</span>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--ink3)" }}>{dropOpen ? "▲" : "▼"}</span>
                </button>

                {dropOpen && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--paper2)", border: "1px solid var(--ink)", borderRadius: 3, zIndex: 50, overflow: "hidden", boxShadow: "0 4px 16px rgba(26,18,8,0.15)" }}>
                    {ANALYSIS_MODELS.map((m, i) => (
                      <div key={m.id} className="model-opt"
                        onClick={() => { setAnalysisModel(m.id); setDropOpen(false); }}
                        style={{ padding: "10px 14px", borderBottom: i < ANALYSIS_MODELS.length - 1 ? "1px solid var(--rule)" : "none", background: analysisModel === m.id ? "var(--paper3)" : "var(--paper2)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          {m.vision && <span style={{ fontSize: 11 }}>👁</span>}
                          <span style={{ fontSize: 13, fontFamily: "'Fira Code',monospace", color: "var(--ink)", fontWeight: analysisModel === m.id ? 600 : 400 }}>{m.name}</span>
                          <span className="tag" style={{ background: m.badgeColor + "22", color: m.badgeColor, border: `1px solid ${m.badgeColor}44`, padding: "1px 6px", fontSize: 10 }}>{m.badge}</span>
                          {analysisModel === m.id && <span style={{ fontSize: 10, color: "var(--accent)", fontFamily: "'Fira Code',monospace" }}>✓ selected</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--ink3)", fontFamily: "'Fira Code',monospace" }}>{m.ctx} ctx · {m.note}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Generate button */}
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div style={{ fontSize: 10, color: "transparent", marginBottom: 5, userSelect: "none" }}>_</div>
                <button className="btn" onClick={generate} disabled={loading}
                  style={{ padding: "10px 24px", background: "var(--ink)", color: "var(--paper)", borderRadius: 3, fontSize: 14, fontFamily: "'Fira Code',monospace", letterSpacing: "0.03em", display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
                  {loading ? (
                    <><svg className="spin" width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="#f5f0e888" strokeWidth="2"/><path d="M7 2a5 5 0 015 5" stroke="#f5f0e8" strokeWidth="2" strokeLinecap="round"/></svg>generating…</>
                  ) : "→ generate prompt"}
                </button>
              </div>
            </div>

            {/* Selected model note */}
            <div style={{ fontSize: 11, fontFamily: "'Fira Code',monospace", color: "var(--ink3)", padding: "7px 12px", background: "var(--paper3)", borderRadius: 3, border: "1px solid var(--rule)" }}>
              Using <span style={{ color: "var(--ink2)" }}>{selectedModelInfo?.name}</span> to analyze your ticket — {selectedModelInfo?.note}
            </div>
          </div>
        </div>

        {/* ── RESULT ── */}
        {result && (
          <div className="result" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Stats */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { label: "issue type", value: `${issueIcon[result.issueType] || "❓"} ${result.issueType}`, mono: true },
                { label: "severity", value: result.severity, color: sevColor[result.severity] },
                { label: "est. tokens", value: `~${result.tokens} tok`, mono: true, color: "#2563eb" },
                { label: "analyzed by", value: selectedModelInfo?.name, mono: true, color: "var(--ink2)" },
                { label: "has image ref", value: imgB64 ? "yes" : "no", color: imgB64 ? "#22c55e" : "var(--ink3)" },
              ].map(({ label, value, mono, color }) => (
                <div key={label} style={{ padding: "8px 14px", background: "var(--paper2)", border: "1px solid var(--rule)", borderRadius: 3, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 10, fontFamily: "'Fira Code',monospace", color: "var(--ink3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
                  <span style={{ fontSize: 13, fontFamily: mono ? "'Fira Code',monospace" : "inherit", color: color || "var(--ink)", fontWeight: 600 }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Prompt Box */}
            <div style={{ background: "var(--paper2)", border: "1px solid var(--rule)", borderRadius: 4, overflow: "hidden", position: "relative" }} className="grain">
              <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--rule)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontFamily: "'Fira Code',monospace", color: "var(--ink3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>02 — Your GitHub Copilot Prompt</span>
                <button className="btn" onClick={copyPrompt} style={{ padding: "5px 14px", background: copied ? "#22c55e" : "var(--ink)", color: "var(--paper)", borderRadius: 3, fontSize: 11, fontFamily: "'Fira Code',monospace", display: "flex", alignItems: "center", gap: 6 }}>
                  {copied ? "✓ copied!" : "copy prompt"}
                </button>
              </div>
              <div style={{ padding: "20px 18px" }}>
                <pre style={{ fontSize: 13.5, fontFamily: "'Fira Code',monospace", color: "var(--ink)", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.75, background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 3, padding: "16px", margin: 0 }}>
                  {result.prompt}
                </pre>
                {imgB64 && (
                  <div style={{ marginTop: 10, padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 3, fontSize: 12, fontFamily: "'Fira Code',monospace", color: "#1d4ed8", display: "flex", alignItems: "center", gap: 8 }}>
                    <span>📎</span><span>Attach your screenshot in Copilot Chat — prompt references <strong>[See attached screenshot]</strong></span>
                  </div>
                )}
              </div>
              <div style={{ padding: "12px 18px", borderTop: "1px solid var(--rule)", background: "var(--paper3)", display: "flex", gap: 20, flexWrap: "wrap" }}>
                {[{ n:"1", t:"Copy prompt above" }, { n:"2", t:`Switch Copilot model → ${recModel?.name}` }, { n:"3", t: imgB64 ? "Attach screenshot → Paste → Send" : "Paste into Copilot Chat → Send" }].map(({ n, t }) => (
                  <div key={n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--ink)", color: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: "'Fira Code',monospace", flexShrink: 0 }}>{n}</span>
                    <span style={{ fontSize: 12, color: "var(--ink2)", fontFamily: "'Fira Code',monospace" }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Copilot Model Recommendation */}
            <div style={{ background: "var(--paper2)", border: "1px solid var(--rule)", borderRadius: 4, overflow: "hidden" }} className="grain">
              <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--rule)" }}>
                <span style={{ fontSize: 11, fontFamily: "'Fira Code',monospace", color: "var(--ink3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>03 — Recommended Copilot Model</span>
              </div>
              <div style={{ padding: "18px" }}>
                {recModel && (
                  <div style={{ padding: "14px 16px", background: "var(--paper)", border: "2px solid var(--ink)", borderRadius: 4, marginBottom: 14, display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 17, color: "var(--ink)", fontWeight: 600 }}>{recModel.name}</span>
                        <span className="tag" style={{ background: recModel.badgeColor + "22", color: recModel.badgeColor, border: `1px solid ${recModel.badgeColor}44` }}>{recModel.badge}</span>
                        <span className="tag" style={{ background: "var(--ink)", color: "var(--paper)" }}>✓ USE THIS</span>
                        {recModel.vision && <span className="tag" style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe" }}>👁 vision</span>}
                      </div>
                      <p style={{ fontSize: 13, color: "var(--ink2)", lineHeight: 1.6, marginBottom: 8 }}>{recModel.desc}</p>
                      <div style={{ fontSize: 12, color: "var(--accent)", fontFamily: "'Fira Code',monospace", fontStyle: "italic" }}>Why for this ticket: {result.modelReason}</div>
                      <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {recModel.best.map(b => <span key={b} className="tag" style={{ background: "var(--paper2)", color: "var(--ink2)", border: "1px solid var(--rule)" }}>{b}</span>)}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 80, alignItems: "flex-end" }}>
                      <span style={{ fontSize: 10, fontFamily: "'Fira Code',monospace", color: "var(--ink3)" }}>ctx</span>
                      <span style={{ fontSize: 12, fontFamily: "'Fira Code',monospace", color: "var(--ink2)" }}>{recModel.tokens}</span>
                      <span style={{ fontSize: 10, fontFamily: "'Fira Code',monospace", color: "var(--ink3)", marginTop: 4 }}>cost</span>
                      <span style={{ fontSize: 12, color: "var(--ink2)" }}>{recModel.cost}</span>
                      <span style={{ fontSize: 10, fontFamily: "'Fira Code',monospace", color: "var(--ink3)", marginTop: 4 }}>speed</span>
                      <span style={{ fontSize: 12, color: "var(--ink2)" }}>{recModel.speed}</span>
                    </div>
                  </div>
                )}

                <div style={{ fontSize: 11, fontFamily: "'Fira Code',monospace", color: "var(--ink3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>All available Copilot models</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {COPILOT_MODELS.map(m => {
                    const isRec = m.id === result.model;
                    return (
                      <div key={m.id} style={{ padding: "10px 14px", borderRadius: 3, border: isRec ? "1px solid var(--ink)" : "1px solid var(--rule)", background: isRec ? "var(--paper)" : "transparent", display: "flex", alignItems: "center", gap: 12, opacity: isRec ? 1 : 0.6 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                            <span style={{ fontSize: 13, color: "var(--ink)", fontFamily: "'Fira Code',monospace" }}>{m.name}</span>
                            <span className="tag" style={{ background: m.badgeColor + "18", color: m.badgeColor, border: `1px solid ${m.badgeColor}33` }}>{m.badge}</span>
                            {m.vision && <span className="tag" style={{ background: "#f0f9ff", color: "#0284c7", border: "1px solid #bae6fd", fontSize: 10 }}>👁</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ink3)", fontFamily: "'Fira Code',monospace" }}>{m.best.join(" · ")}</div>
                        </div>
                        <div style={{ fontSize: 11, fontFamily: "'Fira Code',monospace", color: "var(--ink3)", textAlign: "right", minWidth: 70 }}>
                          <div>{m.tokens}</div>
                          <div style={{ color: "var(--ink2)" }}>{m.cost}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 11, fontFamily: "'Fira Code',monospace", color: "var(--ink3)" }}>copilot prompt forge · token-efficient by design</span>
          <span style={{ fontSize: 11, fontFamily: "'Fira Code',monospace", color: "var(--ink3)" }}>analysis: {ANALYSIS_MODELS.map(m => m.name).join(" · ")}</span>
        </div>

      </div>
    </div>
  );
}
