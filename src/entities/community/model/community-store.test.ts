import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PHOTO_BYTES,
  loadCommunityData,
  shouldUseLocalFallbackForStartupError,
  validatePhotoFile,
} from "./community-store";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
});

describe("shouldUseLocalFallbackForStartupError", () => {
  it("falls back when Supabase anonymous sign-ins are disabled", () => {
    expect(shouldUseLocalFallbackForStartupError("Anonymous sign-ins are disabled")).toBe(true);
  });

  it("falls back when the project schema has not been installed yet", () => {
    expect(
      shouldUseLocalFallbackForStartupError('relation "public.anonymous_profiles" does not exist')
    ).toBe(true);
  });

  it("does not silently switch to local fallback in production", () => {
    expect(
      shouldUseLocalFallbackForStartupError("Anonymous sign-ins are disabled", {
        nodeEnv: "production",
      })
    ).toBe(false);
  });
});

describe("loadCommunityData", () => {
  it("limits Supabase reads to places near the current location and their reviews", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

    const placesQuery = createSupabaseQuery({
      data: [
        {
          id: "near-place",
          owner_id: "anon-1",
          name: "시청 근처 밥집",
          address: "서울 중구 세종대로 110",
          latitude: 37.5667,
          longitude: 126.9784,
          category_id: "local",
          tag_ids: [],
          hero_image_url: null,
          status: "public",
          created_at: "2026-05-16T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const reviewsQuery = createSupabaseQuery({
      data: [
        {
          id: "near-review",
          place_id: "near-place",
          owner_id: "anon-2",
          nickname: "든든한 국밥친구",
          price_range: "1만원 이하",
          recommended_menu: "칼국수",
          good_point: "가까워요",
          bad_point: "대기가 있어요",
          revisit_intent: "yes",
          image_url: null,
          status: "public",
          created_at: "2026-05-16T00:01:00.000Z",
        },
      ],
      error: null,
    });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "places") {
          return placesQuery;
        }

        if (table === "reviews") {
          return reviewsQuery;
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    vi.mocked(createClient).mockReturnValue(client as never);

    const data = await loadCommunityData({
      location: { latitude: 37.5665, longitude: 126.978 },
      radiusMeters: 2_000,
    });

    expect(placesQuery.gte).toHaveBeenCalledWith("latitude", expect.any(Number));
    expect(placesQuery.lte).toHaveBeenCalledWith("latitude", expect.any(Number));
    expect(placesQuery.gte).toHaveBeenCalledWith("longitude", expect.any(Number));
    expect(placesQuery.lte).toHaveBeenCalledWith("longitude", expect.any(Number));
    expect(reviewsQuery.in).toHaveBeenCalledWith("place_id", ["near-place"]);
    expect(data.places).toHaveLength(1);
    expect(data.places[0]).toMatchObject({ id: "near-place", reviewCount: 1 });
    expect(data.reviews.map((review) => review.id)).toEqual(["near-review"]);
  });

  it("limits Supabase reads to places inside the visible map bounds", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://bounds.example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

    const placesQuery = createSupabaseQuery({
      data: [
        {
          id: "visible-place",
          owner_id: "anon-1",
          name: "화면 안 밥집",
          address: "서울 중구 세종대로 110",
          latitude: 37.5667,
          longitude: 126.9784,
          category_id: "local",
          tag_ids: [],
          hero_image_url: null,
          status: "public",
          created_at: "2026-05-16T00:00:00.000Z",
        },
        {
          id: "hidden-place",
          owner_id: "anon-2",
          name: "화면 밖 밥집",
          address: "서울 성동구 성수이로 10",
          latitude: 37.5446,
          longitude: 127.0558,
          category_id: "budget",
          tag_ids: [],
          hero_image_url: null,
          status: "public",
          created_at: "2026-05-16T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const reviewsQuery = createSupabaseQuery({
      data: [
        {
          id: "visible-review",
          place_id: "visible-place",
          owner_id: "anon-3",
          nickname: "솔직한 면발수호자",
          price_range: "1만-2만원",
          recommended_menu: "비빔밥",
          good_point: "지도에 보여요",
          bad_point: "없어요",
          revisit_intent: "maybe",
          image_url: null,
          status: "public",
          created_at: "2026-05-16T00:01:00.000Z",
        },
      ],
      error: null,
    });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "places") {
          return placesQuery;
        }

        if (table === "reviews") {
          return reviewsQuery;
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    vi.mocked(createClient).mockReturnValue(client as never);

    const data = await loadCommunityData({
      bounds: {
        south: 37.56,
        north: 37.57,
        west: 126.97,
        east: 126.99,
      },
    });

    expect(placesQuery.gte).toHaveBeenCalledWith("latitude", 37.56);
    expect(placesQuery.lte).toHaveBeenCalledWith("latitude", 37.57);
    expect(placesQuery.gte).toHaveBeenCalledWith("longitude", 126.97);
    expect(placesQuery.lte).toHaveBeenCalledWith("longitude", 126.99);
    expect(reviewsQuery.in).toHaveBeenCalledWith("place_id", ["visible-place"]);
    expect(data.places.map((place) => place.id)).toEqual(["visible-place"]);
    expect(data.reviews.map((review) => review.id)).toEqual(["visible-review"]);
  });
});

describe("validatePhotoFile", () => {
  it("allows supported raster image uploads under the size limit", () => {
    const file = new File(["image"], "photo.jpg", { type: "image/jpeg" });

    expect(() => validatePhotoFile(file)).not.toThrow();
  });

  it("rejects non-image uploads", () => {
    const file = new File(["select 1"], "payload.sql", { type: "application/sql" });

    expect(() => validatePhotoFile(file)).toThrow("이미지 파일만 업로드할 수 있습니다.");
  });

  it("rejects svg uploads even when the browser reports an image MIME type", () => {
    const file = new File(["<svg />"], "payload.svg", { type: "image/svg+xml" });

    expect(() => validatePhotoFile(file)).toThrow(
      "JPG, PNG, WebP, GIF 사진만 업로드할 수 있습니다."
    );
  });

  it("rejects oversized uploads", () => {
    const file = new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], "large.png", {
      type: "image/png",
    });

    expect(() => validatePhotoFile(file)).toThrow("사진은 5MB 이하만 업로드할 수 있습니다.");
  });
});

function createSupabaseQuery<T>(result: { data: T[]; error: null | { message: string } }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    then: vi.fn((resolve, reject) => Promise.resolve(result).then(resolve, reject)),
  };

  return query;
}
