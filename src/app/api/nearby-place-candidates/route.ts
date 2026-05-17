import { NextResponse } from "next/server";
import {
  buildNaverPlaceImageQuery,
  buildNearbyPlaceQueries,
  dedupeNaverPlaceCandidates,
  getCoordinatesFromNaverLocalItem,
  getNaverImageThumbnails,
  getNaverLocalSearchCredentials,
  getNearbyQueryArea,
  isFoodOnlySearchQuery,
  mapNaverLocalItemToPlaceCandidate,
  mapToNearbyPlaceCandidate,
  parseNearbyCategories,
  sanitizeNaverText,
  type NaverLocalSearchCredentials,
  type NaverLocalSearchItem,
  type NaverPlaceCandidate,
  type ReverseGeocodeArea,
} from "@/features/naver-place-import";
import type { GeoBounds } from "@/entities/community";

export const dynamic = "force-dynamic";

type NaverLocalSearchResponse = {
  items?: NaverLocalSearchItem[];
  errorMessage?: string;
};

type NaverImageSearchResponse = {
  items?: Array<{
    thumbnail?: string;
  }>;
  errorMessage?: string;
};

type NaverReverseGeocodeResponse = {
  status?: {
    code?: number;
    name?: string;
    message?: string;
  };
  results?: Array<{
    region?: {
      area1?: { name?: string };
      area2?: { name?: string };
      area3?: { name?: string };
      area4?: { name?: string };
    };
  }>;
};

const NAVER_LOCAL_DISPLAY_LIMIT = 100;
const NAVER_IMAGE_DISPLAY_LIMIT = 100;
const MAX_SEARCH_QUERY_LENGTH = 80;

export async function GET(request: Request) {
  return handleNearbyPlaceCandidatesRequest(new URL(request.url).searchParams);
}

export async function POST(request: Request) {
  const body = await readPostmanJsonBody(request);

  if (!body) {
    return NextResponse.json({ error: "JSON body가 올바르지 않습니다." }, { status: 400 });
  }

  return handleNearbyPlaceCandidatesRequest(buildNearbyPostSearchParams(body));
}

async function handleNearbyPlaceCandidatesRequest(searchParams: URLSearchParams) {
  const latitude = Number(searchParams.get("latitude"));
  const longitude = Number(searchParams.get("longitude"));
  const bounds = parseBounds(searchParams);

  if (!isValidCoordinate(latitude, longitude)) {
    return NextResponse.json({ error: "현재 위치 좌표가 필요합니다." }, { status: 400 });
  }

  if (bounds === false) {
    return NextResponse.json({ error: "지도 영역 좌표가 올바르지 않습니다." }, { status: 400 });
  }

  const location = { latitude, longitude };
  const categories = parseNearbyCategories(searchParams.get("categories"));
  const searchQuery = sanitizeSearchQuery(searchParams.get("query"));
  const areaQuery = searchParams.get("areaQuery");
  const includePhotos = shouldIncludePhotos(searchParams);

  const searchCredentials = getNaverLocalSearchCredentials(process.env);

  if (!searchCredentials) {
    return NextResponse.json(
      {
        error:
          "네이버 지역 검색 API 키가 필요합니다. NAVER_SEARCH_CLIENT_ID와 NAVER_SEARCH_CLIENT_SECRET을 설정해주세요.",
      },
      { status: 501 }
    );
  }

  const shouldResolveArea = !areaQuery && (!searchQuery || isFoodOnlySearchQuery(searchQuery));
  const resolvedReverseGeocodeArea = shouldResolveArea
    ? await reverseGeocodeArea(location, getNaverReverseGeocodeCredentials())
    : null;
  const queryArea = getNearbyQueryArea(resolvedReverseGeocodeArea, areaQuery);
  const queries = buildNearbyPlaceQueries(
    resolvedReverseGeocodeArea,
    categories,
    areaQuery,
    searchQuery
  );
  const candidates: NaverPlaceCandidate[] = [];

  if (!queries.length) {
    return NextResponse.json({
      source: "naver-local-search",
      queryArea: null,
      count: 0,
      places: [],
    });
  }

  try {
    for (const query of queries) {
      const candidatesForQuery = await searchNaverPlaces(query, searchCredentials);
      const mapped: Array<NaverPlaceCandidate | null> = await Promise.all(
        candidatesForQuery.map(async (candidate) => {
          if (bounds && !isPointInBounds(candidate, bounds)) {
            return null;
          }

          const photoUrls = includePhotos
            ? await searchNaverPlacePhotos(candidate, searchCredentials)
            : (candidate.photoUrls ?? []);

          return {
            ...candidate,
            heroImageUrl: photoUrls[0] ?? candidate.heroImageUrl,
            photoUrls,
          } satisfies NaverPlaceCandidate;
        })
      );

      candidates.push(
        ...mapped.filter((candidate): candidate is NaverPlaceCandidate => Boolean(candidate))
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "네이버 지역 검색 요청에 실패했습니다.",
      },
      { status: 502 }
    );
  }

  const places = dedupeNaverPlaceCandidates(candidates)
    .map((candidate) => mapToNearbyPlaceCandidate(candidate, location))
    .sort((first, second) => first.distanceMeters - second.distanceMeters);

  return NextResponse.json({
    source: "naver-local-search",
    queryArea,
    count: places.length,
    places,
  });
}

