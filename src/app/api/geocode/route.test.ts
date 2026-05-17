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

  it("falls back to Naver local search coordinates when map geocoding is not permitted", async () => {
    vi.stubEnv("NAVER_MAP_CLIENT_ID", "map-id");
    vi.stubEnv("NAVER_MAP_CLIENT_SECRET", "map-secret");
    vi.stubEnv("NAVER_SEARCH_CLIENT_ID", "search-id");
    vi.stubEnv("NAVER_SEARCH_CLIENT_SECRET", "search-secret");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const requestUrl = String(url);

      if (requestUrl.includes("/map-geocode/")) {
        return new Response(JSON.stringify({ errorMessage: "Permission Denied" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          items: [
            {
              title: "<b>영등포역</b> 1호선",
              category: "교통>기차역",
              address: "서울특별시 영등포구 영등포동",
              roadAddress: "서울특별시 영등포구 경인로 846",
              mapx: "1269077020",
              mapy: "375155770",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    });

    const response = await GET(
      new Request("http://localhost/api/geocode?query=%EC%98%81%EB%93%B1%ED%8F%AC%EC%97%AD")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      address: "서울특별시 영등포구 경인로 846",
      latitude: 37.515577,
      longitude: 126.907702,
      source: "naver-local-search",
    });
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/map-geocode/"), {
      headers: {
        Accept: "application/json",
        "x-ncp-apigw-api-key": "map-secret",
        "x-ncp-apigw-api-key-id": "map-id",
      },
      cache: "no-store",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("query=%EC%98%81%EB%93%B1%ED%8F%AC%EC%97%AD"),
      {
        headers: {
          "X-Naver-Client-Id": "search-id",
          "X-Naver-Client-Secret": "search-secret",
        },
        cache: "no-store",
      }
    );
  });
});
