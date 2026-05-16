import { describe, expect, it } from "vitest";
import {
  clearNaverMapMarkers,
  DEFAULT_MAP_VIEW,
  getFallbackMapMarkers,
  getInitialMapView,
  installNaverMapAuthFailureHandler,
} from "./map-view";
import type { Place } from "@/entities/community";

const places: Place[] = [
  {
    id: "p-1",
    name: "성수 밥집",
    address: "서울 성동구 성수이로 10",
    latitude: 37.5446,
    longitude: 127.0558,
    categoryId: "budget",
    tagIds: [],
    ownerAnonymousId: "anon-1",
    status: "public",
  },
  {
    id: "p-2",
    name: "부산 국밥",
    address: "부산 부산진구 중앙대로 1",
    latitude: 35.1578,
    longitude: 129.0592,
    categoryId: "local",
    tagIds: [],
    ownerAnonymousId: "anon-2",
    status: "public",
  },
];

describe("getInitialMapView", () => {
  it("centers on the selected place when one is selected", () => {
    expect(getInitialMapView(places, "p-2")).toEqual({
      latitude: 35.1578,
      longitude: 129.0592,
      zoom: 13,
    });
  });

  it("falls back to the first place when the selected id is missing", () => {
    expect(getInitialMapView(places, "missing")).toEqual({
      latitude: 37.5446,
      longitude: 127.0558,
      zoom: 13,
    });
  });

  it("still returns a default map view when there are no places", () => {
    expect(getInitialMapView([], undefined)).toEqual(DEFAULT_MAP_VIEW);
  });
});

describe("getFallbackMapMarkers", () => {
  it("keeps the fallback map readable when many places are visible", () => {
    const manyPlaces = Array.from({ length: 20 }, (_, index) => ({
      ...places[index % places.length],
      id: `p-${index}`,
      name: `장소 ${index}`,
      latitude: 33 + index * 0.2,
      longitude: 126 + index * 0.1,
    }));

    const markers = getFallbackMapMarkers(manyPlaces, "p-13");

    expect(markers).toHaveLength(20);
    expect(markers.filter((marker) => marker.showLabel).map((marker) => marker.id)).toEqual([
      "p-13",
    ]);
    expect(markers.every((marker) => marker.left >= 12 && marker.left <= 88)).toBe(true);
    expect(markers.every((marker) => marker.top >= 12 && marker.top <= 88)).toBe(true);
  });

  it("shows every label for a small fallback map", () => {
    const markers = getFallbackMapMarkers(places, "p-2");

    expect(markers.map((marker) => marker.showLabel)).toEqual([true, true]);
  });
});

describe("installNaverMapAuthFailureHandler", () => {
  it("calls the fallback handler when Naver reports auth failure", () => {
    const target: { navermap_authFailure?: () => void } = {};
    let failureCount = 0;

    const cleanup = installNaverMapAuthFailureHandler(target, () => {
      failureCount += 1;
    });

    target.navermap_authFailure?.();

    expect(failureCount).toBe(1);

    cleanup();

    expect(target.navermap_authFailure).toBeUndefined();
  });
});

describe("clearNaverMapMarkers", () => {
  it("does not throw when the Naver SDK marker cleanup fails", () => {
    const markers = [
      {
        setMap() {
          throw new Error("Naver marker cleanup failed");
        },
      },
    ];

    expect(() => clearNaverMapMarkers(markers)).not.toThrow();
  });
});
