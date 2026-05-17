import { NextResponse } from "next/server";
import {
  buildNaverPlaceImageQuery,
  buildNaverLocalSearchQueries,
  dedupeNaverPlaceCandidates,
  getCoordinatesFromNaverLocalItem,
  getNaverImageThumbnail,
  getNaverLocalSearchCredentials,
  isNaverRateLimitMessage,
  mapNaverLocalItemToPlaceCandidate,
  sanitizeNaverText,
  type NaverImageSearchItem,
  type NaverLocalSearchCredentials,
  type NaverLocalSearchItem,
  type NaverPlaceCandidate,
} from "@/features/naver-place-import";

export const dynamic = "force-dynamic";

type NaverLocalSearchResponse = {
  items?: NaverLocalSearchItem[];
  errorMessage?: string;
};

type NaverImageSearchResponse = {
  items?: NaverImageSearchItem[];
  errorMessage?: string;
};

type NaverGeocodeResponse = {
  status: string;
  addresses?: Array<{
    roadAddress?: string;
    jibunAddress?: string;
    x: string;
    y: string;
  }>;
  errorMessage?: string;
};

const MAX_IMPORT_LIMIT = 100;
const NAVER_LOCAL_DISPLAY_LIMIT = 5;
const NAVER_IMAGE_DISPLAY_LIMIT = 1;
const NAVER_LOCAL_REQUEST_DELAY_MS = 180;

export async function GET(request: Request) {
  return handleNaverPlacesRequest(request, new URL(request.url).searchParams);
}

export async function POST(request: Request) {
  const body = await readPostmanJsonBody(request);

  if (!body) {
    return NextResponse.json({ error: "JSON body가 올바르지 않습니다." }, { status: 400 });
  }

  return handleNaverPlacesRequest(request, buildNaverPlacesPostSearchParams(body));
}

async function handleNaverPlacesRequest(request: Request, searchParams: URLSearchParams) {
  const requestedLimit = Number(searchParams.get("limit") ?? "60");
  const limit = clamp(Number.isFinite(requestedLimit) ? requestedLimit : 60, 1, MAX_IMPORT_LIMIT);
  const singleQuery = searchParams.get("query")?.trim();

  if (!isNaverPlaceImportAuthorized(request)) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const searchCredentials = getNaverLocalSearchCredentials(process.env);
  const geocodeCredentials = getNaverGeocodeCredentials();

  if (!searchCredentials) {
    return NextResponse.json(
      {
        error:
          "네이버 지역 검색 API 키가 필요합니다. NAVER_SEARCH_CLIENT_ID와 NAVER_SEARCH_CLIENT_SECRET을 설정해주세요.",
      },
      { status: 501 }
    );
  }

  const queries = singleQuery ? [singleQuery] : buildNaverLocalSearchQueries();
  const candidates: NaverPlaceCandidate[] = [];

  try {
    for (const query of queries) {
      if (dedupeNaverPlaceCandidates(candidates).length >= limit) {
        break;
      }

      const candidatesForQuery = await searchNaverPlaces(
        query,
        searchCredentials,
        geocodeCredentials
      );
      const mapped = await Promise.all(
        candidatesForQuery.map(async (candidate) => {
          const heroImageUrl = await searchNaverPlaceThumbnail(candidate, searchCredentials);

          return heroImageUrl ? { ...candidate, heroImageUrl } : candidate;
        })
      );

      candidates.push(
        ...mapped.filter((candidate): candidate is NaverPlaceCandidate => Boolean(candidate))
      );

      if (dedupeNaverPlaceCandidates(candidates).length >= limit) {
        break;
      }

      await delay(NAVER_LOCAL_REQUEST_DELAY_MS);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "네이버 지역 검색 요청에 실패했습니다.";

    if (isNaverRateLimitMessage(errorMessage) && candidates.length) {
      const places = dedupeNaverPlaceCandidates(candidates).slice(0, limit);

      return NextResponse.json({
        source: "naver-local-search",
        count: places.length,
        warning: "네이버 속도 제한으로 일부 결과만 가져왔습니다.",
        places,
      });
    }

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 502 }
    );
  }

  const places = dedupeNaverPlaceCandidates(candidates).slice(0, limit);

  return NextResponse.json({
    source: "naver-local-search",
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

function buildNaverPlacesPostSearchParams(body: Record<string, unknown>) {
  const searchParams = new URLSearchParams();

  setSearchParam(searchParams, "query", body.query);
  setSearchParam(searchParams, "limit", body.limit);

  return searchParams;
}

function mapLocalItemToCandidate(item: NaverLocalSearchItem, query: string) {
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

async function searchNaverPlaces(
  query: string,
  credentials: NaverLocalSearchCredentials,
  geocodeCredentials: { keyId: string; secret: string } | null
) {
  return searchNaverLocalPlaces(query, credentials, geocodeCredentials);
}

async function searchNaverLocalPlaces(
  query: string,
  credentials: NaverLocalSearchCredentials,
  geocodeCredentials: { keyId: string; secret: string } | null
) {
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

  const mapped = await Promise.all(
    (body.items ?? []).map(async (item) => {
      const localCandidate = mapLocalItemToCandidate(item, query);

      if (localCandidate) {
        return localCandidate;
      }

      const address = sanitizeNaverText(item.roadAddress || item.address);
      const coordinates =
        address && geocodeCredentials ? await geocodeAddress(address, geocodeCredentials) : null;

      return coordinates ? mapNaverLocalItemToPlaceCandidate(item, query, coordinates) : null;
    })
  );

  return mapped.filter((candidate): candidate is NaverPlaceCandidate => Boolean(candidate));
}

async function searchNaverPlaceThumbnail(
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
      return undefined;
    }

    const body = (await response.json()) as NaverImageSearchResponse;

    return getNaverImageThumbnail(body.items ?? []);
  } catch {
    return undefined;
  }
}

async function geocodeAddress(address: string, credentials: { keyId: string; secret: string }) {
  const response = await fetch(
    `https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(
      address
    )}`,
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

  const body = (await response.json()) as NaverGeocodeResponse;
  const first = body.addresses?.[0];

  if (body.status !== "OK" || !first) {
    return null;
  }

  return {
    latitude: Number(first.y),
    longitude: Number(first.x),
  };
}

function getNaverGeocodeCredentials() {
  const keyId = process.env.NAVER_MAP_CLIENT_ID ?? process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const secret = process.env.NAVER_MAP_CLIENT_SECRET;

  if (!keyId || !secret) {
    return null;
  }

  return { keyId, secret };
}

function isNaverPlaceImportAuthorized(request: Request) {
  const adminToken = process.env.NAVER_IMPORT_ADMIN_TOKEN;

  return Boolean(adminToken && request.headers.get("x-matzip-admin-token") === adminToken);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function setSearchParam(searchParams: URLSearchParams, key: string, value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed) {
      searchParams.set(key, trimmed);
    }

    return;
  }

  if (typeof value === "number") {
    searchParams.set(key, String(value));
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
