import { describe, expect, it } from "vitest";
import {
  canMutateContent,
  findDuplicatePlaces,
  getVisiblePlaces,
  makeAnonymousNickname,
  normalizePlaceDraft,
} from "./domain";
import type { Place } from "./domain";

describe("makeAnonymousNickname", () => {
  it("creates a friendly deterministic Korean nickname from a seed", () => {
    expect(makeAnonymousNickname(42)).toBe("든든한 김치탐험가");
  });
});

describe("normalizePlaceDraft", () => {
  it("trims text, deduplicates tags, and keeps the place public by default", () => {
    expect(
      normalizePlaceDraft({
        name: "  을지로 칼국수  ",
        address: "  서울 중구 을지로 100  ",
        latitude: 37.5663,
        longitude: 126.991,
        categoryId: "budget",
        tagIds: ["solo", "solo", "parking"],
        ownerAnonymousId: "anon-1",
      })
    ).toMatchObject({
      name: "을지로 칼국수",
      address: "서울 중구 을지로 100",
      categoryId: "budget",
      tagIds: ["solo", "parking"],
      ownerAnonymousId: "anon-1",
      status: "public",
    });
  });
});

describe("findDuplicatePlaces", () => {
  const places: Place[] = [
    {
      id: "p-1",
      name: "성수 분식",
      address: "서울 성동구 성수이로 10",
      latitude: 37.5446,
      longitude: 127.0558,
      categoryId: "budget",
      tagIds: [],
      ownerAnonymousId: "anon-1",
      status: "public" as const,
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
      status: "public" as const,
    },
  ];

  it("returns nearby or same-address candidates and ignores distant places", () => {
    expect(
      findDuplicatePlaces(
        {
          name: "성수분식",
          address: "서울 성동구 성수이로 10",
          latitude: 37.54462,
          longitude: 127.05582,
        },
        places
      ).map((place) => place.id)
    ).toEqual(["p-1"]);
  });
});

describe("visibility and ownership", () => {
  it("hides moderated places from public lists", () => {
    expect(
      getVisiblePlaces([
        { id: "p-1", status: "public" },
        { id: "p-2", status: "hidden" },
        { id: "p-3", status: "deleted" },
      ])
    ).toEqual([{ id: "p-1", status: "public" }]);
  });

  it("only lets the same anonymous user mutate their content", () => {
    expect(canMutateContent("anon-1", { ownerAnonymousId: "anon-1" })).toBe(true);
    expect(canMutateContent("anon-2", { ownerAnonymousId: "anon-1" })).toBe(false);
  });
});
