import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PHOTO_BYTES,
  ensureAnonymousProfile,
  getBrowserSupabaseClient,
  loadCommunityData,
  savePlace,
  saveReview,
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

describe("Supabase-only storage", () => {
  it("creates the browser Supabase client without persisting auth in localStorage", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

    getBrowserSupabaseClient();

    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "publishable-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        }),
      })
    );
  });

  it("does not create a local fallback profile when Supabase is not configured", async () => {
    await expect(ensureAnonymousProfile()).rejects.toThrow(
      "Supabase 설정이 필요합니다. 사용자 데이터는 브라우저 저장소에 저장하지 않습니다."
    );
  });

  it("does not read local fallback community data when Supabase is not configured", async () => {
    await expect(loadCommunityData()).rejects.toThrow(
      "Supabase 설정이 필요합니다. 사용자 데이터는 브라우저 저장소에 저장하지 않습니다."
    );
  });

  it("does not write places or reviews to localStorage when Supabase is not configured", async () => {
    await expect(
      savePlace({
        activeAnonymousId: "anon-1",
        draft: {
          ownerAnonymousId: "anon-1",
          name: "로컬 저장 금지",
          address: "서울 중구 세종대로 110",
          latitude: 37.5665,
          longitude: 126.978,
          categoryId: "local",
          tagIds: [],
        },
      })
    ).rejects.toThrow("Supabase 설정이 필요합니다.");

    await expect(
      saveReview({
        activeAnonymousId: "anon-1",
        review: {
          placeId: "place-1",
          ownerAnonymousId: "anon-1",
          nickname: "테스터",
          priceRange: "1만원 이하",
          recommendedMenu: "김밥",
          goodPoint: "좋아요",
          badPoint: "없어요",
          revisitIntent: "yes",
        },
      })
    ).rejects.toThrow("Supabase 설정이 필요합니다.");
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

  it("maps multiple review image URLs and falls back to legacy single images", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://images.example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

    const placesQuery = createSupabaseQuery({
      data: [
        {
          id: "photo-place",
          owner_id: "anon-1",
          naver_place_key: null,
          name: "사진 맛집",
          address: "서울 중구 세종대로 110",
          latitude: 37.5667,
          longitude: 126.9784,
          category_id: "local",
          tag_ids: [],
          hero_image_url: null,
          photo_urls: [],
          status: "public",
          created_at: "2026-05-16T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const reviewsQuery = createSupabaseQuery({
      data: [
        {
          id: "multi-photo-review",
          place_id: "photo-place",
          owner_id: "anon-2",
          nickname: "든든한 국밥친구",
          price_range: "1만원 이하",
          recommended_menu: "칼국수",
          good_point: "사진이 많아요",
          bad_point: "없어요",
          revisit_intent: "yes",
          image_url: "https://example.com/legacy.jpg",
          image_urls: ["https://example.com/one.jpg", "https://example.com/two.jpg"],
          status: "public",
          created_at: "2026-05-16T00:01:00.000Z",
        },
        {
          id: "legacy-photo-review",
          place_id: "photo-place",
          owner_id: "anon-3",
          nickname: "솔직한 면발수호자",
          price_range: "1만-2만원",
          recommended_menu: "비빔밥",
          good_point: "옛날 사진도 보여요",
          bad_point: "없어요",
          revisit_intent: "maybe",
          image_url: "https://example.com/legacy-only.jpg",
          image_urls: [],
          status: "public",
          created_at: "2026-05-16T00:02:00.000Z",
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

    const data = await loadCommunityData();

    expect(data.reviews[0]).toMatchObject({
      id: "multi-photo-review",
      imageUrl: "https://example.com/one.jpg",
      imageUrls: ["https://example.com/one.jpg", "https://example.com/two.jpg"],
    });
    expect(data.reviews[1]).toMatchObject({
      id: "legacy-photo-review",
      imageUrl: "https://example.com/legacy-only.jpg",
      imageUrls: ["https://example.com/legacy-only.jpg"],
    });
  });
});

describe("saveReview", () => {
  it("uploads multiple review photos and stores the first URL for legacy clients", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://review-images.example.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

    const reviewMutationQuery = createMutationSupabaseQuery({
      data: {
        id: "saved-review",
        place_id: "place-1",
        owner_id: "anon-1",
        nickname: "테스터",
        price_range: "1만원 이하",
        recommended_menu: "칼국수",
        good_point: "좋아요",
        bad_point: "없어요",
        revisit_intent: "yes",
        image_url: "https://cdn.example/anon-1/review-first.jpg",
        image_urls: [
          "https://cdn.example/anon-1/review-first.jpg",
          "https://cdn.example/anon-1/review-second.png",
        ],
        status: "public",
        created_at: "2026-05-16T00:01:00.000Z",
      },
      error: null,
    });
    const upload = vi.fn(() => Promise.resolve({ data: {}, error: null }));
    const getPublicUrl = vi.fn((path: string) => ({
      data: { publicUrl: `https://cdn.example/${path}` },
    }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "reviews") {
          return reviewMutationQuery;
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
      storage: {
        from: vi.fn(() => ({
          upload,
          getPublicUrl,
        })),
      },
    };

    vi.mocked(createClient).mockReturnValue(client as never);

    const saved = await saveReview({
      activeAnonymousId: "anon-1",
      review: {
        placeId: "place-1",
        ownerAnonymousId: "anon-1",
        nickname: "테스터",
        priceRange: "1만원 이하",
        recommendedMenu: "칼국수",
        goodPoint: "좋아요",
        badPoint: "없어요",
        revisitIntent: "yes",
      },
      imageFiles: [
        new File(["first"], "first.jpg", { type: "image/jpeg" }),
        new File(["second"], "second.png", { type: "image/png" }),
      ],
    });

    const payload = reviewMutationQuery.insert.mock.calls[0][0];

    expect(upload).toHaveBeenCalledTimes(2);
    expect(payload).toMatchObject({
      image_url: expect.stringMatching(/^https:\/\/cdn\.example\/anon-1\/review-/),
      image_urls: [
        expect.stringMatching(/^https:\/\/cdn\.example\/anon-1\/review-/),
        expect.stringMatching(/^https:\/\/cdn\.example\/anon-1\/review-/),
      ],
    });
    expect(saved).toMatchObject({
      id: "saved-review",
      imageUrl: "https://cdn.example/anon-1/review-first.jpg",
      imageUrls: [
        "https://cdn.example/anon-1/review-first.jpg",
        "https://cdn.example/anon-1/review-second.png",
      ],
    });
  });

  it("rejects reviews with more than three uploaded photos", async () => {
    await expect(
      saveReview({
        activeAnonymousId: "anon-1",
        review: {
          placeId: "place-1",
          ownerAnonymousId: "anon-1",
          nickname: "테스터",
          priceRange: "1만원 이하",
          recommendedMenu: "칼국수",
          goodPoint: "좋아요",
          badPoint: "없어요",
          revisitIntent: "yes",
        },
        imageFiles: [
          new File(["one"], "one.jpg", { type: "image/jpeg" }),
          new File(["two"], "two.jpg", { type: "image/jpeg" }),
          new File(["three"], "three.jpg", { type: "image/jpeg" }),
          new File(["four"], "four.jpg", { type: "image/jpeg" }),
        ],
      })
    ).rejects.toThrow("리뷰 사진은 최대 3장까지 업로드할 수 있습니다.");
  });
});

describe("savePlace", () => {
  it("saves a Naver candidate when production is missing optional place columns", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://missing-column.example.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

    const lookupQuery = createMaybeSingleSupabaseQuery({
      data: null,
      error: { message: "column places.naver_place_key does not exist" },
    });
    const failingInsertQuery = createMutationSupabaseQuery({
      data: null,
      error: {
        message: "Could not find the 'photo_urls' column of 'places' in the schema cache",
      },
    });
    const retryInsertQuery = createMutationSupabaseQuery({
      data: createPlaceRow(),
      error: null,
    });
    const client = createSequencedSupabaseClient([
      lookupQuery,
      failingInsertQuery,
      retryInsertQuery,
    ]);

    vi.mocked(createClient).mockReturnValue(client as never);

    const saved = await savePlace({
      activeAnonymousId: "anon-1",
      draft: {
        ownerAnonymousId: "anon-1",
        naverPlaceKey: "naver-place-1",
        name: "네이버 후보 식당",
        address: "서울 중구 세종대로 110",
        latitude: 37.5665,
        longitude: 126.978,
        categoryId: "local",
        tagIds: [],
      },
    });

    expect(lookupQuery.eq).toHaveBeenCalledWith("naver_place_key", "naver-place-1");
    expect(failingInsertQuery.insert.mock.calls[0][0]).not.toHaveProperty("naver_place_key");
    expect(failingInsertQuery.insert.mock.calls[0][0]).toHaveProperty("photo_urls");
    expect(retryInsertQuery.insert.mock.calls[0][0]).not.toHaveProperty("naver_place_key");
    expect(retryInsertQuery.insert.mock.calls[0][0]).not.toHaveProperty("photo_urls");
    expect(saved).toMatchObject({ id: "saved-place", name: "네이버 후보 식당" });
  });

  it("retries without naver_place_key if the insert discovers schema drift", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://insert-drift.example.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

    const lookupQuery = createMaybeSingleSupabaseQuery({ data: null, error: null });
    const failingInsertQuery = createMutationSupabaseQuery({
      data: null,
      error: {
        message: "Could not find the 'naver_place_key' column of 'places' in the schema cache",
      },
    });
    const retryInsertQuery = createMutationSupabaseQuery({
      data: createPlaceRow(),
      error: null,
    });
    const client = createSequencedSupabaseClient([
      lookupQuery,
      failingInsertQuery,
      retryInsertQuery,
    ]);

    vi.mocked(createClient).mockReturnValue(client as never);

    const saved = await savePlace({
      activeAnonymousId: "anon-1",
      draft: {
        ownerAnonymousId: "anon-1",
        naverPlaceKey: "naver-place-2",
        name: "네이버 후보 식당",
        address: "서울 중구 세종대로 110",
        latitude: 37.5665,
        longitude: 126.978,
        categoryId: "local",
        tagIds: [],
      },
    });

    expect(failingInsertQuery.insert.mock.calls[0][0]).toHaveProperty(
      "naver_place_key",
      "naver-place-2"
    );
    expect(retryInsertQuery.insert.mock.calls[0][0]).not.toHaveProperty("naver_place_key");
    expect(saved.id).toBe("saved-place");
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

function createMaybeSingleSupabaseQuery<T>(result: {
  data: T | null;
  error: null | { message: string };
}) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };

  return query;
}

function createMutationSupabaseQuery<T>(result: {
  data: T | null;
  error: null | { message: string };
}) {
  const query = {
    insert: vi.fn((payload: unknown) => {
      void payload;
      return query;
    }),
    update: vi.fn((payload: unknown) => {
      void payload;
      return query;
    }),
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(result)),
  };

  return query;
}

function createSequencedSupabaseClient(queries: unknown[]) {
  return {
    from: vi.fn((table: string) => {
      if (table !== "places") {
        throw new Error(`Unexpected table: ${table}`);
      }

      const nextQuery = queries.shift();

      if (!nextQuery) {
        throw new Error("Unexpected Supabase query");
      }

      return nextQuery;
    }),
  };
}

function createPlaceRow() {
  return {
    id: "saved-place",
    owner_id: "anon-1",
    name: "네이버 후보 식당",
    address: "서울 중구 세종대로 110",
    latitude: 37.5665,
    longitude: 126.978,
    category_id: "local",
    tag_ids: [],
    hero_image_url: null,
    photo_urls: [],
    status: "public",
    created_at: "2026-05-18T00:00:00.000Z",
  };
}
