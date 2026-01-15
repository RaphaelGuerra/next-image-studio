import * as fal from "@fal-ai/serverless-client";
import { dimsFromAspect, normalizeGeneratePayload, type Aspect } from "@/server/generate";

export const runtime = "edge";

fal.config({
  // FAL_KEY is provided via environment variables
  credentials: process.env.FAL_KEY,
});

type Body = {
  prompt: string;
  style?: string | null;
  modelId: string; // one of our supported IDs
  aspect: Aspect;
  resolution: number; // longer side in px
  cfg: number;
  steps: number;
  seed: number;
  numImages?: number;
};

type FalImageResult = string | { url?: string; seed?: number };
type FalRunResult = {
  images?: FalImageResult[];
  image?: FalImageResult;
  seed?: number;
};

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

    const normalized = normalizeGeneratePayload(body);
    if (!normalized.ok) {
      return new Response(JSON.stringify({ error: normalized.error }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const { prompt, style, aspect, resolution, cfg, steps, seed, numImages, route } =
      normalized.data;
    const { width, height } = dimsFromAspect(aspect, resolution);

    const styleSuffix = style ? `, ${style.toLowerCase()}` : "";
    const fullPrompt = `${prompt}${styleSuffix}`.trim();

    if (!process.env.FAL_KEY) {
      return new Response(
        JSON.stringify({
          images: [],
          seed,
          width,
          height,
          demo: true,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

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
