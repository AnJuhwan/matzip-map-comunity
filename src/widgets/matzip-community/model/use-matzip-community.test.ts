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
