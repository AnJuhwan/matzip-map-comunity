import { describe, expect, it } from "vitest";
import {
  buildNaverLocalSearchQueries,
  dedupeNaverPlaceCandidates,
  getCoordinatesFromNaverLocalItem,
  getNaverLocalSearchCredentials,
  inferPlaceCategory,
  isNaverRateLimitMessage,
  mapNaverLocalItemToPlaceCandidate,
  sanitizeNaverText,
} from "./naver-local-search";

describe("getNaverLocalSearchCredentials", () => {
  it("uses dedicated Naver search credentials instead of map credentials", () => {
    expect(
      getNaverLocalSearchCredentials({
        NAVER_MAP_CLIENT_ID: "map-id",
        NAVER_MAP_CLIENT_SECRET: "map-secret",
      })
    ).toBeNull();

    expect(
      getNaverLocalSearchCredentials({
        NAVER_SEARCH_CLIENT_ID: "search-id",
        NAVER_SEARCH_CLIENT_SECRET: "search-secret",
      })
    ).toEqual({ clientId: "search-id", clientSecret: "search-secret" });
  });
});

describe("buildNaverLocalSearchQueries", () => {
  it("builds enough regional searches to import many places despite the API display limit", () => {
    const queries = buildNaverLocalSearchQueries();

    expect(queries.length).toBeGreaterThanOrEqual(20);
    expect(queries).toContain("서울 맛집");
    expect(queries).toContain("부산 맛집");
  });
});

describe("isNaverRateLimitMessage", () => {
  it("detects Naver API rate limit messages", () => {
    expect(isNaverRateLimitMessage("Rate limit exceeded. (속도 제한을 초과했습니다.)")).toBe(true);
    expect(isNaverRateLimitMessage("인증에 실패했습니다.")).toBe(false);
  });
});

describe("Naver local search mapping", () => {
  it("reads WGS84 coordinates directly from Naver local search items", () => {
    expect(
      getCoordinatesFromNaverLocalItem({
        title: "명동교자 본점",
        category: "한식>칼국수,만두",
        address: "서울특별시 중구 명동2가 25-2",
        roadAddress: "서울특별시 중구 명동10길 29",
        mapx: "1269856025",
        mapy: "375625491",
      })
    ).toEqual({
      latitude: 37.5625491,
      longitude: 126.9856025,
    });
  });

  it("sanitizes markup and maps a local search item into a place candidate", () => {
    expect(sanitizeNaverText("<b>성수</b> 손칼국수 &amp; 만두")).toBe("성수 손칼국수 & 만두");

    expect(
      mapNaverLocalItemToPlaceCandidate(
        {
          title: "<b>성수</b> 손칼국수",
          category: "한식>칼국수,만두",
          address: "서울특별시 성동구 성수동2가 1",
          roadAddress: "서울특별시 성동구 성수이로 10",
        },
        "서울 맛집",
        { latitude: 37.5446, longitude: 127.0558 }
      )
    ).toMatchObject({
      name: "성수 손칼국수",
      address: "서울특별시 성동구 성수이로 10",
      latitude: 37.5446,
      longitude: 127.0558,
      categoryId: "local",
    });
  });

  it("infers app categories from Naver categories and search queries", () => {
    expect(inferPlaceCategory("카페,디저트", "서울 카페")).toBe("cafe");
    expect(inferPlaceCategory("술집>요리주점", "홍대 술집")).toBe("drink");
    expect(inferPlaceCategory("음식점>양식", "데이트 맛집")).toBe("date");
  });

  it("deduplicates candidates by normalized name and address", () => {
    const candidates = [
      {
        name: "성수 손칼국수",
        address: "서울 성동구 성수이로 10",
        latitude: 37.5446,
        longitude: 127.0558,
        categoryId: "local" as const,
        tagIds: [],
      },
      {
        name: "성수손칼국수",
        address: "서울 성동구 성수이로 10 ",
        latitude: 37.5446,
        longitude: 127.0558,
        categoryId: "budget" as const,
        tagIds: [],
      },
    ];

    expect(dedupeNaverPlaceCandidates(candidates)).toHaveLength(1);
  });
});
