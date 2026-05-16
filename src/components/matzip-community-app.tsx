"use client";

import {
  AlertTriangle,
  Download,
  Flag,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Utensils,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PLACE_CATEGORIES,
  PLACE_TAGS,
  type CategoryId,
  type Place,
  type PlaceDraft,
  type Review,
  canMutateContent,
  findDuplicatePlaces,
  getVisiblePlaces,
  makeAnonymousNickname,
} from "@/lib/domain";
import type { NaverPlaceCandidate } from "@/lib/naver-local-search";
import {
  type AnonymousProfile,
  attachPlaceStats,
  ensureAnonymousProfile,
  isSupabaseConfigured,
  loadCommunityData,
  reportContent,
  savePlace,
  saveReview,
  softDeleteContent,
  updateNickname,
} from "@/lib/community-store";
import { NaverMap } from "./naver-map";
import { PlaceForm } from "./place-form";
import { ReviewForm } from "./review-form";

type PanelMode = "browse" | "new-place" | "edit-place";

const categoryMap = new Map<string, (typeof PLACE_CATEGORIES)[number]>(
  PLACE_CATEGORIES.map((item) => [item.id, item])
);
const tagMap = new Map<string, (typeof PLACE_TAGS)[number]>(
  PLACE_TAGS.map((item) => [item.id, item])
);

