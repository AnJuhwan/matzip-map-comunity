"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  type ContentStatus,
  type Place,
  type PlaceDraft,
  type Review,
  makeAnonymousNickname,
  normalizePlaceDraft,
} from "./domain";
import {
  NEARBY_RADIUS_METERS,
  getDistanceMeters,
  type GeoBounds,
  type UserLocation,
} from "./location";

export type AnonymousProfile = {
  id: string;
  nickname: string;
  backend: "supabase";
};

export type CommunityData = {
  places: Place[];
  reviews: Review[];
};

export type CommunityDataScope = {
  location?: Pick<UserLocation, "latitude" | "longitude">;
  radiusMeters?: number;
  bounds?: GeoBounds;
};

type DbPlaceRow = {
  id: string;
  owner_id: string;
  naver_place_key: string | null;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category_id: Place["categoryId"];
  tag_ids: string[];
  hero_image_url: string | null;
  photo_urls: string[] | null;
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
  image_urls?: string[] | null;
  status: ContentStatus;
  created_at: string;
};

type SupabaseErrorLike = {
  message?: string;
};

type PlaceMutationPayload = {
  owner_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category_id: Place["categoryId"];
  tag_ids: string[];
  hero_image_url: string | null;
  photo_urls?: string[];
  naver_place_key?: string | null;
  status?: ContentStatus;
};

const SUPABASE_REQUIRED_MESSAGE =
  "Supabase 설정이 필요합니다. 사용자 데이터는 브라우저 저장소에 저장하지 않습니다.";
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_REVIEW_PHOTOS = 3;

const allowedPhotoMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const photoMimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

let browserSupabase: SupabaseClient | null = null;
let browserSupabaseConfig: { url: string; publishableKey: string } | null = null;

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function getBrowserSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const config = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  };

  if (
    !browserSupabase ||
    browserSupabaseConfig?.url !== config.url ||
    browserSupabaseConfig?.publishableKey !== config.publishableKey
  ) {
    browserSupabase = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    browserSupabaseConfig = config;
  }

  return browserSupabase;
}

export async function ensureAnonymousProfile(): Promise<AnonymousProfile> {
  const supabase = getBrowserSupabaseClient();

  if (!supabase) {
    throw new Error(SUPABASE_REQUIRED_MESSAGE);
  }

  const sessionResult = await supabase.auth.getSession();
  let user = sessionResult.data.session?.user ?? null;

  if (!user) {
    const signInResult = await supabase.auth.signInAnonymously();

    if (signInResult.error || !signInResult.data.user) {
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
  const supabase = getBrowserSupabaseClient();

  if (!supabase) {
    throw new Error(SUPABASE_REQUIRED_MESSAGE);
  }

  const result = await supabase
    .from("anonymous_profiles")
    .update({ nickname: nextNickname })
    .eq("id", profile.id);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return { ...profile, nickname: nextNickname };
}

function isMissingNaverPlaceKeyColumnError(error: SupabaseErrorLike | null | undefined) {
  return isMissingPlaceColumnError(error, "naver_place_key");
}

function isMissingPlaceColumnError(
  error: SupabaseErrorLike | null | undefined,
  columnName: string
) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    (message.includes(`places.${columnName}`) ||
      (message.includes(columnName) && message.includes("places"))) &&
    (message.includes("does not exist") || message.includes("schema cache"))
  );
}