async function readPostmanJsonBody(request: Request) {
  try {
    const body = (await request.json()) as unknown;

    return isJsonObject(body) ? body : null;
  } catch {
    return null;
  }
}

function buildNearbyPostSearchParams(body: Record<string, unknown>) {
  const searchParams = new URLSearchParams();
  const bounds = isJsonObject(body.bounds) ? body.bounds : body;

  setSearchParam(searchParams, "latitude", body.latitude);
  setSearchParam(searchParams, "longitude", body.longitude);
  setSearchParam(searchParams, "south", bounds.south);
  setSearchParam(searchParams, "north", bounds.north);
  setSearchParam(searchParams, "west", bounds.west);
  setSearchParam(searchParams, "east", bounds.east);
  setSearchParam(searchParams, "query", body.query);
  setSearchParam(searchParams, "areaQuery", body.areaQuery);
  setSearchParam(searchParams, "includePhotos", body.includePhotos);

  if (Array.isArray(body.categories)) {
    searchParams.set("categories", body.categories.filter(isNonEmptyString).join(","));
  } else {
    setSearchParam(searchParams, "categories", body.categories);
  }

  return searchParams;
}

function mapLocalItem(item: NaverLocalSearchItem, query: string) {
  const address = sanitizeNaverText(item.roadAddress || item.address);

  if (!address) {
    return null;
  }

  const coordinates = getCoordinatesFromNaverLocalItem(item);

  if (!coordinates) {
    return null;
  }

  return mapNaverLocalItemToPlaceCandidate(item, query, coordinates);
}

async function searchNaverPlaces(query: string, credentials: NaverLocalSearchCredentials) {
  const items = await searchNaverLocalPlaces(query, credentials);

  return items
    .map((item) => mapLocalItem(item, query))
    .filter((candidate): candidate is NaverPlaceCandidate => Boolean(candidate));
}

async function searchNaverLocalPlaces(query: string, credentials: NaverLocalSearchCredentials) {
  const response = await fetch(
    `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(
      query
    )}&display=${NAVER_LOCAL_DISPLAY_LIMIT}&sort=comment`,
    {
      headers: {
        "X-Naver-Client-Id": credentials.clientId,
        "X-Naver-Client-Secret": credentials.clientSecret,
      },
      cache: "no-store",
    }
  );

  const body = (await response.json()) as NaverLocalSearchResponse;

  if (!response.ok) {
    throw new Error(body.errorMessage ?? "네이버 지역 검색 요청에 실패했습니다.");
  }

  return body.items ?? [];
}

