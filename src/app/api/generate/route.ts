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

function selectProvider() {
  const p = (process.env.GEN_PROVIDER || "").toLowerCase();
  if (p === "google" || p === "banana" || p === "fal" || p === "mock") return p;
  if (process.env.GOOGLE_API_KEY) return "google";
  if (process.env.BANANA_URL) return "banana";
  if (process.env.FAL_KEY) return "fal";
  return "mock";
}

async function runGoogle(fullPrompt: string, seed: number, steps: number, cfg: number, width: number, height: number, numImages: number) {
  const key = process.env.GOOGLE_API_KEY;
  const model = process.env.GOOGLE_IMAGE_MODEL || "imagen-3.0-generate-002";
  if (!key) throw new Error("Missing GOOGLE_API_KEY");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateImages?key=${encodeURIComponent(key)}`;
  // Note: The exact payload/response fields may vary by model/release.
  // This payload follows the public AI Studio Images API structure.
  const payload: any = {
    prompt: { text: fullPrompt },
    imageGenerationConfig: {
      numberOfImages: numImages,
      seed,
      widthPx: width,
      heightPx: height,
      // cfg/steps may be ignored by some models; included for completeness
      guidanceStrength: cfg,
      // Some versions use "samplingSteps"; safe to include as hint
      samplingSteps: steps,
    },
  };
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Google Images API error ${resp.status}: ${t}`);
  }
  const data: any = await resp.json();
  // Attempt to extract base64 from a few known shapes
  const imgs: string[] = [];
  const candidates: any[] = Array.isArray(data?.images) ? data.images : [];
  for (const it of candidates) {
    const b64 = it?.image?.base64Data || it?.image?.bytesBase64Encoded || it?.base64Data || it?.bytesBase64Encoded || it?.content;
    if (typeof b64 === "string" && b64.length > 0) {
      imgs.push(`data:image/png;base64,${b64}`);
    }
  }
  return imgs.map((u) => ({ url: u }));
}

async function runBanana(route: string, fullPrompt: string, seed: number, steps: number, cfg: number, width: number, height: number, numImages: number) {
  const url = process.env.BANANA_URL;
  if (!url) throw new Error("Missing BANANA_URL");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.BANANA_KEY) headers["authorization"] = `Bearer ${process.env.BANANA_KEY}`;
  const body = {
    prompt: fullPrompt,
    seed,
    steps,
    cfg,
    width,
    height,
    num_images: numImages,
    model: route,
  };
  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Banana error ${resp.status}: ${t}`);
  }
  const data: any = await resp.json();
  // Flexible extraction from common Banana patterns
  const urls: string[] = [];
  const pushIfUrl = (u: any) => {
    if (typeof u === "string" && u.startsWith("http")) urls.push(u);
    else if (typeof u === "string" && /^[A-Za-z0-9+/]+=*$/.test(u.slice(0, 24))) urls.push(`data:image/png;base64,${u}`);
  };
  if (Array.isArray(data?.images)) data.images.forEach(pushIfUrl);
  if (Array.isArray(data?.output)) data.output.forEach(pushIfUrl);
  if (Array.isArray(data?.modelOutputs)) data.modelOutputs.forEach((o: any) => {
    if (Array.isArray(o?.images)) o.images.forEach(pushIfUrl);
    if (Array.isArray(o?.image_base64)) o.image_base64.forEach(pushIfUrl);
  });
  if (urls.length === 0 && typeof data?.image === "string") pushIfUrl(data.image);
  return urls.map((u) => ({ url: u }));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const {
      prompt,
      style,
      modelId,
      aspect,
      resolution,
      cfg,
      steps,
      seed,
      numImages = 4,
    } = body;

    const route = MODEL_ROUTE[modelId];
    if (!route) {
      return new Response(
        JSON.stringify({ error: `Unsupported modelId: ${modelId}` }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const { width, height } = dimsFromAspect(aspect, resolution);

    const styleSuffix = style ? `, ${style.toLowerCase()}` : "";
    const fullPrompt = `${prompt?.trim() ?? ""}${styleSuffix}`.trim();

    const provider = selectProvider();

    // Development fallback: mock
    if (provider === "mock") {
      const makeSvg = (w: number, h: number, s: number, text: string) => {
        const bg1 = s % 360;
        const bg2 = (s * 3) % 360;
        const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
        const svg = `<?xml version='1.0' encoding='UTF-8'?>\
<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>\
  <defs>\
    <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>\
      <stop offset='0%' stop-color='hsl(${bg1} 75% 52%)'/>\
      <stop offset='100%' stop-color='hsl(${bg2} 75% 42%)'/>\
    </linearGradient>\
  </defs>\
  <rect width='100%' height='100%' fill='url(#g)'/>\
  <text x='12' y='28' font-family='system-ui, sans-serif' font-size='14' fill='white' opacity='.9'>Seed: ${s}</text>\
  <text x='12' y='48' font-family='system-ui, sans-serif' font-size='12' fill='white' opacity='.8'>${esc(text).slice(0, 80)}</text>\
</svg>`;
        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      };
      const images = Array.from({ length: numImages }).map((_, i) => ({
        url: makeSvg(width, height, seed + i, fullPrompt || "Preview"),
      }));
      return new Response(
        JSON.stringify({ images, seed, width, height, mocked: true }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (provider === "google") {
      const imgs = await runGoogle(fullPrompt, seed, steps, cfg, width, height, numImages);
      return Response.json({ images: imgs, seed, width, height, provider });
    }

    if (provider === "banana") {
      const imgs = await runBanana(route, fullPrompt, seed, steps, cfg, width, height, numImages);
      return Response.json({ images: imgs, seed, width, height, provider });
    }

    // Fallback to FAL provider
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
    let urls: string[] = [];
    // Common fal output shape
    const anyResult = result as any;
    if (Array.isArray(anyResult?.images)) {
      urls = anyResult.images
        .map((img: any) => (typeof img === "string" ? img : img?.url))
        .filter(Boolean);
    } else if (anyResult?.image) {
      const img = anyResult.image;
      const u = typeof img === "string" ? img : img?.url;
      if (u) urls = [u];
    }

    return new Response(
      JSON.stringify({
        images: urls.map((u: string) => ({ url: u })),
        seed: anyResult?.seed ?? seed,
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