export async function loadCommunityData(scope: CommunityDataScope = {}): Promise<CommunityData> {
  const supabase = getBrowserSupabaseClient();

  if (!supabase) {
    throw new Error(SUPABASE_REQUIRED_MESSAGE);
  }

  const radiusMeters = scope.radiusMeters ?? NEARBY_RADIUS_METERS;
  const scopeBounds =
    scope.bounds ?? (scope.location ? getLocationBounds(scope.location, radiusMeters) : null);
  let placesQuery = supabase.from("places").select("*").eq("status", "public");

  if (scopeBounds) {
    placesQuery = placesQuery
      .gte("latitude", scopeBounds.south)
      .lte("latitude", scopeBounds.north)
      .gte("longitude", scopeBounds.west)
      .lte("longitude", scopeBounds.east);
  }

  const placesResult = await placesQuery.order("created_at", { ascending: false });

  if (placesResult.error) {
    throw new Error(placesResult.error.message);
  }

  const scopedPlaces = placesResult.data
    .map(mapPlaceFromRow)
    .filter((place) => isPlaceInDataScope(place, scope, radiusMeters));
  const placeIds = scopedPlaces.map((place) => place.id);
  let reviewsResult;

  if (scopeBounds && !placeIds.length) {
    reviewsResult = { data: [] as DbReviewRow[], error: null };
  } else {
    let reviewsQuery = supabase.from("reviews").select("*").eq("status", "public");

    if (scopeBounds) {
      reviewsQuery = reviewsQuery.in("place_id", placeIds);
    }

    reviewsResult = await reviewsQuery.order("created_at", { ascending: false });
  }

  if (reviewsResult.error) {
    throw new Error(reviewsResult.error.message);
  }

  const reviews = (reviewsResult.data ?? []).map(mapReviewFromRow);
  const places = scopedPlaces.map((place) => attachPlaceStats(place, reviews));

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

  if (!supabase) {
    throw new Error(SUPABASE_REQUIRED_MESSAGE);
  }

  let canUseNaverPlaceKey = Boolean(normalized.naverPlaceKey);
  let canUsePhotoUrls = true;

  if (!input.id && normalized.naverPlaceKey) {
    const existingResult = await supabase
      .from("places")
      .select("*")
      .eq("naver_place_key", normalized.naverPlaceKey)
      .eq("status", "public")
      .maybeSingle();

    if (existingResult.error) {
      if (isMissingNaverPlaceKeyColumnError(existingResult.error)) {
        canUseNaverPlaceKey = false;
      } else {
        throw new Error(existingResult.error.message);
      }
    }

    if (existingResult.data) {
      return mapPlaceFromRow(existingResult.data);
    }
  }

  const basePayload: Omit<PlaceMutationPayload, "naver_place_key" | "photo_urls" | "status"> = {
    owner_id: normalized.ownerAnonymousId,
    name: normalized.name,
    address: normalized.address,
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    category_id: normalized.categoryId,
    tag_ids: normalized.tagIds,
    hero_image_url: normalized.heroImageUrl ?? null,
  };
  let result = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const payload: PlaceMutationPayload = {
      ...basePayload,
      ...(canUsePhotoUrls ? { photo_urls: normalized.photoUrls ?? [] } : {}),
      ...(canUseNaverPlaceKey ? { naver_place_key: normalized.naverPlaceKey ?? null } : {}),
    };

    result = input.id
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

    if (!result.error) {
      break;
    }

    const nextCanUseNaverPlaceKey: boolean =
      canUseNaverPlaceKey && !isMissingPlaceColumnError(result.error, "naver_place_key");
    const nextCanUsePhotoUrls: boolean =
      canUsePhotoUrls && !isMissingPlaceColumnError(result.error, "photo_urls");

    if (
      nextCanUseNaverPlaceKey === canUseNaverPlaceKey &&
      nextCanUsePhotoUrls === canUsePhotoUrls
    ) {
      break;
    }

    canUseNaverPlaceKey = nextCanUseNaverPlaceKey;
    canUsePhotoUrls = nextCanUsePhotoUrls;
  }

  if (result?.error) {
    throw new Error(result.error.message);
  }

  return mapPlaceFromRow(result!.data);
}

