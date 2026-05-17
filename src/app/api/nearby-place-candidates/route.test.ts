import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/nearby-place-candidates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects invalid coordinates before calling Naver", async () => {
    vi.stubEnv("NAVER_SEARCH_CLIENT_ID", "search-id");
    vi.stubEnv("NAVER_SEARCH_CLIENT_SECRET", "search-secret");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await GET(
      new Request("http://localhost/api/nearby-place-candidates?latitude=abc&longitude=127")
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "현재 위치 좌표가 필요합니다." });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a controlled setup error when Naver search credentials are missing", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/nearby-place-candidates?latitude=37.5446&longitude=127.0558"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(501);
    expect(body).toEqual({
      error:
        "네이버 지역 검색 API 키가 필요합니다. NAVER_SEARCH_CLIENT_ID와 NAVER_SEARCH_CLIENT_SECRET을 설정해주세요.",
    });
  });

  it("loads Naver restaurants for the visible bounds without a manual search query", async () => {
    vi.stubEnv("NAVER_SEARCH_CLIENT_ID", "search-id");
    vi.stubEnv("NAVER_SEARCH_CLIENT_SECRET", "search-secret");
    vi.stubEnv("NAVER_MAP_CLIENT_ID", "map-id");
    vi.stubEnv("NAVER_MAP_CLIENT_SECRET", "map-secret");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const requestUrl = String(url);

      if (requestUrl.includes("/map-reversegeocode/")) {
        return new Response(
          JSON.stringify({
            status: { code: 0 },
            results: [
              {
                region: {
                  area1: { name: "서울특별시" },
                  area2: { name: "강서구" },
                  area3: { name: "마곡동" },
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }

      if (requestUrl.includes("query=%EB%A7%88%EA%B3%A1%EB%8F%99%20%EC%9D%8C%EC%8B%9D%EC%A0%90")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                title: "<b>마곡</b> 밥집",
                category: "한식>백반",
                address: "서울특별시 강서구 마곡동",
                roadAddress: "서울특별시 강서구 마곡중앙로 10",
                mapx: "1268300000",
                mapy: "375600000",
              },
              {
                title: "화면 밖 식당",
                category: "한식",
                address: "서울특별시 강남구",
                roadAddress: "서울특별시 강남구 테헤란로 1",
                mapx: "1270300000",
                mapy: "375000000",
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }

      if (requestUrl.includes("/v1/search/image")) {
        return new Response(
          JSON.stringify({
            items: [
              { thumbnail: "https://search.pstatic.net/magok-1.jpg" },
              { thumbnail: "https://search.pstatic.net/magok-2.jpg" },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }

      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const response = await GET(
      new Request(
        "http://localhost/api/nearby-place-candidates?latitude=37.56&longitude=126.83&south=37.55&north=37.57&west=126.82&east=126.84&includePhotos=1"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      source: "naver-local-search",
      queryArea: "마곡동",
      count: 1,
      places: [
        {
          name: "마곡 밥집",
          sourceQuery: "마곡동 음식점",
          photoUrls: [
            "https://search.pstatic.net/magok-1.jpg",
            "https://search.pstatic.net/magok-2.jpg",
          ],
          heroImageUrl: "https://search.pstatic.net/magok-1.jpg",
        },
      ],
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/map-reversegeocode/"),
      expect.anything()
    );
  });

  it("does not call Naver image search for map candidates unless photos are requested", async () => {
    vi.stubEnv("NAVER_SEARCH_CLIENT_ID", "search-id");
    vi.stubEnv("NAVER_SEARCH_CLIENT_SECRET", "search-secret");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const requestUrl = String(url);

      if (requestUrl.includes("/v1/search/local.json")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                title: "마곡 밥집",
                category: "한식>백반",
                address: "서울특별시 강서구 마곡동",
                roadAddress: "서울특별시 강서구 마곡중앙로 10",
                mapx: "1268300000",
                mapy: "375600000",
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }

      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const response = await GET(
      new Request(
        "http://localhost/api/nearby-place-candidates?latitude=37.56&longitude=126.83&south=37.55&north=37.57&west=126.82&east=126.84&query=%EB%A7%88%EA%B3%A1%EC%97%AD"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.count).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("/v1/search/image"),
      expect.anything()
    );
  });

  it("searches Naver candidates with a manually entered area query", async () => {
    vi.stubEnv("NAVER_SEARCH_CLIENT_ID", "search-id");
    vi.stubEnv("NAVER_SEARCH_CLIENT_SECRET", "search-secret");
    vi.stubEnv("NAVER_MAP_CLIENT_ID", "map-id");
    vi.stubEnv("NAVER_MAP_CLIENT_SECRET", "map-secret");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const requestUrl = String(url);

      if (
        requestUrl.includes(
          "query=%EA%B9%8C%EC%B9%98%EC%82%B0%EC%97%AD%20%EC%9D%8C%EC%8B%9D%EC%A0%90"
        )
      ) {
        return new Response(
          JSON.stringify({
            items: [
              {
                title: "<b>광선집</b>",
                category: "한식>육류,고기요리",
                address: "서울특별시 강서구 화곡동 343",
                roadAddress: "서울특별시 강서구 강서로 10",
                mapx: "1268466830",
                mapy: "375317680",
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }

      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const response = await GET(
      new Request(
        "http://localhost/api/nearby-place-candidates?latitude=37.531768&longitude=126.846683&areaQuery=%EA%B9%8C%EC%B9%98%EC%82%B0%EC%97%AD"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      source: "naver-local-search",
      queryArea: "까치산역",
      count: 1,
      places: [
        {
          name: "광선집",
          address: "서울특별시 강서구 강서로 10",
          distanceMeters: 0,
          sourceQuery: "까치산역 음식점",
          source: "naver",
        },
      ],
    });
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("/map-reversegeocode/"),
      expect.anything()
    );
  });

  it("uses a restaurant search and keeps manually searched candidates outside the current-location radius", async () => {
    vi.stubEnv("NAVER_SEARCH_CLIENT_ID", "search-id");
    vi.stubEnv("NAVER_SEARCH_CLIENT_SECRET", "search-secret");
    vi.stubEnv("NAVER_MAP_CLIENT_ID", "map-id");
    vi.stubEnv("NAVER_MAP_CLIENT_SECRET", "map-secret");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const requestUrl = String(url);

      if (
        requestUrl.includes(
          "query=%EC%98%81%EB%93%B1%ED%8F%AC%EC%97%AD%20%EC%9D%8C%EC%8B%9D%EC%A0%90"
        )
      ) {
        return new Response(
          JSON.stringify({
            items: [
              {
                title: "<b>영등포</b> 국밥",
                category: "한식>국밥",
                address: "서울특별시 영등포구 영등포동",
                roadAddress: "서울특별시 영등포구 경인로 840",
                mapx: "1269076000",
                mapy: "375157000",
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }

      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const response = await GET(
      new Request(
        "http://localhost/api/nearby-place-candidates?latitude=37.5665&longitude=126.978&areaQuery=%EC%98%81%EB%93%B1%ED%8F%AC%EC%97%AD&categories=food"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      source: "naver-local-search",
      queryArea: "영등포역",
      count: 1,
      places: [
        {
          name: "영등포 국밥",
          address: "서울특별시 영등포구 경인로 840",
          sourceQuery: "영등포역 음식점",
          source: "naver",
        },
      ],
    });
    expect(body.places[0].distanceMeters).toBeGreaterThan(2_000);
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("/map-reversegeocode/"),
      expect.anything()
    );
  });
});
