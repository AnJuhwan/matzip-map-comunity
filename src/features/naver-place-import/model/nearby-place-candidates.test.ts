import { describe, expect, it } from "vitest";
import {
  buildCandidateDetailHref,
  buildNearbyPlaceQueries,
  mapToNearbyPlaceCandidate,
  parseFoodSearchIntent,
  parseCandidateSearchParams,
} from "./nearby-place-candidates";

const userLocation = {
  latitude: 37.5446,
  longitude: 127.0558,
};

describe("buildNearbyPlaceQueries", () => {
  it("builds food, cafe, and drink searches from the most specific reverse-geocoded area", () => {
    expect(
      buildNearbyPlaceQueries(
        {
          area2: "성동구",
          area3: "성수동",
        },
        ["food", "cafe", "drink"]
      )
    ).toEqual(["성수동 음식점", "성수동 맛집", "성수동 카페", "성수동 술집"]);
  });

  it("builds broad restaurant searches when reverse geocoding cannot name an area", () => {
    expect(buildNearbyPlaceQueries(null, ["food", "cafe"])).toEqual(["음식점", "맛집", "카페"]);
  });

  it("builds local-search queries from a manually entered area before reverse geocoding", () => {
    expect(buildNearbyPlaceQueries(null, ["food", "cafe"], " 까치산역 ")).toEqual([
      "까치산역 음식점",
      "까치산역 맛집",
      "까치산역 카페",
    ]);
  });

  it("builds restaurant searches for the visible map when no search text exists", () => {
    expect(buildNearbyPlaceQueries(null, ["food"])).toEqual(["음식점", "맛집"]);
  });

  it("uses the submitted search text first and adds restaurant-focused variants", () => {
    expect(buildNearbyPlaceQueries(null, ["food"], null, " 마곡역 음식점 ")).toEqual([
      "마곡역 음식점",
      "마곡역 맛집",
    ]);
  });

  it("prefixes food-only searches with the visible map area", () => {
    expect(buildNearbyPlaceQueries(null, ["food"], "마곡동", "갈비")).toEqual([
      "마곡동 갈비",
      "마곡동 갈비 맛집",
    ]);
  });
});

describe("parseFoodSearchIntent", () => {
  it("keeps food-only searches near the current map", () => {
    expect(parseFoodSearchIntent(" 갈비 ")).toEqual({
      kind: "food",
      foodQuery: "갈비",
      candidateQuery: "갈비",
    });
  });

  it("splits compact area and food searches", () => {
    expect(parseFoodSearchIntent("마곡갈비")).toEqual({
      kind: "area-food",
      areaQuery: "마곡",
      areaFocusQuery: "마곡역",
      foodQuery: "갈비",
      candidateQuery: "마곡 갈비",
    });
  });
});

describe("mapToNearbyPlaceCandidate", () => {
  it("adds a stable temporary id and distance from the user location", () => {
    const candidate = mapToNearbyPlaceCandidate(
      {
        name: "성수 손칼국수",
        address: "서울 성동구 성수이로 10",
        latitude: 37.5446,
        longitude: 127.0558,
        categoryId: "local",
        tagIds: ["large"],
        sourceQuery: "성수동 맛집",
        naverPlaceKey: "naver:seongsu",
        photoUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
      },
      userLocation
    );

    expect(candidate).toMatchObject({
      tempId: expect.stringMatching(/^candidate-/),
      name: "성수 손칼국수",
      distanceMeters: 0,
      source: "naver",
      naverPlaceKey: "naver:seongsu",
      photoUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
    });
  });
});

describe("candidate detail URLs", () => {
  it("round-trips a Naver candidate through the temporary detail URL", () => {
    const candidate = mapToNearbyPlaceCandidate(
      {
        name: "성수 손칼국수",
        address: "서울 성동구 성수이로 10",
        latitude: 37.5446,
        longitude: 127.0558,
        categoryId: "local",
        tagIds: ["large", "waiting"],
        sourceQuery: "성수동 맛집",
        naverPlaceKey: "naver:seongsu",
        heroImageUrl: "https://example.com/photo.jpg",
        photoUrls: ["https://example.com/photo.jpg", "https://example.com/interior.jpg"],
      },
      userLocation
    );
    const href = buildCandidateDetailHref(candidate);
    const searchParams = new URL(`http://localhost${href}`).searchParams;

    expect(parseCandidateSearchParams(searchParams)).toMatchObject({
      name: "성수 손칼국수",
      address: "서울 성동구 성수이로 10",
      latitude: 37.5446,
      longitude: 127.0558,
      categoryId: "local",
      tagIds: ["large", "waiting"],
      sourceQuery: "성수동 맛집",
      naverPlaceKey: "naver:seongsu",
      heroImageUrl: "https://example.com/photo.jpg",
      photoUrls: ["https://example.com/photo.jpg", "https://example.com/interior.jpg"],
    });
  });
});
