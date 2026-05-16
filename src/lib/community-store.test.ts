import { describe, expect, it } from "vitest";
import { shouldUseLocalFallbackForStartupError } from "./community-store";

describe("shouldUseLocalFallbackForStartupError", () => {
  it("falls back when Supabase anonymous sign-ins are disabled", () => {
    expect(shouldUseLocalFallbackForStartupError("Anonymous sign-ins are disabled")).toBe(true);
  });

  it("falls back when the project schema has not been installed yet", () => {
    expect(
      shouldUseLocalFallbackForStartupError('relation "public.anonymous_profiles" does not exist')
    ).toBe(true);
  });
});