export function MatzipCommunityApp() {
  const [profile, setProfile] = useState<AnonymousProfile | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>();
  const [panelMode, setPanelMode] = useState<PanelMode>("browse");
  const [activeCategoryId, setActiveCategoryId] = useState<CategoryId | "all">("all");
  const [query, setQuery] = useState("");
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isImportingPlaces, setIsImportingPlaces] = useState(false);
  const [message, setMessage] = useState("");

  const refreshData = useCallback(async () => {
    const data = await loadCommunityData();
    setReviews(data.reviews);
    setPlaces(data.places);
    setSelectedPlaceId((current) => current ?? data.places[0]?.id);
  }, []);

  useEffect(() => {
    let ignore = false;

    async function boot() {
      setIsBooting(true);
      setMessage("");

      try {
        const nextProfile = await ensureAnonymousProfile();
        const data = await loadCommunityData();

        if (ignore) {
          return;
        }

        setProfile(nextProfile);
        setNicknameDraft(nextProfile.nickname);
        setReviews(data.reviews);
        setPlaces(data.places);
        setSelectedPlaceId(data.places[0]?.id);
      } catch (error) {
        if (!ignore) {
          setMessage(error instanceof Error ? error.message : "초기화 실패");
        }
      } finally {
        if (!ignore) {
          setIsBooting(false);
        }
      }
    }

    boot();

    return () => {
      ignore = true;
    };
  }, []);

  const visibleReviews = useMemo(
    () => reviews.filter((review) => review.status === "public"),
    [reviews]
  );
  const visiblePlaces = useMemo(
    () => getVisiblePlaces(places).map((place) => attachPlaceStats(place, visibleReviews)),
    [places, visibleReviews]
  );
  const filteredPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return visiblePlaces.filter((place) => {
      const categoryMatch = activeCategoryId === "all" || place.categoryId === activeCategoryId;
      const queryMatch =
        !normalizedQuery ||
        `${place.name} ${place.address} ${place.tagIds.join(" ")}`
          .toLowerCase()
          .includes(normalizedQuery);

      return categoryMatch && queryMatch;
    });
  }, [activeCategoryId, query, visiblePlaces]);
  const selectedPlace =
    visiblePlaces.find((place) => place.id === selectedPlaceId) ??
    filteredPlaces[0] ??
    visiblePlaces[0];
  const selectedReviews = visibleReviews.filter((review) => review.placeId === selectedPlace?.id);

  async function handleImportNaverPlaces() {
    if (!profile) {
      return;
    }

    setIsImportingPlaces(true);
    setMessage("");

    try {
      const response = await fetch("/api/naver-places?limit=60");
      const body = (await response.json()) as {
        places?: NaverPlaceCandidate[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "네이버 지역 검색 데이터를 가져오지 못했습니다.");
      }

      const importedPlaces: Place[] = [];
      let duplicateCount = 0;

      for (const candidate of body.places ?? []) {
        const draft: PlaceDraft = {
          name: candidate.name,
          address: candidate.address,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          categoryId: candidate.categoryId,
          tagIds: candidate.tagIds,
          ownerAnonymousId: profile.id,
        };
        const duplicatePool = [...visiblePlaces, ...importedPlaces];

        if (findDuplicatePlaces(draft, duplicatePool).length) {
          duplicateCount += 1;
          continue;
        }

        const saved = await savePlace({
          draft,
          activeAnonymousId: profile.id,
        });
        importedPlaces.push(saved);
      }

      await refreshData();
      setMessage(
        `네이버 지역 검색에서 ${importedPlaces.length}곳을 가져왔습니다${
          duplicateCount ? ` (${duplicateCount}곳 중복 제외)` : ""
        }.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "네이버 데이터 가져오기 실패");
    } finally {
      setIsImportingPlaces(false);
    }
  }

  async function handleNicknameSave() {
    if (!profile) {
      return;
    }

    try {
      const nextProfile = await updateNickname(profile, nicknameDraft);
      setProfile(nextProfile);
      setNicknameDraft(nextProfile.nickname);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "닉네임 저장 실패");
    }
  }

  function handleNicknameRandomize() {
    setNicknameDraft(makeAnonymousNickname(Date.now()));
  }

  async function handleSavePlace(input: {
    id?: string;
    draft: PlaceDraft;
    imageFile?: File | null;
  }) {
    if (!profile) {
      return;
    }

    const saved = await savePlace({
      ...input,
      activeAnonymousId: profile.id,
    });

    setPlaces((current) =>
      input.id
        ? current.map((place) => (place.id === input.id ? saved : place))
        : [saved, ...current]
    );
    setSelectedPlaceId(saved.id);
    setPanelMode("browse");
    await refreshData();
  }

  async function handleSaveReview(input: {
    id?: string;
    review: Omit<Review, "id" | "status" | "createdAt">;
    imageFile?: File | null;
  }) {
    if (!profile) {
      return;
    }

    const saved = await saveReview({
      ...input,
      activeAnonymousId: profile.id,
    });

    setReviews((current) =>
      input.id
        ? current.map((review) => (review.id === input.id ? saved : review))
        : [saved, ...current]
    );
    setEditingReview(null);
    await refreshData();
  }

  async function handleDelete(type: "place" | "review", id: string) {
    if (!profile) {
      return;
    }

    const confirmed = window.confirm("삭제하면 공개 목록에서 사라집니다.");
    if (!confirmed) {
      return;
    }

    await softDeleteContent({
      type,
      id,
      activeAnonymousId: profile.id,
    });

    if (type === "place") {
      setPlaces((current) =>
        current.map((place) => (place.id === id ? { ...place, status: "deleted" } : place))
      );
      setSelectedPlaceId((current) => (current === id ? undefined : current));
    } else {
      setReviews((current) =>
        current.map((review) => (review.id === id ? { ...review, status: "deleted" } : review))
      );
    }

    await refreshData();
  }

  async function handleReport(targetType: "place" | "review", targetId: string) {
    if (!profile) {
      return;
    }

    try {
      await reportContent({
        targetType,
        targetId,
        reporterAnonymousId: profile.id,
        reason: "부적절하거나 정확하지 않은 내용",
      });
      window.alert("신고가 접수되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "신고 실패");
    }
  }

  if (isBooting) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6faf7] text-[#17352b]">
        <div className="flex items-center gap-3 rounded-md bg-white px-5 py-4 font-black shadow-sm">
          <RefreshCw size={20} className="animate-spin" />
          맛집 지도를 준비 중
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6faf7] p-6 text-[#17352b]">
        <div className="max-w-md rounded-md border border-[#f0c6be] bg-white p-5 shadow-sm">
          <AlertTriangle className="mb-3 text-[#e85d4f]" />
          <h1 className="text-xl font-black">앱을 시작하지 못했습니다</h1>
          <p className="mt-2 text-sm text-[#5f6f68]">{message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6faf7] text-[#17352b]">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_520px]">
        <NaverMap
          places={filteredPlaces.length ? filteredPlaces : visiblePlaces}
          selectedPlaceId={selectedPlace?.id}
          onSelectPlace={(placeId) => {
            setSelectedPlaceId(placeId);
            setPanelMode("browse");
          }}
        />

        <aside className="flex max-h-none flex-col border-l border-[#d9e4dd] bg-[#fbfdfb] lg:max-h-screen">
          <header className="border-b border-[#d9e4dd] px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0f7a5f]">
                  전국 맛집 지도
                </p>
                <h1 className="mt-1 text-2xl font-black">맛잘알 동네지도</h1>
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={handleImportNaverPlaces}
                  disabled={isImportingPlaces}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-[#d9e4dd] bg-white px-3 text-sm font-black text-[#17352b] transition hover:border-[#0f7a5f] disabled:cursor-not-allowed disabled:text-[#8a9a92] sm:flex-none"
                >
                  <Download size={17} />
                  {isImportingPlaces ? "가져오는 중" : "가져오기"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPanelMode("new-place");
                    setEditingReview(null);
                  }}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#e85d4f] px-4 text-sm font-black text-white transition hover:bg-[#c94539] sm:flex-none"
                >
                  <Plus size={18} />
                  등록
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-md border border-[#d9e4dd] bg-white px-3">
              <Search size={18} className="text-[#70847b]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="가게명, 주소, 태그 검색"
                className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <CategoryButton
                label="전체"
                active={activeCategoryId === "all"}
                onClick={() => setActiveCategoryId("all")}
              />
              {PLACE_CATEGORIES.map((category) => (
                <CategoryButton
                  key={category.id}
                  label={category.label}
                  active={activeCategoryId === category.id}
                  onClick={() => setActiveCategoryId(category.id)}
                />
              ))}
            </div>
          </header>

          {message ? (
            <div className="border-b border-[#f0c6be] bg-[#fff1ef] px-5 py-3 text-sm font-semibold text-[#9b2f25]">
              {message}
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto px-5 py-5">
            <section className="mb-5 rounded-md border border-[#d9e4dd] bg-white p-4">
              <div className="flex items-center gap-2">
                <UserRound size={18} />
                <strong>내 익명 닉네임</strong>
                <span className="ml-auto rounded-md bg-[#eef8f2] px-2 py-1 text-xs font-black text-[#0f7a5f]">
                  {profile.backend === "supabase" ? "Supabase" : "Local"}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={nicknameDraft}
                  onChange={(event) => setNicknameDraft(event.target.value)}
                  maxLength={24}
                  className="h-10 min-w-0 flex-1 rounded-md border border-[#d9e4dd] px-3 text-sm outline-none focus:border-[#0f7a5f]"
                />
                <button
                  type="button"
                  onClick={handleNicknameRandomize}
                  className="grid h-10 w-10 place-items-center rounded-md border border-[#d9e4dd] bg-white text-[#17352b] hover:border-[#0f7a5f]"
                  aria-label="닉네임 랜덤 생성"
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleNicknameSave}
                  className="h-10 rounded-md bg-[#17352b] px-3 text-sm font-black text-white hover:bg-[#0f7a5f]"
                >
                  저장
                </button>
              </div>
              {!isSupabaseConfigured() ? (
                <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#7a6a33]">
                  <ShieldCheck size={14} />
                  Supabase 설정이 준비되지 않아 브라우저 저장소로 동작합니다.
                </p>
              ) : null}
            </section>

            {panelMode === "new-place" ? (
              <PlaceForm
                ownerAnonymousId={profile.id}
                places={visiblePlaces}
                onCancel={() => setPanelMode("browse")}
                onSave={handleSavePlace}
              />
            ) : null}

            {panelMode === "edit-place" && selectedPlace ? (
              <PlaceForm
                ownerAnonymousId={profile.id}
                places={visiblePlaces}
                editingPlace={selectedPlace}
                onCancel={() => setPanelMode("browse")}
                onSave={handleSavePlace}
              />
            ) : null}

            {panelMode === "browse" ? (
              <div className="space-y-5">
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-lg font-black">
                      <Utensils size={20} />
                      맛집 목록
                    </h2>
                    <span className="text-sm font-bold text-[#70847b]">
                      {filteredPlaces.length}곳
                    </span>
                  </div>
                  <div className="space-y-3">
                    {filteredPlaces.map((place) => (
                      <PlaceListItem
                        key={place.id}
                        place={place}
                        active={place.id === selectedPlace?.id}
                        onClick={() => setSelectedPlaceId(place.id)}
                      />
                    ))}
                  </div>
                </section>

                {selectedPlace ? (
                  <section className="border-t border-[#d9e4dd] pt-5">
                    <PlaceDetail
                      place={selectedPlace}
                      reviews={selectedReviews}
                      profile={profile}
                      onEditPlace={() => setPanelMode("edit-place")}
                      onDeletePlace={() => handleDelete("place", selectedPlace.id)}
                      onReportPlace={() => handleReport("place", selectedPlace.id)}
                      onEditReview={setEditingReview}
                      onDeleteReview={(reviewId) => handleDelete("review", reviewId)}
                      onReportReview={(reviewId) => handleReport("review", reviewId)}
                    />
                    <div className="mt-5 rounded-md border border-[#d9e4dd] bg-white p-4">
                      <ReviewForm
                        key={editingReview?.id ?? selectedPlace.id}
                        placeId={selectedPlace.id}
                        profile={profile}
                        editingReview={editingReview}
                        onCancelEdit={() => setEditingReview(null)}
                        onSave={handleSaveReview}
                      />
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}

function CategoryButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 shrink-0 rounded-md border px-3 text-sm font-black transition ${
        active
          ? "border-[#17352b] bg-[#17352b] text-white"
          : "border-[#d9e4dd] bg-white text-[#17352b] hover:border-[#0f7a5f]"
      }`}
    >
      {label}
    </button>
  );
}

