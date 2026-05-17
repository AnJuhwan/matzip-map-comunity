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

  it("adds a Naver image thumbnail to imported place candidates when one is available", async () => {
    vi.stubEnv("NAVER_IMPORT_ADMIN_TOKEN", "secret-token");
    vi.stubEnv("NAVER_SEARCH_CLIENT_ID", "search-id");
    vi.stubEnv("NAVER_SEARCH_CLIENT_SECRET", "search-secret");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const requestUrl = String(url);

      if (requestUrl.includes("/v1/search/local.json")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                title: "<b>성수</b> 손칼국수",
                category: "한식>칼국수,만두",
                address: "서울특별시 성동구 성수동2가 1",
                roadAddress: "서울특별시 성동구 성수이로 10",
                mapx: "1270558000",
                mapy: "375446000",
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({
          items: [
            {
              thumbnail: "https://search.pstatic.net/common/?src=matzip-thumb",
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
      new Request("http://localhost/api/naver-places?limit=1&query=성수 맛집", {
        headers: {
          "x-matzip-admin-token": "secret-token",
        },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.places).toEqual([
      expect.objectContaining({
        name: "성수 손칼국수",
        heroImageUrl: "https://search.pstatic.net/common/?src=matzip-thumb",
      }),
    ]);
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/v1/search/image"), {
      headers: {
        "X-Naver-Client-Id": "search-id",
        "X-Naver-Client-Secret": "search-secret",
      },
      cache: "no-store",
    });
  });
});
