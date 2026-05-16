import type { CategoryId } from "@/entities/community";

export type NaverLocalSearchCredentials = {
  clientId: string;
  clientSecret: string;
};

export type NaverLocalSearchItem = {
  title: string;
  category: string;
  address: string;
  roadAddress: string;
  mapx?: string;
  mapy?: string;
};

export type NaverPlaceCandidate = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  categoryId: CategoryId;
  tagIds: string[];
  sourceCategory?: string;
  sourceQuery?: string;
};

const NAVER_LOCAL_SEARCH_QUERIES = [
  "서울 맛집",
  "강남 맛집",
  "홍대 맛집",
  "성수 맛집",
  "을지로 맛집",
  "종로 맛집",
  "마포 맛집",
  "이태원 맛집",
  "부산 맛집",
  "해운대 맛집",
  "대구 맛집",
  "대전 맛집",
  "광주 맛집",
  "전주 맛집",
  "제주 맛집",
  "인천 맛집",
  "수원 맛집",
  "춘천 맛집",
  "강릉 맛집",
  "여수 맛집",
  "경주 맛집",
  "서울 카페",
  "부산 카페",
  "홍대 술집",
  "강남 데이트 맛집",
  "서울 혼밥 맛집",
];

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

export function getNaverLocalSearchCredentials(
  env: Record<string, string | undefined>
): NaverLocalSearchCredentials | null {
  const clientId = env.NAVER_SEARCH_CLIENT_ID ?? env.NAVER_LOCAL_SEARCH_CLIENT_ID;
  const clientSecret = env.NAVER_SEARCH_CLIENT_SECRET ?? env.NAVER_LOCAL_SEARCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

export function buildNaverLocalSearchQueries() {
  return NAVER_LOCAL_SEARCH_QUERIES;
}

export function sanitizeNaverText(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|apos);|&#39;/g, (entity) => ENTITY_MAP[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

export function inferPlaceCategory(category: string, query: string): CategoryId {
  const text = `${category} ${query}`;

  if (/카페|커피|디저트|베이커리|빵/.test(text)) {
    return "cafe";
  }

  if (/술집|주점|포차|맥주|와인|바\b|야식/.test(text)) {
    return "drink";
  }

  if (/데이트|양식|이탈리안|파스타|스테이크|오마카세|초밥|스시/.test(text)) {
    return "date";
  }

  if (/가족|한정식|샤브|뷔페|중식|갈비/.test(text)) {
    return "family";
  }

  if (/혼밥|김밥|분식|덮밥|라멘/.test(text)) {
    return "solo";
  }

  if (/국밥|칼국수|백반|냉면|한식|향토|시장|전통/.test(text)) {
    return "local";
  }

  return "local";
}

export function mapNaverLocalItemToPlaceCandidate(
  item: NaverLocalSearchItem,
  sourceQuery: string,
  coordinates: { latitude: number; longitude: number }
): NaverPlaceCandidate {
  const sourceCategory = sanitizeNaverText(item.category);

  return {
    name: sanitizeNaverText(item.title),
    address: sanitizeNaverText(item.roadAddress || item.address),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    categoryId: inferPlaceCategory(sourceCategory, sourceQuery),
    tagIds: inferTags(sourceCategory, sourceQuery),
    sourceCategory,
    sourceQuery,
  };
}

export function getCoordinatesFromNaverLocalItem(item: NaverLocalSearchItem) {
  const longitude = Number(item.mapx) / 10_000_000;
  const latitude = Number(item.mapy) / 10_000_000;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

export function isNaverRateLimitMessage(message: string) {
  return /rate limit|속도 제한/i.test(message);
}

export function dedupeNaverPlaceCandidates(candidates: NaverPlaceCandidate[]) {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = `${compactText(candidate.name)}:${normalizeAddress(candidate.address)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function inferTags(category: string, query: string) {
  const text = `${category} ${query}`;
  const tags = new Set<string>();

  if (/주차/.test(text)) {
    tags.add("parking");
  }

  if (/야식|술집|주점|포차/.test(text)) {
    tags.add("late");
  }

  if (/카페|커피|디저트/.test(text)) {
    tags.add("quiet");
  }

  return Array.from(tags);
}

function compactText(value: string) {
  return value.replace(/\s/g, "").toLowerCase();
}

function normalizeAddress(value: string) {
  return compactText(value.replace(/[.,]/g, ""));
}
