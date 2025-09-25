# AI Image Studio

Small, focused image generation playground with prompt, style presets, and quick batching.

This is a side project for learning and practicing — exploring modern Next.js (App Router), edge APIs, simple history storage, and a friendly prompt-to-image UI. It’s not a production system.

Branding and UI visuals are placeholders for demo purposes only.

## What It Does
- Type a prompt, optionally pick a style preset, and choose a model (FLUX.1 Pro / Dev / Schnell)
- Adjust aspect ratio, resolution (long edge), CFG guidance, steps, and seed
- Generate a small batch of images and browse them in a responsive grid
- Toggle a History drawer; when a DB is configured, recent generations persist by collection

## How It Works
- Client calls `/api/generate` with your prompt/settings; the edge route uses `@fal-ai/serverless-client` to run the selected model and returns image URLs.
- History can be stored via `/api/history` if a Turso (libSQL) database is configured.
- Optionally mirrors images to UploadThing when `UPLOADTHING_SECRET` is set (useful for long‑term links).

## Tech Stack
- Next.js 15 (App Router)
- Edge function for generation (FAL); Node function for history (libSQL/Turso)
- TypeScript + Tailwind CSS

## Run Locally
Prerequisites: Node.js >= 18

1) Install deps and start dev server

```bash
npm install
npm run dev
```

2) Environment (optional, required for real generations/persistence)
- Copy `.env.example` to `.env.local`
- Set `FAL_KEY=...` to enable real image generation
- For history: set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
- Optional mirroring: set `UPLOADTHING_SECRET`

Open http://localhost:3000 and try a prompt. Without `FAL_KEY`, the UI loads but image generation will not work.

## Status & Learnings
- Current: functional prototype to experiment with prompt UIs and serverless image APIs
- Learnings: edge route ergonomics, mapping UI controls to model params, and simple DB‑backed “collections”

## License
All rights reserved. Personal portfolio project — not for production use.
