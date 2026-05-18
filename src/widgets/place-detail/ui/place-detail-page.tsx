"use client";

import { ArrowLeft, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  type AnonymousProfile,
  type Place,
  type PlaceDraft,
  type Review,
  attachPlaceStats,
  ensureAnonymousProfile,
  getVisiblePlaces,
  loadCommunityData,
  reportContent,
  savePlace,
  saveReview,
  softDeleteContent,
} from "@/entities/community";
import { PlaceForm } from "@/features/place-editor";
import type { NaverPlaceCandidate } from "@/features/naver-place-import";
import { ReviewForm } from "@/features/review-editor";
import { PlaceDetail } from "@/widgets/matzip-community/ui/matzip-community-app";

export function SavedPlaceDetailPage({ placeId }: { placeId: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<AnonymousProfile | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isEditingPlace, setIsEditingPlace] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [message, setMessage] = useState("");

  const visibleReviews = useMemo(
    () => reviews.filter((review) => review.status === "public"),
    [reviews]
  );
  const visiblePlaces = useMemo(
    () => getVisiblePlaces(places).map((place) => attachPlaceStats(place, visibleReviews)),
    [places, visibleReviews]
  );
  const place = visiblePlaces.find((item) => item.id === placeId) ?? null;
  const selectedReviews = visibleReviews.filter((review) => review.placeId === placeId);

  async function refreshData() {
    const data = await loadCommunityData();
    setPlaces(data.places);
    setReviews(data.reviews);
  }

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
        setPlaces(data.places);
        setReviews(data.reviews);
      } catch (error) {
        if (!ignore) {
          setMessage(error instanceof Error ? error.message : "상세 정보를 불러오지 못했습니다.");
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

  async function handleSavePlace(input: {
    id?: string;
    draft: PlaceDraft;
    imageFile?: File | null;
  }) {
    if (!profile) {
      return;
    }

    await savePlace({
      ...input,
      activeAnonymousId: profile.id,
    });
    setIsEditingPlace(false);
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

    await saveReview({
      ...input,
      activeAnonymousId: profile.id,
    });
    await refreshData();
    handleCloseReviewModal();
  }

  function handleOpenNewReviewModal() {
    setEditingReview(null);
    setIsReviewModalOpen(true);
  }

  function handleOpenEditReviewModal(review: Review) {
    setEditingReview(review);
    setIsReviewModalOpen(true);
  }

  function handleCloseReviewModal() {
    setIsReviewModalOpen(false);
    setEditingReview(null);
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
      router.push("/");
      return;
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
    return <DetailShell message="맛집 상세를 준비 중" />;
  }

  if (!profile || message) {
    return <DetailShell message={message || "익명 프로필을 만들지 못했습니다."} />;
  }

  if (!place) {
    return <DetailShell message="공개된 맛집을 찾지 못했습니다." />;
  }

  return (
    <DetailPageFrame>
      {isEditingPlace ? (
        <section className="rounded-md border border-[#d9e4dd] bg-white p-4">
          <PlaceForm
            ownerAnonymousId={profile.id}
            places={visiblePlaces}
            editingPlace={place}
            onCancel={() => setIsEditingPlace(false)}
            onSave={handleSavePlace}
          />
        </section>
      ) : (
        <>
          <PlaceDetail
            place={place}
            reviews={selectedReviews}
            profile={profile}
            onEditPlace={() => setIsEditingPlace(true)}
            onDeletePlace={() => handleDelete("place", place.id)}
            onReportPlace={() => handleReport("place", place.id)}
            onWriteReview={handleOpenNewReviewModal}
            onEditReview={handleOpenEditReviewModal}
            onDeleteReview={(reviewId) => handleDelete("review", reviewId)}
            onReportReview={(reviewId) => handleReport("review", reviewId)}
          />
          <ReviewModal
            isOpen={isReviewModalOpen}
            title={editingReview ? "리뷰 수정" : "리뷰 쓰기"}
            onClose={handleCloseReviewModal}
          >
            <ReviewForm
              key={editingReview?.id ?? `new-${place.id}`}
              placeId={place.id}
              profile={profile}
              editingReview={editingReview}
              onCancelEdit={handleCloseReviewModal}
              onSave={handleSaveReview}
            />
          </ReviewModal>
        </>
      )}
    </DetailPageFrame>
  );
}

export function CandidatePlaceDetailPage({ candidate }: { candidate: NaverPlaceCandidate | null }) {
  const router = useRouter();
  const [profile, setProfile] = useState<AnonymousProfile | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    async function boot() {
      setIsBooting(true);
      setMessage("");

      try {
        const nextProfile = await ensureAnonymousProfile();

        if (!ignore) {
          setProfile(nextProfile);
        }
      } catch (error) {
        if (!ignore) {
          setMessage(error instanceof Error ? error.message : "익명 프로필을 만들지 못했습니다.");
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

  async function handleSaveCandidateReview(input: {
    id?: string;
    review: Omit<Review, "id" | "status" | "createdAt">;
    imageFile?: File | null;
  }) {
    if (!profile || !candidate) {
      return;
    }

    const savedPlace = await savePlace({
      activeAnonymousId: profile.id,
      draft: {
        naverPlaceKey: candidate.naverPlaceKey,
        name: candidate.name,
        address: candidate.address,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        categoryId: candidate.categoryId,
        tagIds: candidate.tagIds,
        ownerAnonymousId: profile.id,
        heroImageUrl: candidate.heroImageUrl,
        photoUrls: candidate.photoUrls,
      },
    });

    await saveReview({
      activeAnonymousId: profile.id,
      imageFile: input.imageFile,
      review: {
        ...input.review,
        placeId: savedPlace.id,
        ownerAnonymousId: profile.id,
      },
    });

    router.replace(`/places/${savedPlace.id}`);
  }

  if (isBooting) {
    return <DetailShell message="맛집 후보를 준비 중" />;
  }

  if (!profile || message) {
    return <DetailShell message={message || "익명 프로필을 만들지 못했습니다."} />;
  }

  if (!candidate) {
    return <DetailShell message="열 수 없는 네이버 후보입니다." />;
  }

  const candidatePlace: Place = {
    id: "candidate",
    naverPlaceKey: candidate.naverPlaceKey,
    name: candidate.name,
    address: candidate.address,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    categoryId: candidate.categoryId,
    tagIds: candidate.tagIds,
    ownerAnonymousId: "naver-candidate",
    heroImageUrl: candidate.heroImageUrl,
    photoUrls: candidate.photoUrls,
    status: "public",
    reviewCount: 0,
    averageRevisitScore: 0,
  };

  return (
    <DetailPageFrame>
      <PlaceDetail
        place={candidatePlace}
        reviews={[]}
        profile={profile}
        onEditPlace={() => undefined}
        onDeletePlace={() => undefined}
        onReportPlace={() => window.alert("저장 전 네이버 후보입니다.")}
        onWriteReview={() => setIsReviewModalOpen(true)}
        onEditReview={() => undefined}
        onDeleteReview={() => undefined}
        onReportReview={() => undefined}
      />
      <ReviewModal
        isOpen={isReviewModalOpen}
        title="리뷰 쓰기"
        onClose={() => setIsReviewModalOpen(false)}
      >
        <ReviewForm placeId="candidate" profile={profile} onSave={handleSaveCandidateReview} />
      </ReviewModal>
    </DetailPageFrame>
  );
}

function DetailPageFrame({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#f6faf7] px-4 py-5 text-[#17352b] sm:px-6">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mb-4 flex h-10 items-center gap-2 rounded-md border border-[#d9e4dd] bg-white px-3 text-sm font-black text-[#17352b] hover:border-[#0f7a5f]"
        >
          <ArrowLeft size={16} />
          지도
        </button>
        <div className="space-y-5">{children}</div>
      </div>
    </main>
  );
}

function DetailShell({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f6faf7] p-6 text-[#17352b]">
      <div className="flex max-w-md items-center gap-3 rounded-md border border-[#d9e4dd] bg-white px-5 py-4 font-black shadow-sm">
        <RefreshCw size={20} className="shrink-0 animate-spin" />
        {message}
      </div>
    </main>
  );
}

function ReviewModal({
  isOpen,
  title,
  onClose,
  children,
}: {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useLockedBodyScroll(isOpen);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isMounted || !isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end bg-[#10231dcc] px-3 py-3 sm:items-center sm:justify-center sm:px-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-[#d9e4dd] bg-white shadow-xl sm:max-h-[min(88vh,760px)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-[#edf3ef] px-4 py-3">
          <h2 id="review-modal-title" className="text-lg font-black text-[#17352b]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-md border border-[#d9e4dd] bg-white text-[#17352b] hover:border-[#0f7a5f]"
            aria-label="리뷰 작성 닫기"
          >
            <X size={16} />
          </button>
        </header>
        <div className="overflow-y-auto overscroll-contain p-4">{children}</div>
      </section>
    </div>,
    document.body
  );
}

function useLockedBodyScroll(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) {
      return;
    }

    const scrollY = window.scrollY;
    const { style } = document.body;
    const previousStyle = {
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      width: style.width,
      overflow: style.overflow,
    };

    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.left = "0";
    style.right = "0";
    style.width = "100%";
    style.overflow = "hidden";

    return () => {
      style.position = previousStyle.position;
      style.top = previousStyle.top;
      style.left = previousStyle.left;
      style.right = previousStyle.right;
      style.width = previousStyle.width;
      style.overflow = previousStyle.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [isLocked]);
}
