import {
  getDistanceMeters,
  type CategoryId,
  type TagId,
  type UserLocation,
} from "@/entities/community";
import type { NaverPlaceCandidate } from "./naver-local-search";

export type NearbyPlaceCategory = "food" | "cafe" | "drink";

export type ReverseGeocodeArea = {
  area1?: string;
  area2?: string;
  area3?: string;
};

export type NearbyPlaceCandidate = NaverPlaceCandidate & {
  tempId: string;
  distanceMeters: number;
  source: "naver";
};

export type FoodSearchIntent =
  | {
      kind: "food";
      foodQuery: string;
      candidateQuery: string;
    }
  | {
      kind: "area-food";
      areaQuery: string;
      areaFocusQuery: string;
      foodQuery: string;
      candidateQuery: string;
    };

const nearbyCategoryLabels: Record<NearbyPlaceCategory, string> = {
  food: "맛집",
  cafe: "카페",
  drink: "술집",
};

const candidateCategoryIds = new Set<CategoryId>([
  "budget",
  "solo",
  "date",
  "family",
  "drink",
  "cafe",
  "local",
]);

const foodSearchTerms = [
  "돼지갈비",
  "양념갈비",
  "소갈비",
  "갈비탕",
  "고기집",
  "고깃집",
  "음식점",
  "레스토랑",
  "삼겹살",
  "소고기",
  "돼지고기",
  "오마카세",
  "이탈리안",
  "파스타",
  "스테이크",
  "족발",
  "보쌈",
  "곱창",
  "막창",
  "냉면",
  "국밥",
  "초밥",
  "스시",
  "라멘",
  "라면",
  "분식",
  "김밥",
  "떡볶이",
  "치킨",
  "피자",
  "중식",
  "일식",
  "양식",
  "한식",
  "밥집",
  "식당",
  "맛집",
  "갈비",
  "고기",
].sort((first, second) => compactAreaQuery(second).length - compactAreaQuery(first).length);

const areaFocusSuffixPattern = /(역|동|구|군|시|읍|면|리|로|길|시장|터미널|공항|대학교|대)$/;
const minAreaSearchLength = 2;

export function buildNearbyPlaceQueries(
  area: ReverseGeocodeArea | null,
  categories: NearbyPlaceCategory[],
  manualAreaQuery?: string | null,
  searchQuery?: string | null
) {
  const normalizedSearchQuery = normalizeAreaQuery(searchQuery);

  if (normalizedSearchQuery) {
    const foodSearchIntent = parseFoodSearchIntent(normalizedSearchQuery);

    if (foodSearchIntent?.kind === "food") {
      const areaName = getNearbyQueryArea(area, manualAreaQuery);
      const localFoodQuery = areaName
        ? `${areaName} ${foodSearchIntent.foodQuery}`
        : foodSearchIntent.candidateQuery;

      return buildSearchTextQueries(localFoodQuery, categories);
    }

    return buildSearchTextQueries(
      foodSearchIntent?.candidateQuery ?? normalizedSearchQuery,
      categories
    );
  }

  const areaName = getNearbyQueryArea(area, manualAreaQuery);
  const queryPrefix = areaName ? `${areaName} ` : "";

  return Array.from(
    new Set(
      categories.flatMap((category) =>
        getNearbyCategoryLabels(category).map((label) => `${queryPrefix}${label}`.trim())
      )
    )
  );
}

export function getNearbyQueryArea(
  area: ReverseGeocodeArea | null,
  manualAreaQuery?: string | null
) {
  return (
    normalizeAreaQuery(manualAreaQuery) ||
    normalizeAreaQuery(area?.area3) ||
    normalizeAreaQuery(area?.area2) ||
    normalizeAreaQuery(area?.area1) ||
    null
  );
}

export function parseFoodSearchIntent(searchQuery?: string | null): FoodSearchIntent | null {
  const normalizedSearchQuery = normalizeAreaQuery(searchQuery);

  if (!normalizedSearchQuery) {
    return null;
  }

  const compactSearchQuery = compactAreaQuery(normalizedSearchQuery);

  for (const foodTerm of foodSearchTerms) {
    const compactFoodTerm = compactAreaQuery(foodTerm);

    if (compactSearchQuery === compactFoodTerm) {
      return {
        kind: "food",
        foodQuery: normalizedSearchQuery,
        candidateQuery: normalizedSearchQuery,
      };
    }

    if (!compactSearchQuery.endsWith(compactFoodTerm)) {
      continue;
    }

    const compactArea = compactSearchQuery.slice(0, -compactFoodTerm.length);

    if (compactArea.length < minAreaSearchLength) {
      continue;
    }

    const areaQuery = getOriginalPrefixByCompactLength(normalizedSearchQuery, compactArea.length);

    if (!areaQuery) {
      continue;
    }

    const foodQuery = normalizedSearchQuery.slice(areaQuery.length).trim() || foodTerm;

    return {
      kind: "area-food",
      areaQuery,
      areaFocusQuery: buildAreaFocusQuery(areaQuery),
      foodQuery,
      candidateQuery: `${areaQuery} ${foodQuery}`.trim(),
    };
  }

  return null;
}

export function isFoodOnlySearchQuery(searchQuery?: string | null) {
  return parseFoodSearchIntent(searchQuery)?.kind === "food";
}

function buildAreaFocusQuery(areaQuery: string) {
  return areaFocusSuffixPattern.test(areaQuery) ? areaQuery : `${areaQuery}역`;
}

