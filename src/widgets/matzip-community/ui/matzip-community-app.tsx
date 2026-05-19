"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Flag,
  MapPin,
  MessageSquarePlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  Utensils,
} from "lucide-react";
import {
  PLACE_CATEGORIES,
  PLACE_TAGS,
  type AnonymousProfile,
  type Place,
  type Review,
  canMutateContent,
} from "@/entities/community";
import { PlaceForm } from "@/features/place-editor";
import { NaverMap } from "@/features/place-map";
import { buildCandidateDetailHref, type NearbyPlaceCandidate } from "@/features/naver-place-import";
import { ImageCarousel } from "@/shared/ui/image-carousel";
import { useMatzipCommunity } from "../model/use-matzip-community";

const categoryMap = new Map<string, (typeof PLACE_CATEGORIES)[number]>(
  PLACE_CATEGORIES.map((item) => [item.id, item])
);
const tagMap = new Map<string, (typeof PLACE_TAGS)[number]>(
  PLACE_TAGS.map((item) => [item.id, item])
);
const VIRTUAL_REVIEW_THRESHOLD = 8;
const REVIEW_CARD_ESTIMATED_HEIGHT = 260;
const REVIEW_LIST_MAX_HEIGHT = 640;
const REVIEW_LIST_OVERSCAN = 3;

