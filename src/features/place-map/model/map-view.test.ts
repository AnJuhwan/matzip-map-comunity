import { describe, expect, it } from "vitest";
import { DEFAULT_MAP_VIEW, getInitialMapView } from "./map-view";
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
