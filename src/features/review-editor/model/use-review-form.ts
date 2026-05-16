"use client";

import { useState, type FormEvent } from "react";
import {
  type AnonymousProfile,
  type PriceRange,
  type Review,
  type RevisitIntent,
} from "@/entities/community";

export type ReviewFormProps = {
  placeId: string;
  profile: AnonymousProfile;
  editingReview?: Review | null;
  onCancelEdit?: () => void;
  onSave: (input: {
    id?: string;
    review: Omit<Review, "id" | "status" | "createdAt">;
    imageFile?: File | null;
  }) => Promise<void>;
};

type UseReviewFormOptions = Omit<ReviewFormProps, "onCancelEdit">;

export function useReviewForm({ placeId, profile, editingReview, onSave }: UseReviewFormOptions) {
  const [nickname, setNickname] = useState(editingReview?.nickname ?? profile.nickname);
  const [priceRange, setPriceRange] = useState<PriceRange>(
    editingReview?.priceRange ?? "1만원 이하"
  );
  const [recommendedMenu, setRecommendedMenu] = useState(editingReview?.recommendedMenu ?? "");
  const [goodPoint, setGoodPoint] = useState(editingReview?.goodPoint ?? "");
  const [badPoint, setBadPoint] = useState(editingReview?.badPoint ?? "");
  const [revisitIntent, setRevisitIntent] = useState<RevisitIntent>(
    editingReview?.revisitIntent ?? "yes"
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!recommendedMenu.trim() || !goodPoint.trim() || !badPoint.trim()) {
      setMessage("추천 메뉴, 좋았던 점, 아쉬운 점을 모두 적어주세요.");
      return;
    }

    setIsSaving(true);

    try {
      await onSave({
        id: editingReview?.id,
        review: {
          placeId,
          nickname,
          priceRange,
          recommendedMenu,
          goodPoint,
          badPoint,
          revisitIntent,
          ownerAnonymousId: profile.id,
          imageUrl: editingReview?.imageUrl,
        },
        imageFile,
      });
      setRecommendedMenu("");
      setGoodPoint("");
      setBadPoint("");
      setRevisitIntent("yes");
      setImageFile(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "리뷰 저장 실패");
    } finally {
      setIsSaving(false);
    }
  }

  return {
    nickname,
    setNickname,
    priceRange,
    setPriceRange,
    recommendedMenu,
    setRecommendedMenu,
    goodPoint,
    setGoodPoint,
    badPoint,
    setBadPoint,
    revisitIntent,
    setRevisitIntent,
    setImageFile,
    message,
    isSaving,
    handleSubmit,
  };
}