export function mapToNearbyPlaceCandidate(
  candidate: NaverPlaceCandidate,
  location: Pick<UserLocation, "latitude" | "longitude">
): NearbyPlaceCandidate {
  return {
    ...candidate,
    tempId: `candidate-${hashCandidate(candidate)}`,
    distanceMeters: getDistanceMeters(
      location.latitude,
      location.longitude,
      candidate.latitude,
      candidate.longitude
    ),
    source: "naver",
  };
}

export function buildCandidateDetailHref(candidate: NearbyPlaceCandidate) {
  const searchParams = new URLSearchParams({
    name: candidate.name,
    address: candidate.address,
    latitude: String(candidate.latitude),
    longitude: String(candidate.longitude),
    categoryId: candidate.categoryId,
    tagIds: candidate.tagIds.join(","),
  });

  if (candidate.naverPlaceKey) {
    searchParams.set("naverPlaceKey", candidate.naverPlaceKey);
  }

  if (candidate.sourceQuery) {
    searchParams.set("sourceQuery", candidate.sourceQuery);
  }

  if (candidate.sourceCategory) {
    searchParams.set("sourceCategory", candidate.sourceCategory);
  }

  if (candidate.heroImageUrl) {
    searchParams.set("heroImageUrl", candidate.heroImageUrl);
  }

  if (candidate.photoUrls?.length) {
    searchParams.set("photoUrls", JSON.stringify(candidate.photoUrls));
  }

  return `/places/new?${searchParams.toString()}`;
}

export function parseCandidateSearchParams(
  searchParams: URLSearchParams
): NaverPlaceCandidate | null {
  const name = searchParams.get("name")?.trim();
  const address = searchParams.get("address")?.trim();
  const latitude = Number(searchParams.get("latitude"));
  const longitude = Number(searchParams.get("longitude"));
  const categoryId = parseCategoryId(searchParams.get("categoryId"));

  if (!name || !address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    name,
    address,
    latitude,
    longitude,
    categoryId,
    tagIds: parseTagIds(searchParams.get("tagIds")),
    naverPlaceKey: searchParams.get("naverPlaceKey")?.trim() || undefined,
    sourceQuery: searchParams.get("sourceQuery")?.trim() || undefined,
    sourceCategory: searchParams.get("sourceCategory")?.trim() || undefined,
    heroImageUrl: searchParams.get("heroImageUrl")?.trim() || undefined,
    photoUrls: parsePhotoUrls(searchParams.get("photoUrls")),
  };
}

export function parseNearbyCategories(value: string | null): NearbyPlaceCategory[] {
  const categories = (value?.split(",") ?? ["food", "cafe", "drink"]).filter(
    (category): category is NearbyPlaceCategory =>
      category === "food" || category === "cafe" || category === "drink"
  );

  return categories.length ? Array.from(new Set(categories)) : ["food", "cafe", "drink"];
}

function parseCategoryId(value: string | null): CategoryId {
  return value && candidateCategoryIds.has(value as CategoryId) ? (value as CategoryId) : "local";
}

function parseTagIds(value: string | null): TagId[] {
  return (value ?? "")
    .split(",")
    .map((tagId) => tagId.trim())
    .filter(Boolean) as TagId[];
}

function getNearbyCategoryLabels(category: NearbyPlaceCategory) {
  if (category === "food") {
    return ["음식점", nearbyCategoryLabels.food];
  }

  return [nearbyCategoryLabels[category]];
}

function buildSearchTextQueries(searchQuery: string, categories: NearbyPlaceCategory[]) {
  const queries = new Set<string>();
  const hasFoodIntent = hasFoodSearchTerm(searchQuery);

  if (hasFoodIntent) {
    queries.add(searchQuery);

    if (searchQuery.includes("음식점")) {
      queries.add(searchQuery.replace(/음식점/g, "맛집"));
    } else if (!searchQuery.includes("맛집")) {
      queries.add(`${searchQuery} 맛집`);
    }

    return Array.from(queries);
  }

  categories.forEach((category) => {
    getNearbyCategoryLabels(category).forEach((label) => {
      if (!searchQuery.includes(label)) {
        queries.add(`${searchQuery} ${label}`);
      }
    });
  });

  return Array.from(queries);
}

function parsePhotoUrls(value: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return undefined;
    }

    const urls = parsed.filter((item): item is string => typeof item === "string" && Boolean(item));

    return urls.length ? urls : undefined;
  } catch {
    const urls = value
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean);

    return urls.length ? urls : undefined;
  }
}

function hashCandidate(
  candidate: Pick<NaverPlaceCandidate, "name" | "address" | "latitude" | "longitude">
) {
  const value = `${candidate.name}:${candidate.address}:${candidate.latitude}:${candidate.longitude}`;
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

function normalizeAreaQuery(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

function hasFoodSearchTerm(searchQuery: string) {
  const compactSearchQuery = compactAreaQuery(searchQuery);

  return foodSearchTerms.some((foodTerm) =>
    compactSearchQuery.includes(compactAreaQuery(foodTerm))
  );
}

function compactAreaQuery(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function getOriginalPrefixByCompactLength(value: string, compactLength: number) {
  let visibleCharacters = 0;
  let endIndex = 0;

  for (const [index, character] of Array.from(value).entries()) {
    if (!/\s/.test(character)) {
      visibleCharacters += 1;
    }

    endIndex = index + character.length;

    if (visibleCharacters === compactLength) {
      break;
    }
  }

  return value.slice(0, endIndex).trim();
}
