import { COPILOT_MODELS, ISSUE_LABELS, SEV_COLORS } from "./models.js";
import { enhancePrompt } from "./enhancer.js";
import { checkProxyHealth } from "./openai.js";
import { initTheme } from "./theme.js";
import { DEFAULT_API_BASE } from "./config.js";

const $ = (sel) => document.querySelector(sel);

const STORAGE = {
  apiKey: "openai_api_key",
  apiBase: "openai_api_base",
};

const state = {
  img: null,
  imgDataUrl: null,
  imgName: "",
  result: null,
  copied: false,
};

const els = {
  prompt: $("#prompt-input"),
  apiKey: $("#api-key"),
  apiBase: $("#api-base"),
  fileInput: $("#file-input"),
  dropZone: $("#drop-zone"),
  dropPreview: $("#drop-preview"),
  dropEmpty: $("#drop-empty"),
  imgName: $("#img-name"),
  btnRemoveImg: $("#btn-remove-img"),
  btnGenerate: $("#btn-generate"),
  btnCopy: $("#btn-copy"),
  error: $("#error-msg"),
  resultSection: $("#result-section"),
  stats: $("#stats-row"),
  promptOut: $("#prompt-output"),
  screenshotNote: $("#screenshot-note"),
  steps: $("#steps-row"),
  recModelCard: $("#rec-model-card"),
  allModels: $("#all-models"),
  header: $(".header"),
};

function loadApiSettings() {
  const key = sessionStorage.getItem(STORAGE.apiKey);
  const base = sessionStorage.getItem(STORAGE.apiBase);
  if (key && els.apiKey) els.apiKey.value = key;
  if (base && els.apiBase) els.apiBase.value = base;
  else if (els.apiBase) els.apiBase.placeholder = DEFAULT_API_BASE;
}

function saveApiSettings() {
  const key = els.apiKey?.value?.trim() || "";
  const base = els.apiBase?.value?.trim() || "";
  if (key) sessionStorage.setItem(STORAGE.apiKey, key);
  else sessionStorage.removeItem(STORAGE.apiKey);
  if (base) sessionStorage.setItem(STORAGE.apiBase, base);
  else sessionStorage.removeItem(STORAGE.apiBase);
}

function getApiOptions() {
  return {
    apiKey: els.apiKey?.value?.trim() || sessionStorage.getItem(STORAGE.apiKey) || "",
    baseUrl: els.apiBase?.value?.trim() || sessionStorage.getItem(STORAGE.apiBase) || DEFAULT_API_BASE,
  };
}

function initReveals() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -32px 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
}

function initHeaderScroll() {
  window.addEventListener(
    "scroll",
    () => els.header?.classList.toggle("is-scrolled", window.scrollY > 8),
    { passive: true }
  );
}

function showError(msg) {
  if (!msg) {
    els.error.hidden = true;
    els.error.textContent = "";
    return;
  }
  els.error.hidden = false;
  els.error.textContent = msg;
}

function setLoading(on) {
  els.btnGenerate.disabled = on;
  els.btnGenerate.innerHTML = on
    ? '<span class="spin"></span> Optimizing with AI…'
    : "Enhance prompt";
}

function tagHtml(text, color, variant = "") {
  if (variant === "primary") return `<span class="tag tag--primary">${text}</span>`;
  return `<span class="tag" style="color:${color};border-color:${color}40">${text}</span>`;
}

function sourceLabel(result) {
  if (result.source === "openai") {
    const via = result.viaProxy ? " · server" : "";
    return `<span class="stat-chip stat-chip--ai"><strong>AI</strong> · ${result.modelUsed || "OpenAI"}${via}</span>`;
  }
  if (result.fallbackReason) {
    return `<span class="stat-chip stat-chip--warn" title="${result.fallbackReason}"><strong>Local</strong> · API fallback</span>`;
  }
  return `<span class="stat-chip"><strong>Local</strong> · add API key for AI</span>`;
}

function renderStats(result) {
  const issueLabel = ISSUE_LABELS[result.issueType] || "General";
  const sevColor = SEV_COLORS[result.severity] || "var(--text-secondary)";
  els.stats.innerHTML = `
    ${sourceLabel(result)}
    <span class="stat-chip"><strong>${issueLabel}</strong> category</span>
    <span class="stat-chip" style="color:${sevColor}"><strong>${result.severity}</strong> priority</span>
    ${state.imgDataUrl ? '<span class="stat-chip"><strong>Screenshot</strong> attached</span>' : ""}
  `;
}

function renderRecModel(recModel, result) {
  els.recModelCard.innerHTML = `
    <article class="rec-card">
      <div class="rec-top">
        <h3 class="rec-name">${recModel.name}</h3>
        ${tagHtml(recModel.badge, recModel.badgeColor)}
        <span class="tag tag--primary">Recommended</span>
      </div>
      <p class="rec-desc">${recModel.desc}</p>
      <p class="rec-reason">${result.modelReason}</p>
      <div class="rec-tags">${recModel.best.map((b) => `<span class="tag">${b}</span>`).join("")}</div>
    </article>`;
}

