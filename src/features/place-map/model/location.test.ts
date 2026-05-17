import { describe, expect, it } from "vitest";
import type { Place } from "@/entities/community";
import {
  DEFAULT_USER_LOCATION,
  NEARBY_RADIUS_METERS,
  getDistanceMeters,
  getNearbyPlaces,
} from "./location";

const places: Place[] = [
  {
    id: "near",
    name: "시청 근처 밥집",
    address: "서울 중구 세종대로 110",
    latitude: 37.5667,
    longitude: 126.9784,
    categoryId: "local",
    tagIds: [],
    ownerAnonymousId: "anon-1",
    status: "public",
  },
  {
    id: "walk",
    name: "걸어갈 수 있는 카페",
    address: "서울 중구 을지로 30",
    latitude: 37.5651,
    longitude: 126.9895,
    categoryId: "cafe",
    tagIds: [],
    ownerAnonymousId: "anon-2",
    status: "public",
  },
  {
    id: "far",
    name: "성수 먼 밥집",
    address: "서울 성동구 성수이로 10",
    latitude: 37.5446,
    longitude: 127.0558,
    categoryId: "budget",
    tagIds: [],
    ownerAnonymousId: "anon-3",
    status: "public",
  },
];

describe("DEFAULT_USER_LOCATION", () => {
  it("uses Seoul City Hall as the fallback location", () => {
    expect(DEFAULT_USER_LOCATION).toMatchObject({
      latitude: 37.5665,
      longitude: 126.978,
      source: "fallback",
    });
  });
});

describe("getDistanceMeters", () => {
  it("returns zero for the same coordinate", () => {
    expect(
      getDistanceMeters(
        DEFAULT_USER_LOCATION.latitude,
        DEFAULT_USER_LOCATION.longitude,
        DEFAULT_USER_LOCATION.latitude,
        DEFAULT_USER_LOCATION.longitude
      )
    ).toBe(0);
  });
});

describe("getNearbyPlaces", () => {
  it("keeps places within 2km and returns them nearest first", () => {
    const nearby = getNearbyPlaces(places, DEFAULT_USER_LOCATION, NEARBY_RADIUS_METERS);

    expect(nearby.map((place) => place.id)).toEqual(["near", "walk"]);
    expect(nearby[0].distanceMeters).toBeLessThan(100);
    expect(nearby[1].distanceMeters).toBeGreaterThan(nearby[0].distanceMeters);
  });
});