export function MatzipCommunityApp({ initialSearchQuery = "" }: { initialSearchQuery?: string }) {
  const router = useRouter();
  const community = useMatzipCommunity(initialSearchQuery);
  const {
    profile,
    panelMode,
    setPanelMode,
    activeCategoryId,
    setActiveCategoryId,
    query,
    setQuery,
    appliedQuery,
    nicknameDraft,
    setNicknameDraft,
    setEditingReview,
    isBooting,
    message,
    candidateMessage,
    isLoadingCandidates,
    userLocation,
    mapFocusLocation,
    locationStatus,
    locationFocusKey,
    visiblePlaces,
    filteredPlaces,
    filteredCandidates,
    mapPlaces,
    selectedPlace,
    handleRequestUserLocation,
    handleVisibleBoundsChange,
    handleSearchSubmit,
    handleNicknameSave,
    handleNicknameRandomize,
    handleSavePlace,
  } = community;
  const candidateById = new Map(
    filteredCandidates.map((candidate) => [candidate.tempId, candidate])
  );

  function openMapPlace(placeId: string) {
    const candidate = candidateById.get(placeId);

    if (candidate) {
      router.push(buildCandidateDetailHref(candidate));
      return;
    }

    router.push(`/places/${placeId}`);
  }

  async function handleSavePlaceAndOpen(input: Parameters<typeof handleSavePlace>[0]) {
    const saved = await handleSavePlace(input);

    if (saved) {
      router.push(`/places/${saved.id}`);
    }
  }

  function handleRequestUserLocationAndClearSearch() {
    handleRequestUserLocation();
    router.replace("/");
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
          places={mapPlaces}
          selectedPlaceId={selectedPlace?.id}
          userLocation={userLocation}
          focusLocation={mapFocusLocation}
          locationStatus={locationStatus}
          locationFocusKey={locationFocusKey}
          onSelectPlace={openMapPlace}
          onRequestUserLocation={handleRequestUserLocationAndClearSearch}
          onVisibleBoundsChange={handleVisibleBoundsChange}
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

            <form
              onSubmit={(event) => {
                event.preventDefault();
                const nextQuery = query.trim();
                handleSearchSubmit();
                router.replace(nextQuery ? `/?search=${encodeURIComponent(nextQuery)}` : "/");
              }}
              className="mt-4 flex items-center gap-2 rounded-md border border-[#d9e4dd] bg-white px-3"
            >
              <Search size={18} className="shrink-0 text-[#70847b]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="역, 동네, 음식점 검색"
                className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <button
                type="submit"
                className="my-1 flex h-9 shrink-0 items-center gap-1 rounded-md bg-[#17352b] px-3 text-sm font-black text-white transition hover:bg-[#0f7a5f]"
              >
                <Search size={15} />
                검색하기
              </button>
            </form>

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
                  Supabase
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
            </section>

            {panelMode === "new-place" ? (
              <PlaceForm
                ownerAnonymousId={profile.id}
                places={visiblePlaces}
                onCancel={() => setPanelMode("browse")}
                onSave={handleSavePlaceAndOpen}
              />
            ) : null}

            {panelMode === "edit-place" && selectedPlace ? (
              <PlaceForm
                ownerAnonymousId={profile.id}
                places={visiblePlaces}
                editingPlace={selectedPlace}
                onCancel={() => setPanelMode("browse")}
                onSave={handleSavePlaceAndOpen}
              />
            ) : null}

            {panelMode === "browse" ? (
              <div className="space-y-5">
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-lg font-black">
                      <Utensils size={20} />
                      {appliedQuery ? `${appliedQuery} 주변 음식점` : "현재 지도 음식점"}
                    </h2>
                    <span className="text-sm font-bold text-[#70847b]">
                      {filteredPlaces.length + filteredCandidates.length}곳
                    </span>
                  </div>
                  <div className="space-y-3">
                    {filteredPlaces.map((place) => (
                      <PlaceListItem
                        key={place.id}
                        place={place}
                        active={place.id === selectedPlace?.id}
                        onClick={() => router.push(`/places/${place.id}`)}
                      />
                    ))}
                    {filteredCandidates.map((candidate) => (
                      <CandidateListItem
                        key={candidate.tempId}
                        candidate={candidate}
                        onClick={() => router.push(buildCandidateDetailHref(candidate))}
                      />
                    ))}
                    {!filteredPlaces.length && !filteredCandidates.length ? (
                      <div className="rounded-md border border-dashed border-[#b8c9c0] bg-white p-4 text-sm font-semibold text-[#70847b]">
                        현재 지도 화면에 표시할 맛집이 없습니다.
                      </div>
                    ) : null}
                  </div>
                </section>

                {isLoadingCandidates ? (
                  <div className="rounded-md border border-[#d9e4dd] bg-white p-3 text-sm font-semibold text-[#52635b]">
                    네이버 후보를 찾는 중입니다.
                  </div>
                ) : null}
                {candidateMessage ? (
                  <div className="rounded-md border border-[#f3c57a] bg-[#fff8e7] p-3 text-sm font-semibold text-[#765018]">
                    {candidateMessage}
                  </div>
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
  place: Place & { distanceMeters?: number };
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

function CandidateListItem({
  candidate,
  onClick,
}: {
  candidate: NearbyPlaceCandidate;
  onClick: () => void;
}) {
  const category = categoryMap.get(candidate.categoryId);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-dashed border-[#8fb9a8] bg-white p-3 text-left transition hover:border-[#0f7a5f]"
    >
      <div className="flex gap-3">
        {candidate.heroImageUrl ? (
          <div
            className="h-20 w-20 shrink-0 rounded-md bg-cover bg-center"
            style={imageBackground(candidate.heroImageUrl)}
            aria-hidden="true"
          />
        ) : (
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-md bg-[#eef8f2] text-[#0f7a5f]">
            <Utensils size={24} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="truncate text-base font-black">{candidate.name}</h3>
            <span className="shrink-0 rounded-md bg-[#fff8e7] px-2 py-1 text-xs font-black text-[#765018]">
              네이버 음식점
            </span>
            {category ? (
              <span className="shrink-0 rounded-md bg-[#eef8f2] px-2 py-1 text-xs font-black text-[#0f7a5f]">
                {category.label}
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-1 text-sm text-[#5f6f68]">{candidate.address}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {candidate.tagIds.slice(0, 3).map((tagId) => (
              <span
                key={tagId}
                className="rounded-md bg-[#f2f0e8] px-2 py-1 text-xs font-bold text-[#6d6047]"
              >
                {tagMap.get(tagId)?.label ?? tagId}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs font-bold text-[#70847b]">첫 리뷰를 쓰면 저장됩니다.</p>
        </div>
      </div>
    </button>
  );
}

export function PlaceDetail({
  place,
  reviews,
  profile,
  onEditPlace,
  onDeletePlace,
  onReportPlace,
  onWriteReview,
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
  onWriteReview: () => void;
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
        {place.photoUrls?.length ? (
          <div className="flex gap-2 overflow-x-auto border-b border-[#edf3ef] px-4 py-3">
            {place.photoUrls.slice(0, 8).map((photoUrl) => (
              <div
                key={photoUrl}
                className="h-20 w-28 shrink-0 rounded-md bg-cover bg-center"
                style={imageBackground(photoUrl)}
                aria-hidden="true"
              />
            ))}
          </div>
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
              <h1 className="mt-3 text-2xl font-black">{place.name}</h1>
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
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-black">리뷰 리스트</h3>
            <span className="mt-1 block text-sm font-bold text-[#70847b]">{reviews.length}개</span>
          </div>
          <button
            type="button"
            onClick={onWriteReview}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#0f7a5f] px-4 text-sm font-black text-white transition hover:bg-[#0b5f4a] sm:w-auto"
          >
            <MessageSquarePlus size={16} />
            리뷰쓰기
          </button>
        </div>
        <ReviewList
          reviews={reviews}
          profile={profile}
          onEditReview={onEditReview}
          onDeleteReview={onDeleteReview}
          onReportReview={onReportReview}
        />
      </div>
    </div>
  );
}

function ReviewList({
  reviews,
  profile,
  onEditReview,
  onDeleteReview,
  onReportReview,
}: {
  reviews: Review[];
  profile: AnonymousProfile;
  onEditReview: (review: Review) => void;
  onDeleteReview: (reviewId: string) => void;
  onReportReview: (reviewId: string) => void;
}) {
  if (!reviews.length) {
    return (
      <div className="rounded-md border border-dashed border-[#b8c9c0] bg-white p-4 text-sm font-semibold text-[#70847b]">
        아직 리뷰가 없습니다.
      </div>
    );
  }

  if (reviews.length < VIRTUAL_REVIEW_THRESHOLD) {
    return (
      <div className="space-y-3">
        {reviews.map((review) => (
          <ReviewItem
            key={review.id}
            review={review}
            isOwner={canMutateContent(profile.id, review)}
            onEdit={() => onEditReview(review)}
            onDelete={() => onDeleteReview(review.id)}
            onReport={() => onReportReview(review.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <VirtualReviewList
      reviews={reviews}
      profile={profile}
      onEditReview={onEditReview}
      onDeleteReview={onDeleteReview}
      onReportReview={onReportReview}
    />
  );
}

function VirtualReviewList({
  reviews,
  profile,
  onEditReview,
  onDeleteReview,
  onReportReview,
}: {
  reviews: Review[];
  profile: AnonymousProfile;
  onEditReview: (review: Review) => void;
  onDeleteReview: (reviewId: string) => void;
  onReportReview: (reviewId: string) => void;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const viewportHeight = Math.min(
    REVIEW_LIST_MAX_HEIGHT,
    reviews.length * REVIEW_CARD_ESTIMATED_HEIGHT
  );
  const { startIndex, endIndex } = useMemo(
    () => getVirtualReviewRange(reviews.length, scrollTop, viewportHeight),
    [reviews.length, scrollTop, viewportHeight]
  );
  const visibleReviews = reviews.slice(startIndex, endIndex);
  const topSpacerHeight = startIndex * REVIEW_CARD_ESTIMATED_HEIGHT;
  const bottomSpacerHeight = (reviews.length - endIndex) * REVIEW_CARD_ESTIMATED_HEIGHT;

  return (
    <div
      data-testid="review-list-viewport"
      className="overflow-y-auto overscroll-contain rounded-md border border-[#d9e4dd] bg-[#fbfdfb] p-3"
      style={{ height: viewportHeight }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ paddingTop: topSpacerHeight, paddingBottom: bottomSpacerHeight }}>
        <div className="space-y-3">
          {visibleReviews.map((review) => (
            <ReviewItem
              key={review.id}
              review={review}
              isOwner={canMutateContent(profile.id, review)}
              onEdit={() => onEditReview(review)}
              onDelete={() => onDeleteReview(review.id)}
              onReport={() => onReportReview(review.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function getVirtualReviewRange(totalCount: number, scrollTop: number, viewportHeight: number) {
  const firstVisibleIndex = Math.floor(scrollTop / REVIEW_CARD_ESTIMATED_HEIGHT);
  const visibleCount = Math.ceil(viewportHeight / REVIEW_CARD_ESTIMATED_HEIGHT);
  const startIndex = Math.max(0, firstVisibleIndex - REVIEW_LIST_OVERSCAN);
  const endIndex = Math.min(totalCount, firstVisibleIndex + visibleCount + REVIEW_LIST_OVERSCAN);

  return { startIndex, endIndex };
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
  const imageUrls = getReviewImageUrls(review);

  return (
    <article
      data-testid="review-card"
      className="rounded-md border border-[#d9e4dd] bg-white p-4 shadow-sm"
    >
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
      {imageUrls.length ? (
        <ImageCarousel
          imageUrls={imageUrls}
          label={`${review.nickname} 리뷰 사진`}
          className="mt-3"
          viewportClassName="h-40"
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

function getReviewImageUrls(review: Review) {
  if (review.imageUrls?.length) {
    return review.imageUrls;
  }

  return review.imageUrl ? [review.imageUrl] : [];
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