function PlaceListItem({
  place,
  active,
  onClick,
}: {
  place: Place;
  active: boolean;
  onClick: () => void;
}) {
  const category = categoryMap.get(place.categoryId);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md border bg-white p-3 text-left transition ${
        active ? "border-[#17352b] shadow-sm" : "border-[#d9e4dd] hover:border-[#0f7a5f]"
      }`}
    >
      <div className="flex gap-3">
        {place.heroImageUrl ? (
          <div
            className="h-20 w-20 shrink-0 rounded-md bg-cover bg-center"
            style={imageBackground(place.heroImageUrl)}
            aria-hidden="true"
          />
        ) : (
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-md bg-[#eef8f2] text-[#0f7a5f]">
            <Utensils size={24} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="truncate text-base font-black">{place.name}</h3>
            {category ? (
              <span className="shrink-0 rounded-md bg-[#eef8f2] px-2 py-1 text-xs font-black text-[#0f7a5f]">
                {category.label}
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-1 text-sm text-[#5f6f68]">{place.address}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {place.tagIds.slice(0, 3).map((tagId) => (
              <span
                key={tagId}
                className="rounded-md bg-[#f2f0e8] px-2 py-1 text-xs font-bold text-[#6d6047]"
              >
                {tagMap.get(tagId)?.label ?? tagId}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs font-bold text-[#70847b]">
            리뷰 {place.reviewCount ?? 0}개 · 재방문{" "}
            {Math.round((place.averageRevisitScore ?? 0) * 100)}%
          </p>
        </div>
      </div>
    </button>
  );
}

function PlaceDetail({
  place,
  reviews,
  profile,
  onEditPlace,
  onDeletePlace,
  onReportPlace,
  onEditReview,
  onDeleteReview,
  onReportReview,
}: {
  place: Place;
  reviews: Review[];
  profile: AnonymousProfile;
  onEditPlace: () => void;
  onDeletePlace: () => void;
  onReportPlace: () => void;
  onEditReview: (review: Review) => void;
  onDeleteReview: (reviewId: string) => void;
  onReportReview: (reviewId: string) => void;
}) {
  const category = categoryMap.get(place.categoryId);
  const ownsPlace = canMutateContent(profile.id, place);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md border border-[#d9e4dd] bg-white">
        {place.heroImageUrl ? (
          <div
            className="h-52 w-full bg-cover bg-center"
            style={imageBackground(place.heroImageUrl)}
            aria-hidden="true"
          />
        ) : null}
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {category ? (
                  <span className="rounded-md bg-[#eef8f2] px-2 py-1 text-xs font-black text-[#0f7a5f]">
                    {category.label}
                  </span>
                ) : null}
                {place.tagIds.map((tagId) => (
                  <span
                    key={tagId}
                    className="rounded-md bg-[#f2f0e8] px-2 py-1 text-xs font-bold text-[#6d6047]"
                  >
                    {tagMap.get(tagId)?.label ?? tagId}
                  </span>
                ))}
              </div>
              <h2 className="mt-3 text-2xl font-black">{place.name}</h2>
              <p className="mt-2 flex items-center gap-2 text-sm text-[#5f6f68]">
                <MapPin size={16} />
                {place.address}
              </p>
            </div>
            <button
              type="button"
              onClick={onReportPlace}
              className="grid h-9 w-9 place-items-center rounded-md border border-[#d9e4dd] bg-white text-[#70847b] hover:border-[#e85d4f] hover:text-[#e85d4f]"
              aria-label="가게 신고"
            >
              <Flag size={16} />
            </button>
          </div>

          {ownsPlace ? (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onEditPlace}
                className="flex h-10 items-center gap-2 rounded-md border border-[#d9e4dd] bg-white px-3 text-sm font-black text-[#17352b] hover:border-[#0f7a5f]"
              >
                <Pencil size={16} />
                수정
              </button>
              <button
                type="button"
                onClick={onDeletePlace}
                className="flex h-10 items-center gap-2 rounded-md border border-[#f0c6be] bg-[#fff7f6] px-3 text-sm font-black text-[#b33a30] hover:border-[#b33a30]"
              >
                <Trash2 size={16} />
                삭제
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-black">투명한 리뷰</h3>
          <span className="text-sm font-bold text-[#70847b]">{reviews.length}개</span>
        </div>
        <div className="space-y-3">
          {reviews.length ? (
            reviews.map((review) => (
              <ReviewItem
                key={review.id}
                review={review}
                isOwner={canMutateContent(profile.id, review)}
                onEdit={() => onEditReview(review)}
                onDelete={() => onDeleteReview(review.id)}
                onReport={() => onReportReview(review.id)}
              />
            ))
          ) : (
            <div className="rounded-md border border-dashed border-[#b8c9c0] bg-white p-4 text-sm font-semibold text-[#70847b]">
              아직 리뷰가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewItem({
  review,
  isOwner,
  onEdit,
  onDelete,
  onReport,
}: {
  review: Review;
  isOwner: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
}) {
  return (
    <article className="rounded-md border border-[#d9e4dd] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <strong>{review.nickname}</strong>
          <p className="mt-1 text-xs font-bold text-[#70847b]">
            {review.priceRange} · {revisitLabel(review.revisitIntent)}
            {review.createdAt ? ` · ${formatDate(review.createdAt)}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onReport}
          className="grid h-8 w-8 place-items-center rounded-md border border-[#d9e4dd] bg-white text-[#70847b] hover:border-[#e85d4f] hover:text-[#e85d4f]"
          aria-label="리뷰 신고"
        >
          <Flag size={14} />
        </button>
      </div>
      {review.imageUrl ? (
        <div
          className="mt-3 h-40 w-full rounded-md bg-cover bg-center"
          style={imageBackground(review.imageUrl)}
          aria-hidden="true"
        />
      ) : null}
      <dl className="mt-3 grid gap-3 text-sm">
        <div>
          <dt className="font-black text-[#17352b]">추천 메뉴</dt>
          <dd className="mt-1 text-[#52635b]">{review.recommendedMenu}</dd>
        </div>
        <div>
          <dt className="font-black text-[#17352b]">좋았던 점</dt>
          <dd className="mt-1 text-[#52635b]">{review.goodPoint}</dd>
        </div>
        <div>
          <dt className="font-black text-[#17352b]">아쉬운 점</dt>
          <dd className="mt-1 text-[#52635b]">{review.badPoint}</dd>
        </div>
      </dl>
      {isOwner ? (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-9 items-center gap-2 rounded-md border border-[#d9e4dd] bg-white px-3 text-sm font-black text-[#17352b] hover:border-[#0f7a5f]"
          >
            <Pencil size={15} />
            수정
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-9 items-center gap-2 rounded-md border border-[#f0c6be] bg-[#fff7f6] px-3 text-sm font-black text-[#b33a30] hover:border-[#b33a30]"
          >
            <Trash2 size={15} />
            삭제
          </button>
        </div>
      ) : null}
    </article>
  );
}

function revisitLabel(value: Review["revisitIntent"]) {
  if (value === "yes") {
    return "재방문 의사 있음";
  }

  if (value === "maybe") {
    return "재방문 고민";
  }

  return "재방문 안 함";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function imageBackground(url: string) {
  return {
    backgroundImage: `url(${JSON.stringify(url)})`,
  };
}
