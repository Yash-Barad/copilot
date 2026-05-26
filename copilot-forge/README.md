# Copilot Prompt Studio

Turn rough tickets into **production-quality GitHub Copilot Chat prompts** with **AI-powered optimization** (OpenAI) and automatic Copilot model recommendations.

## How it works

1. Paste your bug report, ticket, or question.
2. Add your **OpenAI API key** (company key recommended).
3. Click **Enhance prompt**.
4. Copy the optimized prompt and switch Copilot to the recommended model.

### With OpenAI API key (recommended)

- Uses **gpt-4o-mini** for text — fast and low cost for company use
- Uses **gpt-4o** when you attach a screenshot (vision)
- Rewrites prompts with clear structure, preserved technical detail, and explicit tasks for Copilot

### Without API key

- Falls back to **local basic formatting** (section headers only — not true AI optimization)

## Company / Azure OpenAI

- **Standard OpenAI:** leave base URL as `https://api.openai.com/v1`
- **Azure OpenAI:** set API base to your deployment URL, e.g.  
  `https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT`
- API key is stored in **sessionStorage** in the browser only (never sent to our servers — there are none).

For production, your IT team may prefer a **backend proxy** so keys are not in the browser. This static app can call any compatible `/chat/completions` endpoint.

## Setup (company / OpenAI)

1. Copy `.env.example` to `.env`
2. Add your organization OpenAI key:

```env
OPENAI_API_KEY=sk-...
```

3. Start the app:

```bash
npm run dev
```

4. Open `http://localhost:3000`

The dev server proxies OpenAI calls (fixes browser CORS) and keeps the key on the server when using `.env`.

**Cost:** `gpt-4o-mini` is very inexpensive per request — suitable for internal team use.

**Azure OpenAI:** set `OPENAI_API_BASE` in `.env` to your deployment URL.

Static-only (no AI proxy): `npm run static` — you must paste an API key; direct browser calls may fail due to CORS.

## Project structure

```
index.html
css/styles.css
js/
  app.js          — UI
  config.js       — OpenAI models + system prompt
  openai.js       — OpenAI API client
  enhancer.js     — AI + local fallback
  parser.js       — Response parsing
  models.js       — Copilot model catalog
  theme.js        — Light / dark mode
```

## Cost note

OpenAI charges per token. **gpt-4o-mini** is typically a fraction of a cent per enhancement — suitable for internal engineering tools. Check your organization's OpenAI or Azure billing.
