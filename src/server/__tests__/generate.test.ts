import { describe, expect, it } from "vitest";
import { dimsFromAspect, normalizeGeneratePayload } from "../generate";

describe("dimsFromAspect", () => {
  it("keeps square dimensions for 1:1", () => {
    expect(dimsFromAspect("1:1", 768)).toEqual({ width: 768, height: 768 });
  });

  it("uses the long side as width for 16:9", () => {
    expect(dimsFromAspect("16:9", 1024)).toEqual({
      width: 1024,
      height: 576,
    });
  });

  it("uses the long side as height for 3:4", () => {
    expect(dimsFromAspect("3:4", 800)).toEqual({
      width: 600,
      height: 800,
    });
  });

  it("rounds to multiples of 8 and enforces a minimum", () => {
    expect(dimsFromAspect("1:1", 32)).toEqual({ width: 64, height: 64 });
  });
});

describe("normalizeGeneratePayload", () => {
  it("normalizes a valid payload", () => {
    const result = normalizeGeneratePayload(
      {
        prompt: " neon tiger ",
        style: " Cinematic ",
        modelId: "flux-pro",
        aspect: "16:9",
        resolution: 1024,
        cfg: 9,
        steps: 40,
        seed: 123,
        numImages: 2,
      },
      999
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.prompt).toBe("neon tiger");
      expect(result.data.style).toBe("Cinematic");
      expect(result.data.aspect).toBe("16:9");
      expect(result.data.resolution).toBe(1024);
      expect(result.data.cfg).toBe(9);
      expect(result.data.steps).toBe(40);
      expect(result.data.seed).toBe(123);
      expect(result.data.numImages).toBe(2);
      expect(result.data.route).toBe("fal-ai/flux-pro");
    }
  });

  it("rejects missing prompt", () => {
    const result = normalizeGeneratePayload(
      { prompt: "   ", modelId: "flux-pro" },
      1
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Prompt is required");
    }
  });

  it("rejects unsupported models", () => {
    const result = normalizeGeneratePayload(
      { prompt: "ok", modelId: "unknown" },
      1
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unsupported modelId");
    }
  });

  it("clamps numeric fields and falls back to defaults", () => {
    const result = normalizeGeneratePayload(
      {
        prompt: "ok",
        modelId: "flux-dev",
        aspect: "2:1",
        resolution: 5000,
        cfg: 50,
        steps: 1,
        seed: "bad",
        numImages: 12,
        style: "   ",
      },
      42
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.aspect).toBe("1:1");
      expect(result.data.resolution).toBe(1536);
      expect(result.data.cfg).toBe(20);
      expect(result.data.steps).toBe(4);
      expect(result.data.seed).toBe(42);
      expect(result.data.numImages).toBe(6);
      expect(result.data.style).toBe(null);
    }
  });
});
