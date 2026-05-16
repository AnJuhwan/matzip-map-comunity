"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  type ContentStatus,
  type Place,
  type PlaceDraft,
  type Review,
  canMutateContent,
  makeAnonymousNickname,
  normalizePlaceDraft,
} from "./domain";
import { samplePlaces, sampleReviews } from "./sample-data";

export type AnonymousProfile = {
  id: string;
  nickname: string;
  backend: "supabase" | "local";
};

export type CommunityData = {
  places: Place[];
  reviews: Review[];
};

type DbPlaceRow = {
  id: string;
  owner_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category_id: Place["categoryId"];
  tag_ids: string[];
  hero_image_url: string | null;
  status: ContentStatus;
  created_at: string;
};

type DbReviewRow = {
  id: string;
  place_id: string;
  owner_id: string;
  nickname: string;
  price_range: Review["priceRange"];
  recommended_menu: string;
  good_point: string;
  bad_point: string;
  revisit_intent: Review["revisitIntent"];
  image_url: string | null;
  status: ContentStatus;
  created_at: string;
};

const localProfileKey = "matzip.profile.v1";
const localDataKey = "matzip.community.v1";
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const allowedPhotoMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const photoMimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

let browserSupabase: SupabaseClient | null = null;
let forceLocalMode = false;

type LocalFallbackOptions = {
  nodeEnv?: string;
};

export function isSupabaseConfigured() {
  return Boolean(
    !forceLocalMode &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function getBrowserSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!browserSupabase) {
    browserSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
  }

  return browserSupabase;
}

export async function ensureAnonymousProfile(): Promise<AnonymousProfile> {
  const supabase = getBrowserSupabaseClient();

  if (!supabase) {
    return ensureLocalProfile();
  }

  const sessionResult = await supabase.auth.getSession();
  let user = sessionResult.data.session?.user ?? null;

  if (!user) {
    const signInResult = await supabase.auth.signInAnonymously();

    if (signInResult.error || !signInResult.data.user) {
      if (shouldUseLocalFallbackForStartupError(signInResult.error?.message ?? "")) {
        return activateLocalFallback();
      }

      throw new Error(signInResult.error?.message ?? "익명 세션을 만들지 못했습니다.");
    }

    user = signInResult.data.user;
  }

  const profileResult = await supabase
    .from("anonymous_profiles")
    .select("id,nickname")
    .eq("id", user.id)
    .maybeSingle();

  if (profileResult.error) {
    if (shouldUseLocalFallbackForStartupError(profileResult.error.message)) {
      return activateLocalFallback();
    }

    throw new Error(profileResult.error.message);
  }

  if (profileResult.data) {
    return {
      id: profileResult.data.id,
      nickname: profileResult.data.nickname,
      backend: "supabase",
    };
  }

  const nickname = makeAnonymousNickname(hashToSeed(user.id));
  const insertResult = await supabase
    .from("anonymous_profiles")
    .insert({ id: user.id, nickname })
    .select("id,nickname")
    .single();

  if (insertResult.error) {
    if (shouldUseLocalFallbackForStartupError(insertResult.error.message)) {
      return activateLocalFallback();
    }

    throw new Error(insertResult.error.message);
  }

  return {
    id: insertResult.data.id,
    nickname: insertResult.data.nickname,
    backend: "supabase",
  };
}

export async function updateNickname(profile: AnonymousProfile, nickname: string) {
  const nextNickname = nickname.trim() || makeAnonymousNickname();

  if (profile.backend === "supabase") {
    const supabase = getBrowserSupabaseClient();
    const result = await supabase
      ?.from("anonymous_profiles")
      .update({ nickname: nextNickname })
      .eq("id", profile.id);

    if (result?.error) {
      throw new Error(result.error.message);
    }
  } else {
    saveLocalProfile({ ...profile, nickname: nextNickname });
  }

  return { ...profile, nickname: nextNickname };
}

export function shouldUseLocalFallbackForStartupError(
  message: string,
  options: LocalFallbackOptions = {}
) {
  if (!isLocalFallbackEnabled(options)) {
    return false;
  }

  const normalized = message.toLowerCase();

  return (
    normalized.includes("anonymous sign-ins are disabled") ||
    normalized.includes("anonymous provider is disabled") ||
    normalized.includes("anonymous signups are disabled") ||
    (normalized.includes("relation") && normalized.includes("does not exist")) ||
    (normalized.includes("schema cache") && normalized.includes("not find"))
  );
}

export function isLocalFallbackEnabled(options: LocalFallbackOptions = {}) {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;

  return nodeEnv !== "production";
}

