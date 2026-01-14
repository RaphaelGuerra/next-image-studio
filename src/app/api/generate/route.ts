import * as fal from "@fal-ai/serverless-client";

export const runtime = "edge";

fal.config({
  // FAL_KEY is provided via environment variables
  credentials: process.env.FAL_KEY,
});

type Body = {
  prompt: string;
  style?: string | null;
  modelId: string; // one of our supported IDs
  aspect: "1:1" | "3:4" | "4:3" | "16:9";
  resolution: number; // longer side in px
  cfg: number;
  steps: number;
  seed: number;
  numImages?: number;
};

const MODEL_ROUTE: Record<string, string> = {
  "flux-pro": "fal-ai/flux-pro",
  "flux-dev": "fal-ai/flux/dev",
  "flux-schnell": "fal-ai/flux-schnell",
};

type FalImageResult = string | { url?: string; seed?: number };
type FalRunResult = {
  images?: FalImageResult[];
  image?: FalImageResult;
  seed?: number;
};

const MIN_RESOLUTION = 512;
const MAX_RESOLUTION = 1536;
const MIN_CFG = 1;
const MAX_CFG = 20;
const MIN_STEPS = 4;
const MAX_STEPS = 60;
const MIN_IMAGES = 1;
const MAX_IMAGES = 6;

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function dimsFromAspect(aspect: Body["aspect"], resolution: number) {
  // Interpret resolution as the longer side
  const map: Record<Body["aspect"], [number, number]> = {
    "1:1": [1, 1],
    "3:4": [3, 4],
    "4:3": [4, 3],
    "16:9": [16, 9],
  };
  const [wR, hR] = map[aspect];
  const longIsWidth = wR >= hR;
  const long = resolution;
  const short = Math.round((resolution * Math.min(wR, hR)) / Math.max(wR, hR));
  const width = longIsWidth ? long : short;
  const height = longIsWidth ? short : long;
  // Many backends like multiples of 8
  const round8 = (n: number) => Math.max(64, Math.round(n / 8) * 8);
  return { width: round8(width), height: round8(height) };
}

export async function POST(req: Request) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const promptRaw = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!promptRaw) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const modelId = typeof body.modelId === "string" ? body.modelId : "";
    const route = MODEL_ROUTE[modelId];
    if (!route) {
      return new Response(
        JSON.stringify({ error: `Unsupported modelId: ${modelId}` }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const aspect = (body.aspect && ["1:1", "3:4", "4:3", "16:9"].includes(body.aspect))
      ? body.aspect
      : "1:1";
    const resolution = Math.round(
      clampNumber(body.resolution, MIN_RESOLUTION, MAX_RESOLUTION, 768)
    );
    const cfg = clampNumber(body.cfg, MIN_CFG, MAX_CFG, 7);
    const steps = Math.round(clampNumber(body.steps, MIN_STEPS, MAX_STEPS, 30));
    const seed = Math.floor(
      clampNumber(body.seed, 0, 1_000_000, Math.floor(Math.random() * 1_000_000))
    );
    const numImages = Math.round(
      clampNumber(body.numImages ?? 4, MIN_IMAGES, MAX_IMAGES, 4)
    );
    const style = typeof body.style === "string" ? body.style.trim() : null;

    const { width, height } = dimsFromAspect(aspect, resolution);

    const styleSuffix = style ? `, ${style.toLowerCase()}` : "";
    const fullPrompt = `${promptRaw}${styleSuffix}`.trim();


    const result = await fal.run(route, {
      input: {
        prompt: fullPrompt,
        seed,
        num_inference_steps: steps,
        guidance_scale: cfg,
        width,
        height,
        num_images: numImages,
        // Safety optional flags guarded by backend; harmless if ignored
        enable_safety_checker: true,
      },
    });

    // Normalize output to an array of URLs
    const falResult = result as FalRunResult;
    const extractUrl = (img?: FalImageResult) => {
      if (!img) return null;
      return typeof img === "string" ? img : img.url ?? null;
    };
    const urls: string[] = Array.isArray(falResult.images)
      ? falResult.images.map(extractUrl).filter(Boolean) as string[]
      : extractUrl(falResult.image)
        ? [extractUrl(falResult.image) as string]
        : [];

    return new Response(
      JSON.stringify({
        images: urls.map((u: string) => ({ url: u })),
        seed: falResult?.seed ?? seed,
        width,
        height,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Generation failed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
