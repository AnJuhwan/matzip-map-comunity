import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/naver-places", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects import requests without the configured admin token before calling Naver", async () => {
    vi.stubEnv("NAVER_IMPORT_ADMIN_TOKEN", "secret-token");
    vi.stubEnv("NAVER_SEARCH_CLIENT_ID", "search-id");
    vi.stubEnv("NAVER_SEARCH_CLIENT_SECRET", "search-secret");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const response = await GET(new Request("http://localhost/api/naver-places?limit=1"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "관리자 권한이 필요합니다." });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