export async function loadCommunityData(): Promise<CommunityData> {
  const supabase = getBrowserSupabaseClient();

  if (!supabase) {
    return readLocalData();
  }

  const [placesResult, reviewsResult] = await Promise.all([
    supabase
      .from("places")
      .select("*")
      .eq("status", "public")
      .order("created_at", { ascending: false }),
    supabase
      .from("reviews")
      .select("*")
      .eq("status", "public")
      .order("created_at", { ascending: false }),
  ]);

  if (placesResult.error) {
    if (shouldUseLocalFallbackForStartupError(placesResult.error.message)) {
      forceLocalMode = true;
      return readLocalData();
    }

    throw new Error(placesResult.error.message);
  }

  if (reviewsResult.error) {
    if (shouldUseLocalFallbackForStartupError(reviewsResult.error.message)) {
      forceLocalMode = true;
      return readLocalData();
    }

    throw new Error(reviewsResult.error.message);
  }

  const reviews = reviewsResult.data.map(mapReviewFromRow);
  const places = placesResult.data.map((row) => attachPlaceStats(mapPlaceFromRow(row), reviews));

  return { places, reviews };
}

export async function savePlace(input: {
  id?: string;
  draft: PlaceDraft;
  imageFile?: File | null;
  activeAnonymousId: string;
}) {
  const imageUrl = input.imageFile
    ? await uploadPhoto(input.imageFile, input.activeAnonymousId, "place")
    : input.draft.heroImageUrl;
  const normalized = normalizePlaceDraft({
    ...input.draft,
    heroImageUrl: imageUrl,
  });
  const supabase = getBrowserSupabaseClient();

  if (supabase) {
    const payload = {
      owner_id: normalized.ownerAnonymousId,
      name: normalized.name,
      address: normalized.address,
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      category_id: normalized.categoryId,
      tag_ids: normalized.tagIds,
      hero_image_url: normalized.heroImageUrl ?? null,
    };
    const result = input.id
      ? await supabase
          .from("places")
          .update(payload)
          .eq("id", input.id)
          .eq("owner_id", input.activeAnonymousId)
          .select("*")
          .single()
      : await supabase
          .from("places")
          .insert({ ...payload, status: normalized.status })
          .select("*")
          .single();

    if (result.error) {
      throw new Error(result.error.message);
    }

    return mapPlaceFromRow(result.data);
  }

  const data = readLocalData();
  const existingPlace = input.id ? data.places.find((place) => place.id === input.id) : null;
  const place: Place = {
    ...normalized,
    id: input.id ?? cryptoId(),
    status: existingPlace?.status ?? normalized.status,
    createdAt: existingPlace?.createdAt ?? new Date().toISOString(),
  };
  const places = input.id
    ? data.places.map((item) => (item.id === input.id ? place : item))
    : [place, ...data.places];

  writeLocalData({ ...data, places });
  return attachPlaceStats(place, data.reviews);
}

export async function saveReview(input: {
  id?: string;
  review: Omit<Review, "id" | "status" | "createdAt">;
  imageFile?: File | null;
  activeAnonymousId: string;
}) {
  const imageUrl = input.imageFile
    ? await uploadPhoto(input.imageFile, input.activeAnonymousId, "review")
    : input.review.imageUrl;
  const supabase = getBrowserSupabaseClient();

  if (supabase) {
    const payload = {
      place_id: input.review.placeId,
      owner_id: input.review.ownerAnonymousId,
      nickname: input.review.nickname.trim(),
      price_range: input.review.priceRange,
      recommended_menu: input.review.recommendedMenu.trim(),
      good_point: input.review.goodPoint.trim(),
      bad_point: input.review.badPoint.trim(),
      revisit_intent: input.review.revisitIntent,
      image_url: imageUrl ?? null,
    };
    const result = input.id
      ? await supabase
          .from("reviews")
          .update(payload)
          .eq("id", input.id)
          .eq("owner_id", input.activeAnonymousId)
          .select("*")
          .single()
      : await supabase
          .from("reviews")
          .insert({ ...payload, status: "public" })
          .select("*")
          .single();

    if (result.error) {
      throw new Error(result.error.message);
    }

    return mapReviewFromRow(result.data);
  }

  const data = readLocalData();
  const targetPlace = data.places.find((place) => place.id === input.review.placeId);

  if (!targetPlace || targetPlace.status !== "public") {
    throw new Error("공개된 맛집에만 리뷰를 작성할 수 있습니다.");
  }

  const existingReview = input.id ? data.reviews.find((review) => review.id === input.id) : null;
  const review: Review = {
    ...input.review,
    id: input.id ?? cryptoId(),
    nickname: input.review.nickname.trim(),
    recommendedMenu: input.review.recommendedMenu.trim(),
    goodPoint: input.review.goodPoint.trim(),
    badPoint: input.review.badPoint.trim(),
    imageUrl,
    status: existingReview?.status ?? "public",
    createdAt: existingReview?.createdAt ?? new Date().toISOString(),
  };
  const reviews = input.id
    ? data.reviews.map((item) => (item.id === input.id ? review : item))
    : [review, ...data.reviews];

  writeLocalData({ ...data, reviews });
  return review;
}

