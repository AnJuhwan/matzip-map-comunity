import { NextResponse } from "next/server";

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim();

  if (!query) {
    return NextResponse.json({ error: "검색할 주소를 입력해주세요." }, { status: 400 });
  }

  const keyId = process.env.NAVER_MAP_CLIENT_ID ?? process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const secret = process.env.NAVER_MAP_CLIENT_SECRET;

  if (!keyId || !secret) {
    return NextResponse.json({
      ...fallbackCoordinate(query),
      source: "fallback",
    });
  }

  const response = await fetch(
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

  if (!response.ok) {
    return NextResponse.json(
      { error: "네이버 지오코딩 요청에 실패했습니다." },
      { status: response.status }
    );
  }

  const body = (await response.json()) as NaverGeocodeResponse;
  const first = body.addresses?.[0];

  if (body.status !== "OK" || !first) {
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
