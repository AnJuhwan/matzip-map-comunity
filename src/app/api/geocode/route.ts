import { NextResponse } from "next/server";
import {
  getCoordinatesFromNaverLocalItem,
  getNaverLocalSearchCredentials,
  sanitizeNaverText,
  type NaverLocalSearchCredentials,
  type NaverLocalSearchItem,
} from "@/features/naver-place-import";

export const dynamic = "force-dynamic";

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

type NaverLocalSearchResponse = {
  items?: NaverLocalSearchItem[];
  errorMessage?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim();

  if (!query) {
    return NextResponse.json({ error: "검색할 주소를 입력해주세요." }, { status: 400 });
  }

  const keyId = process.env.NAVER_MAP_CLIENT_ID ?? process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const secret = process.env.NAVER_MAP_CLIENT_SECRET;
  const searchCredentials = getNaverLocalSearchCredentials(process.env);

  if (!keyId || !secret) {
    const localSearchResult = await geocodeFromNaverLocalSearch(query, searchCredentials);

    if (localSearchResult) {
      return NextResponse.json(localSearchResult);
    }

    return NextResponse.json({
      ...fallbackCoordinate(query),
      source: "fallback",
    });
  }

  let response: Response;

  try {
    response = await fetch(
      `https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(
        query
      )}`,
      {
        headers: {
          Accept: "application/json",
          "x-ncp-apigw-api-key-id": keyId,
          "x-ncp-apigw-api-key": secret,
        },
        cache: "no-store",
      }
    );
  } catch {
    const localSearchResult = await geocodeFromNaverLocalSearch(query, searchCredentials);

    if (localSearchResult) {
      return NextResponse.json(localSearchResult);
    }

    return NextResponse.json({ error: "네이버 지오코딩 요청에 실패했습니다." }, { status: 502 });
  }

  if (!response.ok) {
    const localSearchResult = await geocodeFromNaverLocalSearch(query, searchCredentials);

    if (localSearchResult) {
      return NextResponse.json(localSearchResult);
    }

    return NextResponse.json(
      { error: "네이버 지오코딩 요청에 실패했습니다." },
      { status: response.status }
    );
  }

  let body: NaverGeocodeResponse;

  try {
    body = (await response.json()) as NaverGeocodeResponse;
  } catch {
    return NextResponse.json(
      { error: "네이버 지오코딩 응답을 해석하지 못했습니다." },
      { status: 502 }
    );
  }
  const first = body.addresses?.[0];

  if (body.status !== "OK" || !first) {
    const localSearchResult = await geocodeFromNaverLocalSearch(query, searchCredentials);

    if (localSearchResult) {
      return NextResponse.json(localSearchResult);
    }

    return NextResponse.json(
      { error: body.errorMessage ?? "주소 검색 결과가 없습니다." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    address: first.roadAddress || first.jibunAddress || query,
    latitude: Number(first.y),
    longitude: Number(first.x),
    source: "naver",
  });
}

async function geocodeFromNaverLocalSearch(
  query: string,
  credentials: NaverLocalSearchCredentials | null
) {
  if (!credentials) {
    return null;
  }

  try {
    const response = await fetch(
      `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(
        query
      )}&display=1&sort=random`,
      {
        headers: {
          "X-Naver-Client-Id": credentials.clientId,
          "X-Naver-Client-Secret": credentials.clientSecret,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as NaverLocalSearchResponse;
    const first = body.items?.[0];

    if (!first) {
      return null;
    }

    const coordinates = getCoordinatesFromNaverLocalItem(first);

    if (!coordinates) {
      return null;
    }

    return {
      address: sanitizeNaverText(first.roadAddress || first.address || first.title || query),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      source: "naver-local-search",
    };
  } catch {
    return null;
  }
}

function fallbackCoordinate(query: string) {
  const anchors = [
    { latitude: 37.5665, longitude: 126.978, address: "서울특별시" },
    { latitude: 35.1796, longitude: 129.0756, address: "부산광역시" },
    { latitude: 35.8714, longitude: 128.6014, address: "대구광역시" },
    { latitude: 36.3504, longitude: 127.3845, address: "대전광역시" },
    { latitude: 35.1595, longitude: 126.8526, address: "광주광역시" },
    { latitude: 33.4996, longitude: 126.5312, address: "제주특별자치도" },
  ];
  const seed = query.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const anchor = anchors[seed % anchors.length];
  const offset = (seed % 37) / 10_000;

  return {
    address: query || anchor.address,
    latitude: Number((anchor.latitude + offset).toFixed(6)),
    longitude: Number((anchor.longitude + offset).toFixed(6)),
  };
}
