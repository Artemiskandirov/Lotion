# Lotion

Lotion is an AI-assisted Figma plugin for answering one question before generation:

> Can this asset become a good Lottie animation?

The product starts with a feasibility check instead of a magic generate button. A designer selects an asset in Figma, explains what it is and where it will be used, and Lotion returns a practical motion assessment: what can move, what cannot move, which scenario fits, what needs cleanup, and whether Lottie is the right format.

## Product Shape

```text
Figma plugin
  -> selected layer structure
  -> Vercel / Next.js API
  -> feasibility check
  -> motion scenario selection
  -> motion plan
  -> Lottie JSON generation
  -> preview and export
```

Figma owns the UI and access to selected layers. The backend owns AI calls, secrets, product limits, motion planning, and Lottie generation.

## Workspace

```text
apps/
  figma-plugin/
    manifest.json
    src/code.ts
    src/ui.tsx
  web/
    app/api/analyze-asset/
    app/api/feasibility-check/
    app/api/suggest-motions/
    app/api/generate-plan/
    app/api/generate-lottie/
    app/api/validate-lottie/
packages/
  shared/
    src/motion-schema/
    src/motion-recipes/
    src/lottie/
    src/types/
```

## MVP Scope

The first version focuses on UI and game assets:

- coin
- star
- lock
- gift
- chest
- badge
- button
- checkmark
- warning
- progress bar

Supported motion scenarios include reward reveal, coin collect, unlock success, success pop, error shake, attention float, and progress fill.

## API

`POST /api/analyze-asset`

Returns inferred asset type, layer stats, detected parts, and dimensions.

`POST /api/feasibility-check`

Returns score, traffic-light level, scorecard, limitations, fixes, recommended scenarios, and product actions.

`POST /api/suggest-motions`

Returns ranked motion recipes for the selected asset and intent.

`POST /api/generate-plan`

Returns a structured motion plan. This is the stable contract between AI reasoning and code generation.

`POST /api/generate-lottie`

Returns a motion plan plus a minimal Lottie JSON document.

`POST /api/validate-lottie`

Checks the generated Lottie document for basic structural validity.

## Local Setup

```bash
npm install
npm run dev
```

The web app runs as a usable local feasibility tester. The Figma plugin can point its backend field to `http://localhost:3000`.

Build the plugin:

```bash
npm --workspace @lotion/figma-plugin run build
```

Then load `apps/figma-plugin/manifest.json` in Figma as a development plugin.

## AI Boundary

The plugin should never call OpenAI directly. Keep `OPENAI_API_KEY` on the backend only.

In Vercel, add this environment variable:

```text
OPENAI_API_KEY=your_openai_api_key
```

`OPENAI_MODEL` is optional for now and can be added later when the backend starts making live OpenAI requests.

For the MVP, the repository includes deterministic feasibility and motion planning logic. The OpenAI integration should enrich these endpoints by producing better asset interpretation and motion plans, while code remains responsible for compiling and validating Lottie JSON.
