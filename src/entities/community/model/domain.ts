export const PLACE_CATEGORIES = [
  { id: "budget", label: "가성비", tone: "bg-emerald-100 text-emerald-900" },
  { id: "solo", label: "혼밥", tone: "bg-sky-100 text-sky-900" },
  { id: "date", label: "데이트", tone: "bg-rose-100 text-rose-900" },
  { id: "family", label: "가족", tone: "bg-amber-100 text-amber-900" },
  { id: "drink", label: "술집", tone: "bg-violet-100 text-violet-900" },
  { id: "cafe", label: "카페", tone: "bg-orange-100 text-orange-900" },
  { id: "local", label: "로컬추천", tone: "bg-lime-100 text-lime-900" },
] as const;

export const PLACE_TAGS = [
  { id: "parking", label: "주차" },
  { id: "waiting", label: "웨이팅" },
  { id: "large", label: "양 많음" },
  { id: "spicy", label: "매운맛" },
  { id: "quiet", label: "조용함" },
  { id: "late", label: "야식" },
  { id: "pet", label: "반려동물" },
  { id: "takeout", label: "포장" },
] as const;

export const PRICE_RANGES = ["1만원 이하", "1만-2만원", "2만-3만원", "3만원 이상"] as const;

export type CategoryId = (typeof PLACE_CATEGORIES)[number]["id"];
export type TagId = (typeof PLACE_TAGS)[number]["id"];
export type PriceRange = (typeof PRICE_RANGES)[number];
export type ContentStatus = "public" | "hidden" | "deleted";
export type RevisitIntent = "yes" | "maybe" | "no";

export type PlaceDraft = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  categoryId: CategoryId;
  tagIds: string[];
  ownerAnonymousId: string;
  heroImageUrl?: string;
};

export type Place = PlaceDraft & {
  id: string;
  status: ContentStatus;
  createdAt?: string;
  reviewCount?: number;
  averageRevisitScore?: number;
};

export type Review = {
  id: string;
  placeId: string;
  nickname: string;
  priceRange: PriceRange;
  recommendedMenu: string;
  goodPoint: string;
  badPoint: string;
  revisitIntent: RevisitIntent;
  ownerAnonymousId: string;
  status: ContentStatus;
  imageUrl?: string;
  createdAt?: string;
};

const nicknameAdjectives = ["든든한", "솔직한", "부지런한", "따뜻한", "매콤한", "야무진", "담백한"];

const nicknameNouns = [
  "김치탐험가",
  "국밥친구",
  "면발수호자",
  "반찬연구원",
  "불판기록자",
  "디저트산책러",
];

export function makeAnonymousNickname(seed = Date.now()) {
  const safeSeed = Math.abs(Math.floor(seed));
  const adjective = nicknameAdjectives[safeSeed % nicknameAdjectives.length];
  const noun = nicknameNouns[safeSeed % nicknameNouns.length];

  return `${adjective} ${noun}`;
}

export function normalizePlaceDraft(draft: PlaceDraft): Omit<Place, "id"> {
  const name = draft.name.trim();
  const address = draft.address.trim();

  if (!name) {
    throw new Error("가게명을 입력해주세요.");
  }

  if (!address) {
    throw new Error("주소를 입력해주세요.");
  }

  if (!Number.isFinite(draft.latitude) || !Number.isFinite(draft.longitude)) {
    throw new Error("지도 좌표를 확인해주세요.");
  }

  return {
    ...draft,
    name,
    address,
    tagIds: Array.from(new Set(draft.tagIds)),
    ownerAnonymousId: draft.ownerAnonymousId.trim(),
    status: "public",
  };
}

export function findDuplicatePlaces(
  draft: Pick<PlaceDraft, "name" | "address" | "latitude" | "longitude">,
  places: Place[]
) {
  const draftName = compactText(draft.name);
  const draftAddress = normalizeAddress(draft.address);

  return places.filter((place) => {
    if (place.status !== "public") {
      return false;
    }

    const sameAddress = normalizeAddress(place.address) === draftAddress;
    const nearby =
      distanceInMeters(draft.latitude, draft.longitude, place.latitude, place.longitude) <= 80;
    const similarName =
      compactText(place.name).includes(draftName) || draftName.includes(compactText(place.name));

    return sameAddress || (nearby && similarName);
  });
}

export function getVisiblePlaces<T extends { status: ContentStatus }>(places: T[]) {
  return places.filter((place) => place.status === "public");
}

export function canMutateContent(
  activeAnonymousId: string | null | undefined,
  content: { ownerAnonymousId: string }
) {
  return Boolean(activeAnonymousId) && activeAnonymousId === content.ownerAnonymousId;
}

function compactText(value: string) {
  return value.replace(/\s/g, "").toLowerCase();
}

function normalizeAddress(value: string) {
  return compactText(value.replace(/[.,]/g, ""));
}

function distanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadius = 6_371_000;
  const latDelta = toRadians(lat2 - lat1);
  const lonDelta = toRadians(lon2 - lon1);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lonDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
