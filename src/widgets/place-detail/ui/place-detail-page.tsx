"use client";

import { ArrowLeft, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
            onEditReview={setEditingReview}
            onDeleteReview={(reviewId) => handleDelete("review", reviewId)}
            onReportReview={(reviewId) => handleReport("review", reviewId)}
          />
          <ReviewCard>
            <ReviewForm
              key={editingReview?.id ?? place.id}
              placeId={place.id}
              profile={profile}
              editingReview={editingReview}
              onCancelEdit={() => setEditingReview(null)}
              onSave={handleSaveReview}
            />
          </ReviewCard>
        </>
      )}
    </DetailPageFrame>
  );
}

export function CandidatePlaceDetailPage({ candidate }: { candidate: NaverPlaceCandidate | null }) {
  const router = useRouter();
  const [profile, setProfile] = useState<AnonymousProfile | null>(null);
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
        onEditReview={() => undefined}
        onDeleteReview={() => undefined}
        onReportReview={() => undefined}
      />
      <ReviewCard>
        <ReviewForm placeId="candidate" profile={profile} onSave={handleSaveCandidateReview} />
      </ReviewCard>
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

function ReviewCard({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-[#d9e4dd] bg-white p-4">{children}</div>;
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