async function searchNaverPlacePhotos(
  candidate: NaverPlaceCandidate,
  credentials: NaverLocalSearchCredentials
) {
  try {
    const response = await fetch(
      `https://openapi.naver.com/v1/search/image?query=${encodeURIComponent(
        buildNaverPlaceImageQuery(candidate)
      )}&display=${NAVER_IMAGE_DISPLAY_LIMIT}&sort=sim&filter=medium`,
      {
        headers: {
          "X-Naver-Client-Id": credentials.clientId,
          "X-Naver-Client-Secret": credentials.clientSecret,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as NaverImageSearchResponse;

    return getNaverImageThumbnails(body.items ?? []);
  } catch {
    return [];
  }
}

async function reverseGeocodeArea(
  location: { latitude: number; longitude: number },
  credentials: { keyId: string; secret: string } | null
): Promise<ReverseGeocodeArea | null> {
  if (!credentials) {
    return null;
  }

  try {
    const response = await fetch(
      `https://naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc?coords=${encodeURIComponent(
        `${location.longitude},${location.latitude}`
      )}&orders=addr,roadaddr&output=json`,
      {
        headers: {
          Accept: "application/json",
          "x-ncp-apigw-api-key-id": credentials.keyId,
          "x-ncp-apigw-api-key": credentials.secret,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as NaverReverseGeocodeResponse;
    const region = body.results?.[0]?.region;

    if (body.status?.code !== 0 || !region) {
      return null;
    }

    return {
      area1: region.area1?.name,
      area2: region.area2?.name,
      area3: region.area3?.name || region.area4?.name,
    };
  } catch {
    return null;
  }
}

function isValidCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

function getNaverReverseGeocodeCredentials() {
  const keyId = process.env.NAVER_MAP_CLIENT_ID ?? process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const secret = process.env.NAVER_MAP_CLIENT_SECRET;

  if (!keyId || !secret) {
    return null;
  }

  return { keyId, secret };
}

function parseBounds(searchParams: URLSearchParams): GeoBounds | null | false {
  const rawBounds = {
    south: searchParams.get("south"),
    north: searchParams.get("north"),
    west: searchParams.get("west"),
    east: searchParams.get("east"),
  };

  if (!rawBounds.south && !rawBounds.north && !rawBounds.west && !rawBounds.east) {
    return null;
  }

  const bounds = {
    south: Number(rawBounds.south),
    north: Number(rawBounds.north),
    west: Number(rawBounds.west),
    east: Number(rawBounds.east),
  };

  if (
    !Number.isFinite(bounds.south) ||
    !Number.isFinite(bounds.north) ||
    !Number.isFinite(bounds.west) ||
    !Number.isFinite(bounds.east) ||
    bounds.south >= bounds.north ||
    bounds.west >= bounds.east
  ) {
    return false;
  }

  return bounds;
}

function isPointInBounds(
  point: Pick<NaverPlaceCandidate, "latitude" | "longitude">,
  bounds: GeoBounds
) {
  return (
    point.latitude >= bounds.south &&
    point.latitude <= bounds.north &&
    point.longitude >= bounds.west &&
    point.longitude <= bounds.east
  );
}

function sanitizeSearchQuery(value: string | null) {
  const query = value?.replace(/\s+/g, " ").trim();

  if (!query) {
    return null;
  }

  return query.slice(0, MAX_SEARCH_QUERY_LENGTH);
}

function shouldIncludePhotos(searchParams: URLSearchParams) {
  const value = searchParams.get("includePhotos")?.trim().toLowerCase();

  return value === "1" || value === "true";
}

function setSearchParam(searchParams: URLSearchParams, key: string, value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed) {
      searchParams.set(key, trimmed);
    }

    return;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    searchParams.set(key, String(value));
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}
