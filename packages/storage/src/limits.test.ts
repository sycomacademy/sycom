import { describe, expect, test } from "bun:test";

import { MEDIA_LIMITS, resourceKindFromMime } from "./limits";

describe("resourceKindFromMime", () => {
  test("maps image/* to image", () => {
    expect(resourceKindFromMime("image/png")).toBe("image");
    expect(resourceKindFromMime("image/jpeg")).toBe("image");
  });

  test("maps video/* to video", () => {
    expect(resourceKindFromMime("video/mp4")).toBe("video");
  });

  test("maps audio/* to audio", () => {
    expect(resourceKindFromMime("audio/mpeg")).toBe("audio");
  });

  test("falls back to file for everything else, including raw/PDF types", () => {
    expect(resourceKindFromMime("application/pdf")).toBe("file");
    expect(resourceKindFromMime("text/plain")).toBe("file");
    expect(resourceKindFromMime("")).toBe("file");
  });
});

describe("MEDIA_LIMITS", () => {
  test("defines a positive byte ceiling for every resource kind", () => {
    for (const kind of ["image", "audio", "file", "video"] as const) {
      expect(MEDIA_LIMITS[kind]).toBeGreaterThan(0);
    }
  });

  test("video is capped at the ~100MB single-request Cloudinary ceiling", () => {
    expect(MEDIA_LIMITS.video).toBe(100 * 1024 * 1024);
  });
});