export async function saveReview(input: {
  id?: string;
  review: Omit<Review, "id" | "status" | "createdAt">;
  imageFile?: File | null;
  imageFiles?: File[] | null;
  activeAnonymousId: string;
}) {
  const nextImageFiles = getReviewImageFiles(input.imageFiles, input.imageFile);
  validateReviewPhotoFiles(nextImageFiles);
  const uploadedImageUrls = nextImageFiles.length
    ? await Promise.all(
        nextImageFiles.map((imageFile) => uploadPhoto(imageFile, input.activeAnonymousId, "review"))
      )
    : null;
  const imageUrls =
    uploadedImageUrls ?? normalizeReviewImageUrls(input.review.imageUrls, input.review.imageUrl);
  const legacyImageUrl = imageUrls[0] ?? input.review.imageUrl ?? null;
  const supabase = getBrowserSupabaseClient();

  if (!supabase) {
    throw new Error(SUPABASE_REQUIRED_MESSAGE);
  }

  const payload = {
    place_id: input.review.placeId,
    owner_id: input.review.ownerAnonymousId,
    nickname: input.review.nickname.trim(),
    price_range: input.review.priceRange,
    recommended_menu: input.review.recommendedMenu.trim(),
    good_point: input.review.goodPoint.trim(),
    bad_point: input.review.badPoint.trim(),
    revisit_intent: input.review.revisitIntent,
    image_url: legacyImageUrl,
    image_urls: imageUrls,
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

export async function softDeleteContent(input: {
  type: "place" | "review";
  id: string;
  activeAnonymousId: string;
}) {
  const supabase = getBrowserSupabaseClient();

  if (!supabase) {
    throw new Error(SUPABASE_REQUIRED_MESSAGE);
  }

  const table = input.type === "place" ? "places" : "reviews";
  const result = await supabase
    .from(table)
    .update({ status: "deleted" })
    .eq("id", input.id)
    .eq("owner_id", input.activeAnonymousId);

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function reportContent(input: {
  targetType: "place" | "review";
  targetId: string;
  reporterAnonymousId: string;
  reason: string;
}) {
  const supabase = getBrowserSupabaseClient();

  if (!supabase) {
    throw new Error(SUPABASE_REQUIRED_MESSAGE);
  }

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

async function uploadPhoto(file: File, ownerId: string, scope: string) {
  validatePhotoFile(file);

  const supabase = getBrowserSupabaseClient();

  if (!supabase) {
    throw new Error(SUPABASE_REQUIRED_MESSAGE);
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

function getReviewImageFiles(imageFiles?: File[] | null, imageFile?: File | null) {
  if (imageFiles) {
    return imageFiles;
  }

  return imageFile ? [imageFile] : [];
}

export function validateReviewPhotoFiles(files: File[]) {
  if (files.length > MAX_REVIEW_PHOTOS) {
    throw new Error(`리뷰 사진은 최대 ${MAX_REVIEW_PHOTOS}장까지 업로드할 수 있습니다.`);
  }

  files.forEach(validatePhotoFile);
}

function normalizeReviewImageUrls(imageUrls?: string[] | null, legacyImageUrl?: string | null) {
  const normalizedUrls = (imageUrls ?? []).filter(Boolean);

  if (normalizedUrls.length) {
    return normalizedUrls;
  }

  return legacyImageUrl ? [legacyImageUrl] : [];
}

function mapPlaceFromRow(row: DbPlaceRow): Place {
  return {
    id: row.id,
    naverPlaceKey: row.naver_place_key ?? undefined,
    ownerAnonymousId: row.owner_id,
    name: row.name,
    address: row.address,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    categoryId: row.category_id,
    tagIds: row.tag_ids ?? [],
    heroImageUrl: row.hero_image_url ?? undefined,
    photoUrls: row.photo_urls ?? [],
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapReviewFromRow(row: DbReviewRow): Review {
  const imageUrls = normalizeReviewImageUrls(row.image_urls, row.image_url);

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
    imageUrl: imageUrls[0] ?? undefined,
    imageUrls,
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

function getLocationBounds(
  location: Pick<UserLocation, "latitude" | "longitude">,
  radiusMeters: number
): GeoBounds {
  const metersPerLatitudeDegree = 111_320;
  const latitudeDelta = radiusMeters / metersPerLatitudeDegree;
  const longitudeScale = Math.cos(toRadians(location.latitude));
  const longitudeDelta =
    Math.abs(longitudeScale) < 0.000001
      ? 180
      : radiusMeters / (metersPerLatitudeDegree * longitudeScale);

  return {
    south: Math.max(-90, location.latitude - latitudeDelta),
    north: Math.min(90, location.latitude + latitudeDelta),
    west: Math.max(-180, location.longitude - Math.abs(longitudeDelta)),
    east: Math.min(180, location.longitude + Math.abs(longitudeDelta)),
  };
}

function isPlaceInDataScope(place: Place, scope: CommunityDataScope, radiusMeters: number) {
  if (scope.bounds && !isPlaceInBounds(place, scope.bounds)) {
    return false;
  }

  if (!scope.location) {
    return true;
  }

  return (
    getDistanceMeters(
      scope.location.latitude,
      scope.location.longitude,
      place.latitude,
      place.longitude
    ) <= radiusMeters
  );
}

function isPlaceInBounds(place: Place, bounds: GeoBounds) {
  return (
    place.latitude >= bounds.south &&
    place.latitude <= bounds.north &&
    place.longitude >= bounds.west &&
    place.longitude <= bounds.east
  );
}

function hashToSeed(value: string) {
  return value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function cryptoId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