export async function softDeleteContent(input: {
  type: "place" | "review";
  id: string;
  activeAnonymousId: string;
}) {
  const supabase = getBrowserSupabaseClient();

  if (supabase) {
    const table = input.type === "place" ? "places" : "reviews";
    const result = await supabase
      .from(table)
      .update({ status: "deleted" })
      .eq("id", input.id)
      .eq("owner_id", input.activeAnonymousId);

    if (result.error) {
      throw new Error(result.error.message);
    }

    return;
  }

  const data = readLocalData();
  if (input.type === "place") {
    writeLocalData({
      ...data,
      places: data.places.map((place) =>
        place.id === input.id && canMutateContent(input.activeAnonymousId, place)
          ? { ...place, status: "deleted" }
          : place
      ),
    });
  } else {
    writeLocalData({
      ...data,
      reviews: data.reviews.map((review) =>
        review.id === input.id && canMutateContent(input.activeAnonymousId, review)
          ? { ...review, status: "deleted" }
          : review
      ),
    });
  }
}

export async function reportContent(input: {
  targetType: "place" | "review";
  targetId: string;
  reporterAnonymousId: string;
  reason: string;
}) {
  const supabase = getBrowserSupabaseClient();

  if (supabase) {
    const result = await supabase.from("reports").insert({
      target_type: input.targetType,
      target_id: input.targetId,
      reporter_id: input.reporterAnonymousId,
      reason: input.reason,
      status: "open",
    });

    if (result.error) {
      throw new Error(result.error.message);
    }
  }
}

function ensureLocalProfile(): AnonymousProfile {
  ensureLocalFallbackAllowed();

  const stored = window.localStorage.getItem(localProfileKey);

  if (stored) {
    return JSON.parse(stored) as AnonymousProfile;
  }

  const id = `local-${cryptoId()}`;
  const profile = {
    id,
    nickname: makeAnonymousNickname(hashToSeed(id)),
    backend: "local" as const,
  };
  saveLocalProfile(profile);

  return profile;
}

function activateLocalFallback() {
  forceLocalMode = true;
  browserSupabase = null;

  return ensureLocalProfile();
}

function saveLocalProfile(profile: AnonymousProfile) {
  window.localStorage.setItem(localProfileKey, JSON.stringify(profile));
}

function readLocalData(): CommunityData {
  ensureLocalFallbackAllowed();

  const stored = window.localStorage.getItem(localDataKey);

  if (stored) {
    return JSON.parse(stored) as CommunityData;
  }

  const seed = { places: samplePlaces, reviews: sampleReviews };
  writeLocalData(seed);

  return seed;
}

function writeLocalData(data: CommunityData) {
  window.localStorage.setItem(localDataKey, JSON.stringify(data));
}

async function uploadPhoto(file: File, ownerId: string, scope: string) {
  validatePhotoFile(file);

  const supabase = getBrowserSupabaseClient();

  if (!supabase) {
    return fileToDataUrl(file);
  }

  const extension = photoMimeExtensions[file.type] ?? "jpg";
  const path = `${ownerId}/${scope}-${cryptoId()}.${extension}`;
  const uploadResult = await supabase.storage
    .from("place-photos")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message);
  }

  return supabase.storage.from("place-photos").getPublicUrl(path).data.publicUrl;
}

export function validatePhotoFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 업로드할 수 있습니다.");
  }

  if (!allowedPhotoMimeTypes.has(file.type)) {
    throw new Error("JPG, PNG, WebP, GIF 사진만 업로드할 수 있습니다.");
  }

  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error("사진은 5MB 이하만 업로드할 수 있습니다.");
  }
}

function ensureLocalFallbackAllowed() {
  if (!isLocalFallbackEnabled()) {
    throw new Error("운영 환경에서는 Supabase 설정 오류로 로컬 저장소를 사용할 수 없습니다.");
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("사진을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function mapPlaceFromRow(row: DbPlaceRow): Place {
  return {
    id: row.id,
    ownerAnonymousId: row.owner_id,
    name: row.name,
    address: row.address,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    categoryId: row.category_id,
    tagIds: row.tag_ids ?? [],
    heroImageUrl: row.hero_image_url ?? undefined,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapReviewFromRow(row: DbReviewRow): Review {
  return {
    id: row.id,
    placeId: row.place_id,
    ownerAnonymousId: row.owner_id,
    nickname: row.nickname,
    priceRange: row.price_range,
    recommendedMenu: row.recommended_menu,
    goodPoint: row.good_point,
    badPoint: row.bad_point,
    revisitIntent: row.revisit_intent,
    imageUrl: row.image_url ?? undefined,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function attachPlaceStats(place: Place, reviews: Review[]) {
  const visibleReviews = reviews.filter(
    (review) => review.placeId === place.id && review.status === "public"
  );
  const revisitScore = visibleReviews.reduce((sum, review) => {
    if (review.revisitIntent === "yes") {
      return sum + 1;
    }

    if (review.revisitIntent === "maybe") {
      return sum + 0.5;
    }

    return sum;
  }, 0);

  return {
    ...place,
    reviewCount: visibleReviews.length,
    averageRevisitScore: visibleReviews.length ? revisitScore / visibleReviews.length : 0,
  };
}

function hashToSeed(value: string) {
  return value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function cryptoId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
