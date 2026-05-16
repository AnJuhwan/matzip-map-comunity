import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/geocode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns a controlled JSON error when the Naver request fails before a response", async () => {
    vi.stubEnv("NAVER_MAP_CLIENT_ID", "map-id");
    vi.stubEnv("NAVER_MAP_CLIENT_SECRET", "map-secret");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const response = await GET(new Request("http://localhost/api/geocode?query=서울시청"));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ error: "네이버 지오코딩 요청에 실패했습니다." });
  });

  it("returns a controlled JSON error when Naver sends malformed JSON", async () => {
    vi.stubEnv("NAVER_MAP_CLIENT_ID", "map-id");
    vi.stubEnv("NAVER_MAP_CLIENT_SECRET", "map-secret");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const response = await GET(new Request("http://localhost/api/geocode?query=서울시청"));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ error: "네이버 지오코딩 응답을 해석하지 못했습니다." });
  });
});
