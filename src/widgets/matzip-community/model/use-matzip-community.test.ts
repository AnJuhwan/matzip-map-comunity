// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { describe, expect, it } from "vitest";
import {
  buildNearbyCandidateRequestKey,
  getGeoBoundsCenter,
  getNearbyCandidateCategoryParam,
  shouldLoadNearbyCandidates,
  useMatzipCommunity,
} from "./use-matzip-community";

const browserLocation = {
  latitude: 37.5446,
  longitude: 127.0558,
};

const searchLocation = {
  latitude: 37.515577,
  longitude: 126.907702,
};

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);

    if (url.startsWith("/api/geocode")) {
      return new Response(
        JSON.stringify({
          address: "서울 영등포구 경인로 846",
          latitude: searchLocation.latitude,
          longitude: searchLocation.longitude,
          source: "naver-local-search",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }

    if (url.startsWith("/api/nearby-place-candidates")) {
      return new Response(JSON.stringify({ places: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({}), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  });

  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition(success: PositionCallback) {
        success({
          coords: {
            latitude: browserLocation.latitude,
            longitude: browserLocation.longitude,
            accuracy: 10,
          },
        } as GeolocationPosition);
      },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("getNearbyCandidateCategoryParam", () => {
  it("limits manually searched station results to restaurants", () => {
    expect(getNearbyCandidateCategoryParam(" 영등포역 ")).toBe("food");
  });

  it("uses restaurant candidates for the visible map even without a manual search area", () => {
    expect(getNearbyCandidateCategoryParam()).toBe("food");
    expect(getNearbyCandidateCategoryParam("  ")).toBe("food");
  });
});

describe("shouldLoadNearbyCandidates", () => {
  it("loads external restaurant candidates for the visible map even without search text", () => {
    expect(shouldLoadNearbyCandidates()).toBe(true);
    expect(shouldLoadNearbyCandidates("  ")).toBe(true);
    expect(shouldLoadNearbyCandidates("까치산")).toBe(true);
  });
});

describe("getGeoBoundsCenter", () => {
  it("uses the visible map center as the candidate lookup location", () => {
    const center = getGeoBoundsCenter({
      south: 37.51,
      north: 37.53,
      west: 126.9,
      east: 126.92,
    });

    expect(center.latitude).toBeCloseTo(37.52);
    expect(center.longitude).toBeCloseTo(126.91);
  });
});

describe("buildNearbyCandidateRequestKey", () => {
  it("normalizes whitespace and tiny coordinate jitter for duplicate requests", () => {
    const baseKey = buildNearbyCandidateRequestKey({
      searchQuery: "  마곡역   음식점 ",
      areaQuery: " 마곡동 ",
      categories: "food",
      location: { latitude: 37.559456, longitude: 126.826789 },
      bounds: {
        south: 37.550001,
        north: 37.570001,
        west: 126.820001,
        east: 126.840001,
      },
    });
    const sameKey = buildNearbyCandidateRequestKey({
      searchQuery: "마곡역 음식점",
      areaQuery: "마곡동",
      categories: "food",
      location: { latitude: 37.559457, longitude: 126.826788 },
      bounds: {
        south: 37.550002,
        north: 37.570002,
        west: 126.820002,
        east: 126.840002,
      },
    });

    expect(sameKey).toBe(baseKey);
  });
});

describe("useMatzipCommunity", () => {
  it("does not load Naver candidates from the default fallback before browser location resolves", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition() {
          // Keep the location request pending.
        },
      },
    });
    const fetchSpy = vi.mocked(globalThis.fetch);
    const { result } = renderHook(() => useMatzipCommunity());

    await waitFor(() => {
      expect(result.current.locationStatus).toBe("requesting");
    });

    act(() => {
      result.current.handleVisibleBoundsChange(
        {
          south: 36.34,
          north: 36.36,
          west: 127.37,
          east: 127.39,
        },
        "대전광역시"
      );
    });

    expect(getNearbyCandidateFetchUrls(fetchSpy)).toHaveLength(0);
  });

  it("loads visible-map candidates after the browser location falls back", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(_success: PositionCallback, error?: PositionErrorCallback) {
          error?.({ code: 1, message: "denied" } as GeolocationPositionError);
        },
      },
    });
    const fetchSpy = vi.mocked(globalThis.fetch);
    const { result } = renderHook(() => useMatzipCommunity());

    await waitFor(() => {
      expect(result.current.locationStatus).toBe("fallback");
    });

    act(() => {
      result.current.handleVisibleBoundsChange(
        {
          south: 37.56,
          north: 37.58,
          west: 126.97,
          east: 126.99,
        },
        "서울특별시"
      );
    });

    await waitFor(() => {
      const candidateUrls = getNearbyCandidateFetchUrls(fetchSpy).map(
        (url) => new URL(url, "http://localhost")
      );

      expect(
        candidateUrls.some(
          (url) =>
            url.searchParams.get("areaQuery") === "서울특별시" &&
            Math.abs(Number(url.searchParams.get("latitude")) - 37.57) < 0.000001 &&
            Math.abs(Number(url.searchParams.get("longitude")) - 126.98) < 0.000001
        )
      ).toBe(true);
    });
  });

  it("applies the shared search query on first load", async () => {
    const { result } = renderHook(() => useMatzipCommunity("마곡역 음식점"));

    await waitFor(() => {
      expect(result.current.locationStatus).toBe("ready");
    });

    await waitFor(() => {
      expect(result.current.mapFocusLocation).toMatchObject(searchLocation);
    });

    expect(result.current.query).toBe("마곡역 음식점");
  });

  it("loads Naver restaurant candidates when the map moves without search text", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch);
    const { result } = renderHook(() => useMatzipCommunity());

    await waitFor(() => {
      expect(result.current.locationStatus).toBe("ready");
    });

    act(() => {
      result.current.handleVisibleBoundsChange({
        south: 37.54,
        north: 37.55,
        west: 127.05,
        east: 127.06,
      });
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/nearby-place-candidates?"),
        expect.anything()
      );
    });

    expect(
      fetchSpy.mock.calls
        .map(([input]) => String(input))
        .some(
          (url) =>
            url.startsWith("/api/nearby-place-candidates?") &&
            url.includes("south=37.54") &&
            !url.includes("query=")
        )
    ).toBe(true);
  });

  it("passes the visible map area to Naver candidate search when geocoder resolves it", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch);
    const { result } = renderHook(() => useMatzipCommunity());

    await waitFor(() => {
      expect(result.current.locationStatus).toBe("ready");
    });

    act(() => {
      result.current.handleVisibleBoundsChange(
        {
          south: 37.55,
          north: 37.57,
          west: 126.82,
          east: 126.84,
        },
        "마곡동"
      );
    });

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls
          .map(([input]) => String(input))
          .some(
            (url) =>
              url.startsWith("/api/nearby-place-candidates?") &&
              url.includes("areaQuery=%EB%A7%88%EA%B3%A1%EB%8F%99") &&
              !url.includes("query=")
          )
      ).toBe(true);
    });
  });

  it("dedupes repeated Naver candidate loads for the same visible bounds and area", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch);
    const { result } = renderHook(() => useMatzipCommunity());
    const bounds = {
      south: 37.55,
      north: 37.57,
      west: 126.82,
      east: 126.84,
    };

    await waitFor(() => {
      expect(result.current.locationStatus).toBe("ready");
    });

    act(() => {
      result.current.handleVisibleBoundsChange(bounds, "마곡동");
    });

    await waitFor(() => {
      expect(getNearbyCandidateFetchUrls(fetchSpy)).toHaveLength(1);
    });

    act(() => {
      result.current.handleVisibleBoundsChange({ ...bounds }, " 마곡동 ");
    });

    expect(getNearbyCandidateFetchUrls(fetchSpy)).toHaveLength(1);
  });

  it("waits for visible map bounds before loading Naver candidates on startup", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch);
    renderHook(() => useMatzipCommunity());

    await waitFor(() => {
      expect(fetchSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("/api/nearby-place-candidates?"),
        expect.anything()
      );
    });
  });

  it("keeps the user location marker on the browser location when search focuses the map", async () => {
    const { result } = renderHook(() => useMatzipCommunity());

    await waitFor(() => {
      expect(result.current.locationStatus).toBe("ready");
    });

    act(() => {
      result.current.setQuery("영등포역");
    });
    act(() => {
      result.current.handleSearchSubmit();
    });

    await waitFor(() => {
      expect(result.current.mapFocusLocation).toMatchObject(searchLocation);
    });

    expect(result.current.userLocation).toMatchObject(browserLocation);
  });

  it("does not use fallback geocode coordinates for search focus or candidate lookup", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch);
    fetchSpy.mockImplementation(async (input) => {
      const url = String(input);

      if (url.startsWith("/api/geocode")) {
        return new Response(
          JSON.stringify({
            address: "검색 실패 fallback",
            latitude: 36.3504,
            longitude: 127.3845,
            source: "fallback",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }

      if (url.startsWith("/api/nearby-place-candidates")) {
        return new Response(JSON.stringify({ places: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({}), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    });
    const { result } = renderHook(() => useMatzipCommunity());

    await waitFor(() => {
      expect(result.current.locationStatus).toBe("ready");
    });

    act(() => {
      result.current.setQuery("좌표 없는 검색어");
    });
    act(() => {
      result.current.handleSearchSubmit();
    });

    await waitFor(() => {
      expect(fetchSpy.mock.calls.some(([input]) => String(input).startsWith("/api/geocode?"))).toBe(
        true
      );
    });

    expect(result.current.mapFocusLocation).toMatchObject(browserLocation);
    expect(
      getNearbyCandidateFetchUrls(fetchSpy).some(
        (url) => url.includes("latitude=36.3504") || url.includes("longitude=127.3845")
      )
    ).toBe(false);
  });

  it("keeps food-only searches on the visible map instead of geocoding them", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch);
    const { result } = renderHook(() => useMatzipCommunity());
    const bounds = {
      south: 37.54,
      north: 37.55,
      west: 127.05,
      east: 127.06,
    };

    await waitFor(() => {
      expect(result.current.locationStatus).toBe("ready");
    });

    act(() => {
      result.current.handleVisibleBoundsChange(bounds, "성수동");
    });

    await waitFor(() => {
      expect(getNearbyCandidateFetchUrls(fetchSpy)).toHaveLength(1);
    });

    fetchSpy.mockClear();

    act(() => {
      result.current.setQuery("갈비");
    });
    act(() => {
      result.current.handleSearchSubmit();
    });

    await waitFor(() => {
      const candidateUrls = getNearbyCandidateFetchUrls(fetchSpy).map(
        (url) => new URL(url, "http://localhost")
      );

      expect(
        candidateUrls.some(
          (url) =>
            url.searchParams.get("query") === "갈비" &&
            url.searchParams.get("areaQuery") === "성수동" &&
            Number(url.searchParams.get("latitude")) === getGeoBoundsCenter(bounds).latitude &&
            Number(url.searchParams.get("longitude")) === getGeoBoundsCenter(bounds).longitude
        )
      ).toBe(true);
    });
    expect(fetchSpy.mock.calls.some(([input]) => String(input).startsWith("/api/geocode?"))).toBe(
      false
    );
    expect(result.current.mapFocusLocation).toMatchObject(getGeoBoundsCenter(bounds));
  });

  it("moves compact area-food searches to the area and matches spaced source queries", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch);
    fetchSpy.mockImplementation(async (input) => {
      const url = String(input);

      if (url.startsWith("/api/geocode")) {
        return new Response(
          JSON.stringify({
            address: "서울 강서구 마곡중앙로",
            latitude: searchLocation.latitude,
            longitude: searchLocation.longitude,
            source: "naver-local-search",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }

      if (url.startsWith("/api/nearby-place-candidates")) {
        const requestUrl = new URL(url, "http://localhost");
        const places =
          requestUrl.searchParams.get("query") === "마곡 갈비"
            ? [
                {
                  tempId: "candidate-magok-galbi",
                  name: "서울 화로갈비",
                  address: "서울 강서구 마곡중앙로 20",
                  latitude: searchLocation.latitude,
                  longitude: searchLocation.longitude,
                  categoryId: "family",
                  tagIds: ["local"],
                  distanceMeters: 0,
                  sourceQuery: "마곡 갈비",
                  source: "naver",
                },
              ]
            : [];

        return new Response(JSON.stringify({ places }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({}), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    });
    const { result } = renderHook(() => useMatzipCommunity());

    await waitFor(() => {
      expect(result.current.locationStatus).toBe("ready");
    });

    fetchSpy.mockClear();

    act(() => {
      result.current.setQuery("마곡갈비");
    });
    act(() => {
      result.current.handleSearchSubmit();
    });

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(([input]) =>
          String(input).startsWith("/api/geocode?query=%EB%A7%88%EA%B3%A1%EC%97%AD")
        )
      ).toBe(true);
    });
    await waitFor(() => {
      const candidateUrls = getNearbyCandidateFetchUrls(fetchSpy).map(
        (url) => new URL(url, "http://localhost")
      );

      expect(
        candidateUrls.some(
          (url) =>
            url.searchParams.get("query") === "마곡 갈비" &&
            Number(url.searchParams.get("latitude")) === searchLocation.latitude &&
            Number(url.searchParams.get("longitude")) === searchLocation.longitude
        )
      ).toBe(true);
    });
    await waitFor(() => {
      expect(result.current.filteredCandidates.map((candidate) => candidate.name)).toEqual([
        "서울 화로갈비",
      ]);
    });
    expect(result.current.mapFocusLocation).toMatchObject(searchLocation);
    expect(result.current.appliedQuery).toBe("마곡갈비");
  });

  it("clears the applied search query when the user requests their current location", async () => {
    const { result } = renderHook(() => useMatzipCommunity("영등포역"));

    await waitFor(() => {
      expect(result.current.locationStatus).toBe("ready");
    });

    act(() => {
      result.current.handleRequestUserLocation();
    });

    expect(result.current.query).toBe("");
    expect(result.current.appliedQuery).toBe("");
  });

  it("shows restaurants from the moved map bounds even when a previous search query remains", async () => {
    const { result } = renderHook(() => useMatzipCommunity());

    await waitFor(() => {
      expect(result.current.locationStatus).toBe("ready");
    });

    act(() => {
      result.current.setQuery("까치산");
    });
    act(() => {
      result.current.handleSearchSubmit();
    });

    await waitFor(() => {
      expect(result.current.mapFocusLocation).toMatchObject(searchLocation);
    });

    act(() => {
      result.current.handleVisibleBoundsChange({
        south: 37.54,
        north: 37.55,
        west: 127.05,
        east: 127.06,
      });
    });

    await waitFor(() => {
      expect(result.current.filteredPlaces.map((place) => place.name)).toContain("성수 손칼국수");
    });
    expect(result.current.mapFocusLocation).toMatchObject({
      latitude: 37.545,
      longitude: 127.055,
    });
  });
});

function getNearbyCandidateFetchUrls(fetchSpy: ReturnType<typeof vi.mocked<typeof fetch>>) {
  return fetchSpy.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.startsWith("/api/nearby-place-candidates?"));
}
