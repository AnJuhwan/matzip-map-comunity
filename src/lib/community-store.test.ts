import { describe, expect, it } from "vitest";
import {
  MAX_PHOTO_BYTES,
  shouldUseLocalFallbackForStartupError,
  validatePhotoFile,
} from "./community-store";

describe("shouldUseLocalFallbackForStartupError", () => {
  it("falls back when Supabase anonymous sign-ins are disabled", () => {
    expect(shouldUseLocalFallbackForStartupError("Anonymous sign-ins are disabled")).toBe(true);
  });

  it("falls back when the project schema has not been installed yet", () => {
    expect(
      shouldUseLocalFallbackForStartupError('relation "public.anonymous_profiles" does not exist')
    ).toBe(true);
  });

  it("does not silently switch to local fallback in production", () => {
    expect(
      shouldUseLocalFallbackForStartupError("Anonymous sign-ins are disabled", {
        nodeEnv: "production",
      })
    ).toBe(false);
  });
});

describe("validatePhotoFile", () => {
  it("allows supported raster image uploads under the size limit", () => {
    const file = new File(["image"], "photo.jpg", { type: "image/jpeg" });

    expect(() => validatePhotoFile(file)).not.toThrow();
  });

  it("rejects non-image uploads", () => {
    const file = new File(["select 1"], "payload.sql", { type: "application/sql" });

    expect(() => validatePhotoFile(file)).toThrow("이미지 파일만 업로드할 수 있습니다.");
  });

  it("rejects svg uploads even when the browser reports an image MIME type", () => {
    const file = new File(["<svg />"], "payload.svg", { type: "image/svg+xml" });

    expect(() => validatePhotoFile(file)).toThrow(
      "JPG, PNG, WebP, GIF 사진만 업로드할 수 있습니다."
    );
  });

  it("rejects oversized uploads", () => {
    const file = new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], "large.png", {
      type: "image/png",
    });

    expect(() => validatePhotoFile(file)).toThrow("사진은 5MB 이하만 업로드할 수 있습니다.");
  });
});
