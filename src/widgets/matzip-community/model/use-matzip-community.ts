"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type CategoryId,
  type Place,
  type PlaceDraft,
  type Review,
  attachPlaceStats,
  ensureAnonymousProfile,
  getVisiblePlaces,
  isSupabaseConfigured,
  loadCommunityData,
  makeAnonymousNickname,
  reportContent,
  savePlace,
  saveReview,
  softDeleteContent,
  updateNickname,
  type AnonymousProfile,
} from "@/entities/community";

export type PanelMode = "browse" | "new-place" | "edit-place";

export function useMatzipCommunity() {
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

  return {
    profile,
    selectedPlaceId,
    setSelectedPlaceId,
    panelMode,
    setPanelMode,
    activeCategoryId,
    setActiveCategoryId,
    query,
    setQuery,
    nicknameDraft,
    setNicknameDraft,
    editingReview,
    setEditingReview,
    isBooting,
    message,
    visiblePlaces,
    filteredPlaces,
    selectedPlace,
    selectedReviews,
    isSupabaseReady: isSupabaseConfigured(),
    handleNicknameSave,
    handleNicknameRandomize,
    handleSavePlace,
    handleSaveReview,
    handleDelete,
    handleReport,
  };
}
