export type Aspect = "1:1" | "3:4" | "4:3" | "16:9";

export const MODEL_ROUTE: Record<string, string> = {
  "flux-pro": "fal-ai/flux-pro",
  "flux-dev": "fal-ai/flux/dev",
  "flux-schnell": "fal-ai/flux-schnell",
};

const MIN_RESOLUTION = 512;
const MAX_RESOLUTION = 1536;
const MIN_CFG = 1;
const MAX_CFG = 20;
const MIN_STEPS = 4;
const MAX_STEPS = 60;
const MIN_IMAGES = 1;
const MAX_IMAGES = 6;
const SUPPORTED_ASPECTS: Aspect[] = ["1:1", "3:4", "4:3", "16:9"];

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function dimsFromAspect(aspect: Aspect, resolution: number) {
  // Interpret resolution as the longer side
  const map: Record<Aspect, [number, number]> = {
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

export type NormalizedPayload = {
  prompt: string;
  style: string | null;
  modelId: string;
  aspect: Aspect;
  resolution: number;
  cfg: number;
  steps: number;
  seed: number;
  numImages: number;
  route: string;
};

export type NormalizeResult =
  | { ok: true; data: NormalizedPayload }
  | { ok: false; error: string };

export function normalizeGeneratePayload(
  body: unknown,
  fallbackSeed = Math.floor(Math.random() * 1_000_000)
): NormalizeResult {
  const payload = body as {
    prompt?: unknown;
    style?: unknown;
    modelId?: unknown;
    aspect?: unknown;
    resolution?: unknown;
    cfg?: unknown;
    steps?: unknown;
    seed?: unknown;
    numImages?: unknown;
  };

  const promptRaw = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  if (!promptRaw) {
    return { ok: false, error: "Prompt is required" };
  }

  const modelId = typeof payload.modelId === "string" ? payload.modelId : "";
  const route = MODEL_ROUTE[modelId];
  if (!route) {
    return { ok: false, error: `Unsupported modelId: ${modelId}` };
  }

  const aspect =
    typeof payload.aspect === "string" &&
    SUPPORTED_ASPECTS.includes(payload.aspect as Aspect)
      ? (payload.aspect as Aspect)
      : "1:1";
  const resolution = Math.round(
    clampNumber(payload.resolution, MIN_RESOLUTION, MAX_RESOLUTION, 768)
  );
  const cfg = clampNumber(payload.cfg, MIN_CFG, MAX_CFG, 7);
  const steps = Math.round(clampNumber(payload.steps, MIN_STEPS, MAX_STEPS, 30));
  const seed = Math.floor(clampNumber(payload.seed, 0, 1_000_000, fallbackSeed));
  const numImages = Math.round(
    clampNumber(payload.numImages ?? 4, MIN_IMAGES, MAX_IMAGES, 4)
  );
  const styleTrimmed =
    typeof payload.style === "string" ? payload.style.trim() : "";
  const style = styleTrimmed ? styleTrimmed : null;

  return {
    ok: true,
    data: {
      prompt: promptRaw,
      style,
      modelId,
      aspect,
      resolution,
      cfg,
      steps,
      seed,
      numImages,
      route,
    },
  };
}