function renderAllModels(selectedId) {
  els.allModels.innerHTML = COPILOT_MODELS.map((m) => {
    const active = m.id === selectedId;
    return `
      <div class="model-item ${active ? "model-item--active" : ""}">
        <div class="model-item-name">
          ${m.name}
          ${tagHtml(m.badge, m.badgeColor)}
        </div>
        <div class="model-item-best">${m.best.join(" · ")}</div>
      </div>`;
  }).join("");
}

function renderSteps(recModel) {
  const steps = [
    { n: "1", t: "Copy the enhanced prompt above" },
    { n: "2", t: `Set Copilot to ${recModel.name}` },
    { n: "3", t: state.imgDataUrl ? "Attach screenshot, paste, and send" : "Paste into Copilot Chat and send" },
  ];
  els.steps.innerHTML = steps
    .map(
      ({ n, t }) => `
      <div class="step-item">
        <span class="step-num">${n}</span>
        <span class="step-text">${t}</span>
      </div>`
    )
    .join("");
}

function renderResult() {
  const result = state.result;
  if (!result) {
    els.resultSection.hidden = true;
    return;
  }

  const recModel = COPILOT_MODELS.find((m) => m.id === result.model) || COPILOT_MODELS[0];

  els.resultSection.hidden = false;
  renderStats(result);
  els.promptOut.textContent = result.prompt;
  els.screenshotNote.hidden = !state.imgDataUrl;
  renderSteps(recModel);
  renderRecModel(recModel, result);
  renderAllModels(result.model);

  els.btnCopy.textContent = state.copied ? "Copied" : "Copy";
  els.btnCopy.classList.toggle("copied", state.copied);

  requestAnimationFrame(() => {
    els.resultSection.querySelectorAll(".reveal").forEach((el) => {
      el.classList.add("is-visible");
    });
  });
}

function setImage(file) {
  if (!file?.type?.startsWith("image/")) return;
  state.imgName = file.name;
  const reader = new FileReader();
  reader.onload = (ev) => {
    state.imgDataUrl = ev.target.result;
    els.dropPreview.hidden = false;
    els.dropEmpty.hidden = true;
    els.dropZone.querySelector("img").src = state.imgDataUrl;
    els.imgName.textContent = state.imgName;
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  state.imgDataUrl = null;
  state.imgName = "";
  els.fileInput.value = "";
  els.dropPreview.hidden = true;
  els.dropEmpty.hidden = false;
}

async function generate() {
  const prompt = els.prompt.value.trim();
  if (!prompt) {
    showError("Please describe your issue or paste your prompt.");
    return;
  }

  saveApiSettings();
  const { apiKey, baseUrl } = getApiOptions();
  const health = await checkProxyHealth();
  const hasKey = Boolean(apiKey || health.hasServerKey);

  if (!hasKey) {
    showError("Add OPENAI_API_KEY to .env and run npm run dev, or paste your API key above. Without it, only basic local formatting runs.");
  } else {
    showError("");
  }

  state.copied = false;
  setLoading(true);
  state.result = null;

  try {
    state.result = await enhancePrompt(prompt, {
      apiKey,
      baseUrl,
      hasImage: !!state.imgDataUrl,
      imageDataUrl: state.imgDataUrl,
    });

    if (state.result.fallbackReason) {
      showError(`AI unavailable (${state.result.fallbackReason}). Showing local fallback.`);
    } else if (!apiKey) {
      showError("");
    }

    renderResult();
    document.getElementById("section-output")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showError(err.message || "Enhancement failed. Check your API key and network.");
  } finally {
    setLoading(false);
  }
}

function copyPrompt() {
  if (!state.result) return;
  navigator.clipboard.writeText(state.result.prompt);
  state.copied = true;
  renderResult();
  setTimeout(() => {
    state.copied = false;
    renderResult();
  }, 2000);
}

async function initServerStatus() {
  const el = document.getElementById("server-status");
  if (!el) return;
  const health = await checkProxyHealth();
  if (health.available && health.hasServerKey) {
    el.hidden = false;
    el.textContent = "Server API key loaded — you can enhance without pasting a key.";
    el.className = "server-status server-status--ok";
  } else if (health.available) {
    el.hidden = false;
    el.textContent = "Dev server running — paste your API key to enable AI enhancement.";
    el.className = "server-status";
  }
}

function init() {
  initTheme();
  initReveals();
  initHeaderScroll();
  loadApiSettings();
  initServerStatus();

  document.querySelector(".page-intro")?.classList.add("is-visible");

  els.btnGenerate.addEventListener("click", generate);
  els.btnCopy.addEventListener("click", copyPrompt);
  els.apiKey?.addEventListener("change", saveApiSettings);
  els.apiBase?.addEventListener("change", saveApiSettings);

  els.dropZone.addEventListener("dragover", (e) => e.preventDefault());
  els.dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    setImage(e.dataTransfer?.files?.[0]);
  });
  els.dropZone.addEventListener("click", (e) => {
    if (e.target.closest("#btn-remove-img")) return;
    els.fileInput.click();
  });
  els.fileInput.addEventListener("change", (e) => setImage(e.target.files?.[0]));
  els.btnRemoveImg.addEventListener("click", (e) => {
    e.stopPropagation();
    clearImage();
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      if (href?.startsWith("#")) {
        e.preventDefault();
        document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

init();
